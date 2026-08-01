// T087 -- US1 end to end: land on /builder, find the hardware, accept the
// defaults, get an image.
//
// The spec's independent test for User Story 1 is "pick a device, press build,
// receive a download link", and that is exactly what runs here against a mocked
// ASU server. What it is really guarding is the seam between the typed core and
// the build server: the request body is asserted field by field, because a
// version_code or a profile id that arrives wrong produces an image for the wrong
// board and nothing in the interface would say so.

import { expect, test } from '@playwright/test';
import { DEVICE, RELEASE, VERSION_CODE, mockOpenWrt, pickDevice } from './fixtures';

const MARKER = '# ===================\n# End config section\n# ===================\n';

test.describe('the single-node builder', () => {
  test('picks a device, builds, and offers the image', async ({ page }) => {
    const mock = await mockOpenWrt(page, { mode: 'queued' });
    await page.goto('/builder/');

    // Nothing but the device question until hardware is chosen (US1).
    await expect(page.getByRole('heading', { name: 'Which router are you building for?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Build firmware' })).toBeDisabled();

    await expect(page.locator('#release')).toHaveValue(RELEASE);
    await pickDevice(page, 'device', DEVICE.title);

    // The question collapses to a single line naming what was resolved.
    await expect(page.getByText(`${DEVICE.target} / ${DEVICE.profile} / ${RELEASE}`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Change device' })).toBeVisible();

    // The plan panel is populated before anything is built (US2).
    await expect(page.getByText('192.168.1.1').first()).toBeVisible();

    const build = page.getByRole('button', { name: 'Build firmware' });
    await expect(build).toBeEnabled();
    await build.click();

    // Queued, then built. The queue position the server reported is shown as a
    // sentence rather than a spinner.
    await expect(page.getByText('In build queue (#3)')).toBeVisible();

    const images = page.getByRole('heading', { name: 'Images' });
    await expect(images).toBeVisible({ timeout: 30_000 });

    // Sysupgrade first: leading with factory invites flashing the wrong image
    // onto an already-OpenWrt router. Scoped to the results list, because history
    // links to the same image from its own panel.
    const links = images.locator('xpath=following-sibling::ul').getByRole('link');
    await expect(links).toHaveCount(2);
    await expect(links.first()).toHaveText('sysupgrade');
    await expect(links.first()).toHaveAttribute(
      'href',
      `https://sysupgrade.openwrt.org/store/releases/${RELEASE}/targets/mediatek/filogic/openwrt-${RELEASE}-${DEVICE.profile}-squashfs-sysupgrade.bin`,
    );
    await expect(page.getByText('SHA-256 ' + 'a'.repeat(64))).toBeVisible();

    // What was actually sent.
    expect(mock.asuPosts).toHaveLength(1);
    const sent = mock.asuPosts[0]!;
    expect(sent.url).toBe('https://sysupgrade.openwrt.org/api/v1/build');
    expect(sent.body.profile).toBe(DEVICE.profile);
    expect(sent.body.target).toBe(DEVICE.target);
    expect(sent.body.version).toBe(RELEASE);
    expect(sent.body.version_code).toBe(VERSION_CODE);

    // The assembled script: a shell script, split on the frozen marker exactly
    // once, carrying the body from the real wrtnova.sh (Constitution II).
    expect(sent.body.defaults.startsWith('#!/bin/sh\n')).toBe(true);
    expect(sent.body.defaults.split(MARKER)).toHaveLength(2);
    expect(sent.body.defaults).toContain('/usr/share/wrtnova/functions.sh');

    // Constitution IV: an untouched checkbox emits nothing, never '0'.
    expect(sent.body.defaults).not.toMatch(/^[A-Z0-9_]+='0'$/m);

    expect(mock.unexpected).toEqual([]);
  });

  test('records the build in history with a download link', async ({ page }) => {
    const mock = await mockOpenWrt(page, { mode: 'cached' });
    await page.goto('/builder/');
    await pickDevice(page, 'device', DEVICE.title);

    await page.getByRole('button', { name: 'Build firmware' }).click();
    await expect(page.getByText('Done (cached build)')).toBeVisible();
    expect(mock.asuPosts).toHaveLength(1);

    const history = page.locator('details').filter({ hasText: 'Recent builds' });
    await history.getByText('Recent builds (1)').click();
    await expect(history.getByText(DEVICE.title)).toBeVisible();
    await expect(history.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      /squashfs-sysupgrade\.bin$/,
    );
    await expect(history.getByRole('button', { name: 'Restore' })).toBeVisible();
  });

  test('refuses a build that would reach hardware wrong, and says why', async ({ page }) => {
    const mock = await mockOpenWrt(page);
    await page.goto('/builder/');
    await pickDevice(page, 'device', DEVICE.title);

    // A Wi-Fi passphrase WPA cannot carry. The sweep must refuse before anything
    // is submitted, and take the user to the offending field (FR-015).
    await page.getByRole('button', { name: 'WiFi', exact: true }).filter({ visible: true }).click();
    await page.locator('#LAN_WIFI_PASSWD').fill('short');

    await page.getByRole('button', { name: 'Build firmware' }).click();

    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page.locator('#LAN_WIFI_PASSWD')).toBeFocused();
    expect(mock.asuPosts).toEqual([]);
  });
});
