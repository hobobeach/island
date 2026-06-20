import { test, expect, Page } from '@playwright/test';

/**
 * Plain content links (e.g. markdown links rendered into a blog post) must carry
 * the brand colour by default — not appear as plain body text until hovered.
 *
 * Uses a published blog post, whose `.article` body contains class-less <a href>
 * links produced from markdown — exactly what the `default.hbs` rule targets.
 */

const POST = '/blog/island-a-human-only-community';

const firstContentLink = (page: Page) => page.locator('.article a[href]').first();
const color = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((el) => getComputedStyle(el).color);

test('content links use the brand colour, not the body text colour', async ({ page }) => {
  await page.goto(POST);

  const link = firstContentLink(page);
  await expect(link).toBeVisible();

  const linkColor = await link.evaluate((el) => getComputedStyle(el).color);
  const bodyColor = await color(page, 'body');

  // Brand purple (--bs-link-hover-color-rgb in light mode), distinct from body text.
  expect(linkColor).toBe('rgb(99, 84, 255)');
  expect(linkColor).not.toBe(bodyColor);
});
