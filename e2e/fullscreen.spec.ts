import { test, expect } from '@playwright/test';

test('real fullscreen hides toolbar, reveals on hover/focus and syncs on browser exit', async ({ page }) => {
  await page.goto('/fullscreen');
  await page.getByRole('button', { name: 'Enter fullscreen' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await expect(page.getByLabel('Fullscreen state')).toHaveText('true');
  const header = page.locator('header[aria-label="Reader toolbar"]');
  await page.mouse.move(400, 300);
  await expect(header).toHaveCSS('opacity', '0');
  await page.mouse.move(400, 4);
  await expect(header).toHaveCSS('opacity', '1');
  await page.mouse.move(120, 30);
  await expect(header).toHaveCSS('opacity', '1');
  await page.mouse.move(400, 300);
  await expect(header).toHaveCSS('opacity', '0');
  await page.keyboard.press('Shift+Tab');
  await expect(header).toHaveCSS('opacity', '1');
  // Browser UI / Escape exits produce this same fullscreenchange event.
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.getByRole('button', { name: 'Enter fullscreen' })).toBeVisible();
  await expect(page.getByLabel('Fullscreen state')).toHaveText('false');
  await expect(header).toHaveCSS('opacity', '1');
});

test('exit button and leaving the reader both leave native fullscreen', async ({ page }) => {
  await page.goto('/fullscreen');
  await page.getByRole('button', { name: 'Enter fullscreen' }).click();
  await page.mouse.move(400, 4);
  await page.getByRole('button', { name: 'Exit fullscreen' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await page.getByRole('button', { name: 'Enter fullscreen' }).click();
  await page.getByRole('button', { name: 'Unmount reader' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});

test('denied fullscreen leaves toolbar visible and explains failure', async ({ page }) => {
  await page.goto('/fullscreen');
  await page.evaluate(() => { document.documentElement.requestFullscreen = async () => { throw new Error('Denied'); }; });
  await page.getByRole('button', { name: 'Enter fullscreen' }).click();
  await expect(page.locator('p[role="status"]')).toContainText('Fullscreen could not be changed');
  await expect(page.getByLabel('Fullscreen state')).toHaveText('false');
  await expect(page.getByRole('button', { name: 'Enter fullscreen' })).toBeVisible();
});
