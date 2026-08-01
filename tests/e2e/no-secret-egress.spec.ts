// T089 -- Constitution III, SC-004: the build path is 100% client-side.
//
// The promise in README.md is that the root password, the Wi-Fi passphrases, the
// WireGuard keys and the API tokens are assembled in the browser and POSTed
// straight to the OpenWrt build server the user chose -- and that they never pass
// through a WrtNova backend. That is a claim about EVERY request the page makes,
// not about the one request that submits the build, so this file audits every
// request to a WrtNova origin during a complete build rather than inspecting the
// ASU POST and calling it proved.
//
// Three things are asserted, and all three are needed:
//
//   1. No WrtNova-origin request carries a secret, in its URL, its headers or its
//      body -- checked in plain text, base64 and percent-encoded form, because
//      "we did not put it there" is not the same as "it is not there".
//   2. The set of WrtNova origins reached is inside a known list. A future page
//      that adds a build-shaped endpoint fails here even if its body happens to
//      look clean today.
//   3. The ASU POST *did* carry every secret. Without this the whole file passes
//      just as well when the form was never filled in.

import { expect, test } from '@playwright/test';
import { DEVICE, mockOpenWrt, pickDevice, railItem, recordRequests } from './fixtures';

/**
 * One sentinel per class of secret the constitution names. Each is unique and
 * unguessable, so finding one anywhere is unambiguous evidence of where it went.
 */
const SECRETS = {
  ROOT_PASSWD: 'sentinel-root-pw-9f2ba71c',
  LAN_WIFI_PASSWD: 'sentinel-lan-psk-4d8e0a53',
  GUEST_WIFI_PASSWD: 'sentinel-guest-psk-1c7b95fe',
  WG_PRIVATE_KEY: 'sentinel-wg-private-6ea4c208',
  PRESHARED_KEY: 'sentinel-wg-psk-b3910df6',
  CLOUDFLARE_API_KEY: 'sentinel-cf-token-27e5aa84',
} as const;

/** Plain, base64, and percent-encoded. A secret can only leave in one of these. */
function forms(secret: string): string[] {
  return [secret, Buffer.from(secret).toString('base64'), encodeURIComponent(secret)];
}

/**
 * The WrtNova-origin paths a build is allowed to touch. The first four are the
 * application itself under the dev server; the rest are the endpoints the pages
 * legitimately have, none of which is handed anything of the user's:
 *
 *   /wrtnova.sh      the provisioning script, fetched to be sliced on the marker
 *   /api/session     the cookie /api/warp/register requires (Constitution VI)
 *   /api/warp/register  returns an identity Cloudflare created for this browser
 *   /api/asu-servers the operator's list of build servers to choose between
 *   /tzdata.lua, /countries.txt, /banip-feeds.txt   static option lists
 */
const ALLOWED_PREFIXES = [
  '/@vite/',
  '/@react-refresh',
  '/@fs/',
  '/@id/',
  '/node_modules/',
  '/src/',
  '/fonts/',
  '/builder/',
  '/networks/',
  '/favicon.svg',
  '/wrtnova.sh',
  '/api/session',
  '/api/warp/register',
  '/api/asu-servers',
  '/tzdata.lua',
  '/countries.txt',
  '/banip-feeds.txt',
];

