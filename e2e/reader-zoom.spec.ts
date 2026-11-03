import { test, expect } from '@playwright/test';
import type {} from './reader-harness';

test.beforeEach(async ({ page }) => {
  await page.goto('/reader'); await page.waitForFunction(() => !!window.readerTest);
  // Layout equivalent to the reader, without compiling the app's theme utilities.
  await page.addStyleTag({ content: `
    * { box-sizing: border-box; }
    [aria-label="Comic pages"] { position: fixed; inset: 60px 0 0; overflow: auto; scrollbar-width: none; }
    [aria-label="Comic pages"] > div { display: flex; width: max-content; min-width: 100%; justify-content: center; align-items: start; }
    [data-reader-page] { position: relative; flex-shrink: 0; }
    [data-reader-page] > div { position: relative; overflow: hidden; }
    [data-reader-page] img { position: absolute; }
  ` });
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 900;
    canvas.getContext('2d')!.fillRect(0, 0, 600, 900);
    const image = await window.readerTest.prepareReaderPage(canvas.toDataURL(), 'page');
    Object.assign(window, { zoomPages: [image, { ...image, name: 'second' }] });
    window.readerTest.render((window as any).zoomPages, [1], false);
  });
});

test('desktop wheel zoom anchors the cursor, supports panning, and resets on page turns', async ({ page }) => {
  const image = page.getByRole('img', { name: 'Page 1', exact: true });
  const before = (await image.boundingBox())!;
  const x = before.x + before.width * .3, y = before.y + before.height * .2;
  await page.mouse.move(x, y); await page.mouse.wheel(0, -120);
  await expect.poll(async () => (await image.boundingBox())!.width).toBeGreaterThan(before.width);
  const after = (await image.boundingBox())!;
  expect(Math.abs(after.x + after.width * .3 - x)).toBeLessThan(1);
  expect(Math.abs(after.y + after.height * .2 - y)).toBeLessThan(1);
  const root = page.getByRole('region', { name: 'Comic pages' });
  const top = await root.evaluate(el => el.scrollTop);
  await page.mouse.down(); await page.mouse.move(x, y - 80, { steps: 5 }); await page.mouse.up();
  expect(await root.evaluate(el => el.scrollTop)).toBeGreaterThan(top + 60);
  await page.evaluate(() => window.readerTest.render((window as any).zoomPages, [2], false));
  await expect(page.getByRole('button', { name: /Reset zoom/ })).toHaveCount(0);
  expect((await page.getByRole('img', { name: 'Page 2', exact: true }).boundingBox())!.width).toBeCloseTo(before.width, 1);
});

test('zooming out remains anchored even when the page fits the viewport', async ({ page }) => {
  const image = page.getByRole('img', { name: 'Page 1', exact: true });
  const before = (await image.boundingBox())!;
  const x = before.x + before.width * .7, y = before.y + before.height * .2;
  await page.mouse.move(x, y); await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await image.boundingBox())!.width).toBeLessThan(before.width);
  const after = (await image.boundingBox())!;
  expect(Math.abs(after.x + after.width * .7 - x)).toBeLessThan(1);
  expect(Math.abs(after.y + after.height * .2 - y)).toBeLessThan(1);
  await page.getByRole('button', { name: /Reset zoom/ }).click();
  expect((await image.boundingBox())!.width).toBeCloseTo(before.width, 1);
});

test('phone wheel behavior and modal dialogs do not trigger reader zoom', async ({ page }) => {
  for (const interaction of [{ phone: true }, { panelOpen: true }]) {
    await page.evaluate(interaction => window.readerTest.render((window as any).zoomPages, [1], false, 'single', {}, interaction), interaction);
    const image = page.getByRole('img', { name: 'Page 1', exact: true });
    const before = (await image.boundingBox())!;
    await page.mouse.move(before.x + before.width / 2, before.y + 100); await page.mouse.wheel(0, -100);
    await page.waitForTimeout(100);
    expect((await image.boundingBox())!.width).toBeCloseTo(before.width, 1);
    await expect(page.getByRole('button', { name: /Reset zoom/ })).toHaveCount(0);
  }
});
