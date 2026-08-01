// A mocked OpenWrt, and the handful of gestures every spec repeats.
//
// Two upstreams get mocked, and only those two:
//
//   downloads.openwrt.org   the release list and the device index
//   sysupgrade.openwrt.org  the build server (ASU_DEFAULT, so the builder
//                           reaches for it without being told to)
//
// Everything else external is aborted by a catch-all, so a spec that quietly
// starts depending on the real internet fails instead of going slow and flaky --
// and so `unexpected` below is a real record of anything the app tried to reach
// that nobody sanctioned.
//
// Route registration order matters: Playwright tries the most recently registered
// handler first, so the catch-all is installed BEFORE the specific routes.

import type { Locator, Page, Route } from '@playwright/test';

export const DOWNLOADS = 'https://downloads.openwrt.org';
export const ASU = 'https://sysupgrade.openwrt.org';

export const RELEASE = '24.10.2';
export const VERSION_CODE = 'r28427-6df0e3d02a';

/** The board the specs build for: DSA, wireless, WED-capable. */
export const DEVICE = {
  title: 'Xiaomi Mi Router AX3000T',
  profile: 'xiaomi_mi-router-ax3000t',
  target: 'mediatek/filogic',
} as const;

/** A second board, on a swconfig target, for the node that is meant to fail. */
export const OLD_DEVICE = {
  title: 'TP-Link Archer C7 v5',
  profile: 'tplink_archer-c7-v5',
  target: 'ath79/generic',
} as const;

const VERSIONS = {
  versions_list: ['23.05.5', '24.10.1', RELEASE],
  stable_version: RELEASE,
};

const OVERVIEW = {
  profiles: [
    {
      id: DEVICE.profile,
      target: DEVICE.target,
      titles: [{ vendor: 'Xiaomi', model: 'Mi Router AX3000T' }],
    },
    {
      id: OLD_DEVICE.profile,
      target: OLD_DEVICE.target,
      titles: [{ vendor: 'TP-Link', model: 'Archer C7', variant: 'v5' }],
    },
    {
      id: 'glinet_gl-mt6000',
      target: 'mediatek/filogic',
      titles: [{ vendor: 'GL.iNet', model: 'GL-MT6000' }],
    },
  ],
};

const PROFILES: Record<string, unknown> = {
  [DEVICE.target]: {
    version_code: VERSION_CODE,
    default_packages: [
      'base-files',
      'busybox',
      'dnsmasq',
      'dropbear',
      'firewall4',
      'kmod-mt7915e',
      'luci',
      'ppp',
      'wpad-basic-mbedtls',
    ],
    profiles: {
      [DEVICE.profile]: {
        device_packages: ['kmod-mt7915-firmware'],
        images: [{ name: 'squashfs-sysupgrade.bin', type: 'sysupgrade' }],
      },
      'glinet_gl-mt6000': { device_packages: [], images: [] },
    },
  },
  [OLD_DEVICE.target]: {
    version_code: VERSION_CODE,
    default_packages: [
      'base-files',
      'busybox',
      'dnsmasq',
      'dropbear',
      'firewall4',
      'kmod-ath10k-ct',
      'ath10k-firmware-qca988x-ct',
      'luci',
      'ppp',
      'wpad-basic-mbedtls',
    ],
    profiles: {
      [OLD_DEVICE.profile]: {
        device_packages: [],
        images: [{ name: 'squashfs-sysupgrade.bin', type: 'sysupgrade' }],
      },
    },
  },
};

const BIN_DIR = `releases/${RELEASE}/targets/mediatek/filogic`;

function imagesFor(profile: string) {
  return [
    {
      name: `openwrt-${RELEASE}-${profile}-squashfs-factory.bin`,
      type: 'factory',
      sha256: 'b'.repeat(64),
    },
    {
      name: `openwrt-${RELEASE}-${profile}-squashfs-sysupgrade.bin`,
      type: 'sysupgrade',
      sha256: 'a'.repeat(64),
    },
  ];
}

export interface AsuPost {
  url: string;
  body: {
    profile: string;
    target: string;
    version: string;
    version_code: string;
    packages: string[];
    defaults: string;
  };
}

export interface MockOptions {
  /**
   * 'cached' answers the POST 200 with the images straight away; 'queued'
   * answers 202 and makes the caller poll, which is the path that exercises the
   * queue-position message and the progress bar.
   */
  mode?: 'cached' | 'queued';
  /** Profiles the build server refuses, and what it says (SC-006). */
  failProfiles?: Record<string, string>;
}