test('no secret reaches a WrtNova origin during a full build', async ({ page, baseURL }) => {
  const mock = await mockOpenWrt(page, { mode: 'queued' });
  const seen = recordRequests(page);

  await page.goto('/builder/');
  await pickDevice(page, 'device', DEVICE.title);

  // The root password. It is also what the AdGuard admin hash is derived from,
  // so this one field reaches two emitted keys.
  await railItem(page, 'System').click();
  await page.locator('#ROOT_PASSWD').fill(SECRETS.ROOT_PASSWD);

  // Both Wi-Fi passphrases.
  await railItem(page, 'WiFi').click();
  await page.locator('#LAN_WIFI_PASSWD').fill(SECRETS.LAN_WIFI_PASSWD);
  await page.locator('#GUEST_WIFI_PASSWD').fill(SECRETS.GUEST_WIFI_PASSWD);

  // The tunnel keys and the DDNS API token.
  await railItem(page, 'VPN & exposure').click();
  await page.locator('#WG_ENABLE').click();
  await page.locator('#WG_PRIVATE_KEY').fill(SECRETS.WG_PRIVATE_KEY);
  await page.locator('#PEER_PUBLIC_KEY').fill('cGVlci1wdWJsaWMta2V5LW5vdC1hLXNlY3JldA==');
  await page.locator('#ENDPOINT').fill('vpn.example.com:51820');
  await page.locator('#WG_IPV4').fill('172.16.0.2/32');
  await page.locator('#PRESHARED_KEY').fill(SECRETS.PRESHARED_KEY);
  await page.locator('#DDNS_ENABLE').click();
  await page.locator('#LOOKUP_HOSTNAME').fill('ddns.example.com');
  await page.locator('#CLOUDFLARE_API_KEY').fill(SECRETS.CLOUDFLARE_API_KEY);

  // Visited so the page asks the operator which build servers it offers -- one of
  // the WrtNova-origin requests this audit most needs in the record. (The picker
  // itself stays hidden with only one server on offer, which is the case here.)
  await railItem(page, 'Advanced options').click();
  await expect(page.getByRole('heading', { name: 'Performance & misc' })).toBeVisible();
  await expect
    .poll(() => seen.some((r) => r.url.endsWith('/api/asu-servers')))
    .toBe(true);

  await railItem(page, 'System').click();
  await page.getByRole('button', { name: 'Build firmware' }).click();
  await expect(page.getByRole('heading', { name: 'Images' })).toBeVisible({ timeout: 45_000 });

  // -- 3. the build really did carry the secrets ------------------------------

  expect(mock.asuPosts).toHaveLength(1);
  const submitted = mock.asuPosts[0]!;
  expect(new URL(submitted.url).origin).toBe('https://sysupgrade.openwrt.org');
  for (const [key, secret] of Object.entries(SECRETS)) {
    expect(submitted.body.defaults, `${key} should have been submitted to the ASU server`)
      .toContain(`${key}='${secret}'`);
  }

  // -- 1. and nothing carried them home ---------------------------------------

  const origin = new URL(baseURL!).origin;
  const local = seen.filter((r) => r.url.startsWith(origin));
  expect(local.length).toBeGreaterThan(10);

  const needles = Object.values(SECRETS).flatMap(forms);
  for (const req of local) {
    const haystack = [
      req.url,
      req.postData ?? '',
      Object.entries(req.headers)
        .map(([k, v]) => k + ': ' + v)
        .join('\n'),
    ].join('\n');

    for (const needle of needles) {
      expect(
        haystack.includes(needle),
        `${req.method} ${req.url} carried a secret to a WrtNova origin`,
      ).toBe(false);
    }
  }

  // -- 2. and reached nothing it was not supposed to --------------------------

  const unsanctioned = [
    ...new Set(
      local
        .map((r) => new URL(r.url).pathname)
        .filter((p) => p !== '/' && !ALLOWED_PREFIXES.some((a) => p.startsWith(a))),
    ),
  ];
  expect(unsanctioned, 'a WrtNova-origin endpoint nobody sanctioned').toEqual([]);

  // No WrtNova origin was POSTed to at all, other than the WARP endpoints, which
  // send the browser's own tunnel identity and nothing of the user's.
  const posts = local
    .filter((r) => r.method === 'POST')
    .map((r) => new URL(r.url).pathname)
    .filter((p) => p !== '/api/warp/register');
  expect(posts, 'a WrtNova origin was POSTed to during a build').toEqual([]);

  expect(mock.unexpected).toEqual([]);
});
