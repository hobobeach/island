import { test, expect, Page } from '@playwright/test';

/**
 * Guards against a flash of the wrong colour theme (FOUC).
 *
 * The user-facing theme bundle runs at the *bottom* of <body>, so on its own a
 * dark-mode visitor would see the default light theme paint first. The fix is a
 * blocking `theme-init.js` in <head>. These tests block the late bundle to prove
 * the <head> script alone applies the correct theme before the body renders.
 *
 * `/login` is used because it's a public page rendered through the default
 * layout — no auth or seeded data required.
 */

const blockThemeBundle = (page: Page) =>
  page.route('**/theme.bundle*.js', (route) => route.abort());

const html = (page: Page) => page.locator('html');

test.describe('No flash of the wrong colour theme on /login', () => {
  test('stored dark preference is applied before the late theme bundle runs', async ({ page }) => {
    await blockThemeBundle(page);
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));

    await page.goto('/login');

    await expect(html(page)).toHaveAttribute('data-bs-theme', 'dark');
    await page.screenshot({ path: 'test-results/login-dark.png', fullPage: true });
  });

  test.describe('OS prefers dark', () => {
    test.use({ colorScheme: 'dark' });

    test('OS dark preference is applied with no stored preference', async ({ page }) => {
      await blockThemeBundle(page);
      await page.addInitScript(() => localStorage.removeItem('theme'));

      await page.goto('/login');

      await expect(html(page)).toHaveAttribute('data-bs-theme', 'dark');
    });
  });

  test.describe('OS prefers light', () => {
    test.use({ colorScheme: 'light' });

    test('light is applied with no stored preference', async ({ page }) => {
      await blockThemeBundle(page);
      await page.addInitScript(() => localStorage.removeItem('theme'));

      await page.goto('/login');

      await expect(html(page)).toHaveAttribute('data-bs-theme', 'light');
    });
  });
});