export interface Mock {
  /** Every POST the ASU server received, in arrival order. */
  asuPosts: AsuPost[];
  /** Every external request the catch-all had to abort. */
  unexpected: string[];
}

export async function mockOpenWrt(page: Page, opts: MockOptions = {}): Promise<Mock> {
  const mode = opts.mode ?? 'queued';
  const failProfiles = opts.failProfiles ?? {};
  const mock: Mock = { asuPosts: [], unexpected: [] };

  const json = (route: Route, status: number, data: unknown): Promise<void> =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

  // Registered first, so it is tried last: anything off-origin that the specific
  // routes below did not claim.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      await route.fallback();
      return;
    }
    mock.unexpected.push(route.request().method() + ' ' + url.href);
    await route.abort('blockedbyclient');
  });

  await page.route(DOWNLOADS + '/.versions.json', (route) => json(route, 200, VERSIONS));

  await page.route(DOWNLOADS + '/releases/*/.overview.json', (route) =>
    json(route, 200, OVERVIEW),
  );

  await page.route(DOWNLOADS + '/releases/*/targets/**/profiles.json', (route) => {
    const m = /\/targets\/([^?]+)\/profiles\.json/.exec(route.request().url());
    const payload = m ? PROFILES[m[1] ?? ''] : undefined;
    return payload ? json(route, 200, payload) : json(route, 404, { detail: 'no such target' });
  });

  // -- the build server ------------------------------------------------------

  // One hash per accepted submission rather than one per board: a fleet can hold
  // two nodes on the same board, and they still have to be two builds whose
  // progress is independent (FR-041).
  let issued = 0;
  const profileOf = new Map<string, string>();
  const polls = new Map<string, number>();

  await page.route(ASU + '/api/v1/build', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as AsuPost['body'];
    mock.asuPosts.push({ url: route.request().url(), body });

    const refusal = failProfiles[body.profile];
    if (refusal) {
      await json(route, 500, { detail: refusal, stderr: 'make: *** [world] Error 1' });
      return;
    }

    const hash = `hash${++issued}-${body.profile}`;
    profileOf.set(hash, body.profile);

    if (mode === 'cached') {
      await json(route, 200, {
        request_hash: hash,
        bin_dir: BIN_DIR,
        images: imagesFor(body.profile),
        status: 'done',
      });
      return;
    }
    await json(route, 202, { request_hash: hash, status: 'queued' });
  });

  await page.route(ASU + '/api/v1/build/*', async (route) => {
    const hash = route.request().url().split('/').pop() ?? '';
    const n = (polls.get(hash) ?? 0) + 1;
    polls.set(hash, n);

    // One tick in the queue, then done -- enough to prove the queue position and
    // the progress bar are wired, without spending a minute per build.
    if (n === 1) {
      await json(route, 202, { request_hash: hash, status: 'queued', queue_position: 3 });
      return;
    }
    await json(route, 200, {
      request_hash: hash,
      bin_dir: BIN_DIR,
      images: imagesFor(profileOf.get(hash) ?? 'unknown'),
      status: 'done',
    });
  });

  return mock;
}

// -- gestures ----------------------------------------------------------------

/**
 * Both navs are in the DOM at once -- the phone tab strip and the desktop rail,
 * separated by CSS -- so a rail item is always two elements and only one of them
 * is visible at any width.
 */
export function railItem(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true }).filter({ visible: true });
}

export async function gotoSection(page: Page, name: string): Promise<void> {
  await railItem(page, name).click();
}

/**
 * The device combobox: a Radix popover holding a search box and a listbox. `id`
 * is 'device' on /builder and '<nodeId>-device' in a fleet node's panel, and node
 * ids can begin with a digit, so it is matched as an attribute rather than as a
 * CSS id.
 */
export async function pickDevice(page: Page, id: string, title: string): Promise<void> {
  await pickDeviceAt(page, page.locator(`[id="${id}"]`), title);
}

/** The same gesture where the trigger is easier to reach by position than by id. */
export async function pickDeviceAt(page: Page, trigger: Locator, title: string): Promise<void> {
  await trigger.click();
  await page.getByRole('searchbox').fill(title);
  await page.getByRole('option', { name: title, exact: true }).click();
}

/** Everything a page sent, for the egress audit. Install before navigating. */
export interface SeenRequest {
  method: string;
  url: string;
  postData: string | null;
  headers: Record<string, string>;
}

export function recordRequests(page: Page): SeenRequest[] {
  const seen: SeenRequest[] = [];
  page.on('request', (req) => {
    seen.push({
      method: req.method(),
      url: req.url(),
      postData: req.postData(),
      headers: req.headers(),
    });
  });
  return seen;
}
