import { test, expect } from '@playwright/test';
import type {} from './reader-harness';

test.beforeEach(async ({ page }) => {
  await page.goto('/reader');
  await page.waitForFunction(() => !!window.readerTest);
});

for (const initial of [1, 50]) test(`opens around page ${initial} before the archive finishes preparing`, async ({ page }) => {
  await page.evaluate(async initial => {
    await window.readerTest.seedComic('window', 100, initial);
    window.readerTest.mountComic('window');
  }, initial);
  await page.waitForFunction(() => !!window.readerTest.firstReady);
  const first = await page.evaluate(() => {
    const state = window.readerTest.firstReady!;
    return { initial: state.initialPage, prepared: state.prepared, preparing: state.preparing, total: state.pages.length,
      ready: state.pages.flatMap((page, index) => page.status ? [] : [index + 1]),
      cropped: state.pages.filter(page => !page.status).every(page => page.crop.left > 0 && page.tightCrop.left > 0) };
  });
  const start = Math.max(1, initial - 8), end = Math.min(100, initial + 8);
  expect(first).toEqual({ initial, prepared: end - start + 1, preparing: true, total: 100,
    ready: Array.from({ length: end - start + 1 }, (_, index) => start + index), cropped: true });
  const progress = page.getByRole('progressbar', { name: 'Preparing remaining pages' });
  await expect(progress).toBeVisible();
  await expect(progress).toHaveAttribute('aria-valuemax', '100');
  // A jump to a distant page must not wait for sequential background processing.
  await page.evaluate(() => window.readerTest.comic!.prioritize(100));
  await page.waitForFunction(() => !window.readerTest.comic!.pages[99].status);
  expect(await page.evaluate(() => window.readerTest.comic!.prepared)).toBeLessThan(50);
  await page.waitForFunction(() => !window.readerTest.comic!.preparing);
  await expect(progress).toHaveCount(0);
  expect(await page.evaluate(() => window.readerTest.comic!.pages.every(page => !page.status))).toBe(true);
});

test('unreadable pages retain their numbers as remaining pages arrive', async ({ page }) => {
  await page.evaluate(async () => {
    await window.readerTest.seedComic('damaged', 40, 20, [1, 20, 40]);
    window.readerTest.mountComic('damaged');
  });
  await page.waitForFunction(() => !!window.readerTest.firstReady);
  expect(await page.evaluate(() => window.readerTest.firstReady!.initialPage)).toBe(20);
  await page.waitForFunction(() => !window.readerTest.comic!.preparing);
  const state = await page.evaluate(() => ({ total: window.readerTest.comic!.pages.length,
    failed: window.readerTest.comic!.pages.flatMap((page, index) => page.status === 'error' ? [index + 1] : []),
    names: window.readerTest.comic!.pages.map(page => page.name), error: window.readerTest.comic!.error }));
  expect(state.total).toBe(40);
  expect(state.failed).toEqual([1, 20, 40]);
  expect(state.names).toEqual(Array.from({ length: 40 }, (_, index) => `page${index + 1}.png`));
  expect(state.error).toBeUndefined();
});

test('leaving during background work revokes all page URLs and stops publications', async ({ page }) => {
  await page.evaluate(async () => {
    const active = new Set<string>();
    const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
    URL.createObjectURL = blob => { const url = create(blob); active.add(url); return url; };
    URL.revokeObjectURL = url => { active.delete(url); revoke(url); };
    Object.assign(window, { activeReaderUrls: active });
    await window.readerTest.seedComic('cancel', 100, 50);
    window.readerTest.mountComic('cancel');
  });
  await page.waitForFunction(() => !!window.readerTest.firstReady);
  const count = await page.evaluate(() => {
    window.readerTest.unmount();
    return window.readerTest.comic!.prepared;
  });
  await expect.poll(() => page.evaluate(() => (window as any).activeReaderUrls.size)).toBe(0);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.readerTest.comic!.prepared)).toBe(count);
});

test('switching chapters discards old preparation and opens the new saved position', async ({ page }) => {
  await page.evaluate(async () => {
    await window.readerTest.seedComic('old', 100, 50);
    window.readerTest.mountComic('old');
  });
  await page.waitForFunction(() => !!window.readerTest.firstReady);
  await page.evaluate(async () => {
    await window.readerTest.seedComic('new', 40, 30);
    window.readerTest.mountComic('new');
  });
  await page.waitForFunction(() => window.readerTest.firstReady?.id === 'new');
  expect(await page.evaluate(() => ({ initial: window.readerTest.firstReady!.initialPage, total: window.readerTest.firstReady!.pages.length }))).toEqual({ initial: 30, total: 40 });
  await page.waitForFunction(() => !window.readerTest.comic!.preparing);
  expect(await page.evaluate(() => window.readerTest.comic!.id)).toBe('new');
});

test('an entirely unreadable archive still reports a recoverable opening error', async ({ page }) => {
  await page.evaluate(async () => {
    await window.readerTest.seedComic('broken', 3, 1, [1, 2, 3]);
    window.readerTest.mountComic('broken');
  });
  await page.waitForFunction(() => !!window.readerTest.comic?.error);
  expect(await page.evaluate(() => window.readerTest.comic!.error)).toContain('could not be decoded');
  expect(await page.evaluate(() => window.readerTest.comic!.preparing)).toBe(false);
});

test('pending spreads show a placeholder until every crop is ready', async ({ page }) => {
  const result = await page.evaluate(() => {
    const full = { left: 0, top: 0, right: 1, bottom: 1 };
    const ready = { name: 'one', url: 'data:image/png;base64,', width: 100, height: 150, crop: full, tightCrop: full };
    const pending = { ...ready, name: 'two', url: '', status: 'pending' as const };
    window.readerTest.render([ready, pending], [1, 2], true, 'spread');
    const before = document.images.length;
    window.readerTest.render([ready, { ...ready, name: 'two' }], [1, 2], true, 'spread');
    return { before, after: document.images.length };
  });
  expect(result).toEqual({ before: 0, after: 2 });
});

test('background height changes above a scrolling reader preserve the visible position', async ({ page }) => {
  const before = await page.evaluate(async () => {
    const full = { left: 0, top: 0, right: 1, bottom: 1 };
    const pages = Array.from({ length: 10 }, (_, index) => ({ name: String(index), url: '', width: 100, height: 300, crop: full, tightCrop: full, status: 'pending' as const }));
    Object.assign(window, { scrollingPages: pages });
    window.readerTest.render(pages, [5], false, 'webtoon');
    const root = document.querySelector<HTMLElement>('[aria-label="Comic pages"]')!;
    root.style.height = '400px'; root.style.overflow = 'auto'; root.style.position = 'relative';
    root.scrollTop = document.querySelector<HTMLElement>('[data-reader-page="5"]')!.offsetTop + 40;
    root.dispatchEvent(new Event('scroll'));
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    return document.querySelector('[data-reader-page="5"]')!.getBoundingClientRect().top;
  });
  const after = await page.evaluate(() => {
    const pages = (window as any).scrollingPages;
    window.readerTest.render(pages.map((page: object, index: number) => index === 0 ? { ...page, height: 600 } : page), [5], false, 'webtoon');
    return document.querySelector('[data-reader-page="5"]')!.getBoundingClientRect().top;
  });
  expect(after).toBeCloseTo(before, 1);
});
