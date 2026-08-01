// T088 -- US4 end to end: a router plus three access points, built together, with
// one node the build server refuses.
//
// SC-006 is the point of this file. The nodes are independent builds, so a board
// that will not build must not stop the rest of the house from being built -- and
// the failure has to be reported on the node that produced it rather than as a
// page-level error that says nothing about which router is affected.

import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEVICE, OLD_DEVICE, mockOpenWrt, pickDeviceAt } from './fixtures';

const NETWORK = 'Casa Verde';
const REFUSAL = 'Package kmod-nonexistent not found';

/** The node list in the centre region, as opposed to the cards in the panel. */
function nodesSection(page: Page): Locator {
  return page.getByRole('heading', { name: 'Nodes', exact: true }).locator('xpath=ancestor::section');
}

function nodeRow(page: Page, name: string): Locator {
  return nodesSection(page).locator('li').filter({ hasText: name });
}

/** The device combobox of whichever node panel is currently open. */
function openNodeDevice(page: Page): Locator {
  return page.locator('[id$="-device"]');
}

async function createNetwork(page: Page): Promise<void> {
  await page.goto('/networks/');
  await page.getByRole('button', { name: 'New network' }).click();
  await page.getByLabel('Network name').fill(NETWORK);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Nodes', exact: true })).toBeVisible();
}

test.describe('the fleet builder', () => {
  test('builds a router and three APs, and one failure stops nothing', async ({ page }) => {
    const mock = await mockOpenWrt(page, {
      mode: 'queued',
      failProfiles: { [OLD_DEVICE.profile]: REFUSAL },
    });

    await createNetwork(page);

    // The router is not the user's to add: every network has one already.
    await nodeRow(page, NETWORK).getByRole('button').first().click();
    await pickDeviceAt(page, openNodeDevice(page), DEVICE.title);
    await expect(nodeRow(page, NETWORK)).toContainText(DEVICE.title);

    // Three access points. Each one opens its own panel as it is added, and takes
    // the next free index -- 2, 3, 4 -- without being told (FR-039).
    for (const [index, title] of [
      [2, DEVICE.title],
      [3, DEVICE.title],
      [4, OLD_DEVICE.title],
    ] as const) {
      await nodesSection(page).getByRole('button', { name: 'Add AP node' }).click();
      await pickDeviceAt(page, openNodeDevice(page), title);
      await expect(nodeRow(page, `AP #${index}`)).toContainText(title);
    }

    // Each node answers on its own address, derived from its index.
    await expect(nodeRow(page, NETWORK)).toContainText('192.168.1.1');
    await expect(nodeRow(page, 'AP #4')).toContainText('192.168.1.4');

    // Build the whole house.
    const panel = page.getByRole('complementary');
    await panel.getByRole('button', { name: 'Build all nodes' }).click();

    // Three images, one refusal. The refusal belongs to the node that produced it.
    const failing = panel.locator('li').filter({ hasText: 'AP #4' });
    await expect(failing.getByRole('alert')).toContainText('Build failed: ' + REFUSAL, {
      timeout: 45_000,
    });

    for (const name of [NETWORK, 'AP #2', 'AP #3']) {
      const card = panel.locator('li').filter({ hasText: name });
      await expect(card.getByRole('link', { name: 'sysupgrade' })).toBeVisible({
        timeout: 45_000,
      });
    }
    await expect(failing.getByRole('link')).toHaveCount(0);

    // Four independent submissions, each carrying its own node's configuration.
    expect(mock.asuPosts).toHaveLength(4);
    expect(mock.asuPosts.filter((p) => p.body.profile === DEVICE.profile)).toHaveLength(3);
    expect(mock.asuPosts.filter((p) => p.body.profile === OLD_DEVICE.profile)).toHaveLength(1);

    // The three access points are built as access points, and the router is not.
    const apModes = mock.asuPosts.map((p) => /^AP_MODE='1'$/m.test(p.body.defaults));
    expect(apModes.filter(Boolean)).toHaveLength(3);

    // Every node shares the house's configuration and differs only where it must.
    // AP #2 is absent on purpose: 2 is wrtnova.sh's own default for AP_INDEX, and
    // an override layer that repeats a default is a bug (Constitution V).
    const indexes = mock.asuPosts
      .map((p) => /^AP_INDEX='(\d+)'$/m.exec(p.body.defaults)?.[1])
      .filter(Boolean)
      .sort();
    expect(indexes).toEqual(['3', '4']);

    expect(mock.unexpected).toEqual([]);
  });

  test('refuses a node whose own settings are wrong, before anything is sent', async ({ page }) => {
    const mock = await mockOpenWrt(page);
    await createNetwork(page);

    await nodeRow(page, NETWORK).getByRole('button').first().click();
    await pickDeviceAt(page, openNodeDevice(page), DEVICE.title);

    await nodesSection(page).getByRole('button', { name: 'Add AP node' }).click();
    await pickDeviceAt(page, openNodeDevice(page), DEVICE.title);

    // An access point cannot answer on .0: it is the network address. The same
    // sweep the single-node builder refuses on runs per node (FR-015).
    const index = page.locator('[id$="-apidx"]');
    await index.fill('0');
    // Blurred deliberately before the click. Validity is reported on blur (US6),
    // so leaving the field with the pointer inserts the message above the button
    // mid-gesture and the press lands on what moved into its place.
    await index.blur();
    await nodeRow(page, 'AP #0').getByRole('button', { name: 'Build firmware' }).click();

    // Refused on the node's own card, in the words the field itself uses. The
    // card is found by the node's name, which the bad index does not change.
    const card = page.getByRole('complementary').locator('li').filter({ hasText: 'AP #2' });
    await expect(card.getByRole('alert')).toContainText('AP index must be 2-254');
    expect(mock.asuPosts).toEqual([]);
  });
});
