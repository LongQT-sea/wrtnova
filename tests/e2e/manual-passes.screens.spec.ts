// T090 and T091 -- the two manual passes, driven rather than asserted.
//
// SC-009 (usable at 375px) and SC-008 (all seven locales) are judgements: whether
// a phone layout reads well, and whether a Polish string overflows the control it
// sits in, are questions a person answers by looking. Asserting "the button is
// visible" would pass on a layout nobody could use, so this file makes no claims.
// It puts the app in each state and captures a screenshot.
//
// It is NOT part of the gate. `npm run test:e2e` runs the `e2e` project only;
// this is the `screens` project, run by `npm run test:e2e:screens`, and the
// output lands in test-results/screens/ for a human to page through.

import { test, type Locator, type Page } from '@playwright/test';
import { DEVICE, mockOpenWrt, pickDevice, pickDeviceAt } from './fixtures';

const OUT = 'test-results/screens';
const PHONE = { width: 375, height: 812 };

// `animations: 'disabled'` finishes the plan panel's staggered assembly instead
// of catching it half-drawn, which is the difference between a screenshot that
// can be judged and one that only shows a transition.
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, animations: 'disabled' });

/**
 * A rail item by position rather than by name, because the rail is localized and
 * T091 walks seven catalogues. The order is fixed in the page component:
 * 0 device, 1 system, 2 network, 3 wifi, 4 wan, 5 dns, 6 vpn, 7 advanced.
 */
function rail(page: Page, index: number): Locator {
  return page
    .getByRole('navigation')
    .filter({ visible: true })
    .getByRole('button')
    .nth(index);
}

/** The phone summary bar's trigger for the right-hand region. */
function sheetTrigger(page: Page): Locator {
  return page.locator('div.fixed.inset-x-0.bottom-0').getByRole('button');
}

// -- T090: 375 px -------------------------------------------------------------

test.describe('T090 -- 375px', () => {
  test.use({ viewport: PHONE });

  test('the landing page', async ({ page }) => {
    await mockOpenWrt(page);
    await page.goto('/');
    await shot(page, '375-landing');
  });

  test('the builder', async ({ page }) => {
    await mockOpenWrt(page);
    await page.goto('/builder/');

    // The opening question, and the tab strip the rail becomes on a phone.
    await shot(page, '375-builder-1-device');

    await pickDevice(page, 'device', DEVICE.title);
    await rail(page, 2).click();
    await shot(page, '375-builder-2-networks');

    await rail(page, 3).click();
    await shot(page, '375-builder-3-wifi');

    await rail(page, 6).click();
    await shot(page, '375-builder-4-security');

    // The right region becomes a bottom sheet behind a persistent summary bar,
    // so the build action and the router address never leave the screen.
    await sheetTrigger(page).click();
    await shot(page, '375-builder-5-plan-sheet');
  });

  test('the fleet', async ({ page }) => {
    await mockOpenWrt(page);
    await page.goto('/networks/');
    await shot(page, '375-networks-1-empty');

    await page.getByRole('button', { name: 'New network' }).click();
    await page.getByLabel('Network name').fill('Casa Verde');
    await page.getByRole('button', { name: 'Save' }).click();
    await shot(page, '375-networks-2-nodes');

    const section = page
      .getByRole('heading', { name: 'Nodes', exact: true })
      .locator('xpath=ancestor::section');
    await section
      .locator('li')
      .filter({ hasText: 'Casa Verde' })
      .getByRole('button')
      .first()
      .click();
    await pickDeviceAt(page, page.locator('[id$="-device"]'), DEVICE.title);
    await shot(page, '375-networks-3-node-panel');

    await sheetTrigger(page).click();
    await shot(page, '375-networks-4-fleet-sheet');
  });
});

// -- T091: seven locales ------------------------------------------------------

const LOCALES = ['en', 'de', 'es', 'fr', 'pl', 'ru', 'zh'] as const;

test.describe('T091 -- seven locales', () => {
  for (const lang of LOCALES) {
    test(`the builder in ${lang}`, async ({ page }) => {
      // Set before the first paint: the locale is resolved before render so a
      // non-English user never sees an English frame swap under them.
      await page.addInitScript(`localStorage.setItem('lang', ${JSON.stringify(lang)})`);
      await mockOpenWrt(page);

      await page.goto('/builder/');
      // The six non-English catalogues are dynamic imports, and nothing renders
      // until one lands -- so without this the shot is of a blank page.
      await page.locator('[id="device"]').waitFor();
      await shot(page, `lang-${lang}-1-device`);

      await pickDevice(page, 'device', DEVICE.title);

      // Two sections chosen for pressure rather than coverage: the network
      // section carries the longest labels in the product, and DNS & Ad blocking
      // carries the densest help text.
      await rail(page, 2).click();
      await shot(page, `lang-${lang}-2-networks`);

      await rail(page, 5).click();
      await shot(page, `lang-${lang}-3-filtering`);
    });
  }
});
