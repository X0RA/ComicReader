import { test, expect } from '@playwright/test';
import type {} from './reader-harness';

test.beforeEach(async ({ page }) => {
  await page.goto('/reader');
  await page.waitForFunction(() => !!window.readerTest);
});

test('crop geometry is ready on the first render, page turns, spreads and toggles', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 100;
    const context = canvas.getContext('2d')!;
    const pages = [];
    for (const tone of ['white', 'black']) {
      context.fillStyle = tone;
      context.fillRect(0, 0, 100, 100);
      context.fillStyle = '#808080';
      context.fillRect(10, 10, 80, 80);
      const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!)));
      const url = URL.createObjectURL(blob);
      pages.push(await window.readerTest.prepareReaderPage(url, tone));
    }
    const render = window.readerTest.render;
    const first = render(pages, [1], true);
    const next = render(pages, [2], true);
    const back = render(pages, [1], true);
    const off = render(pages, [1], false);
    const on = render(pages, [1], true);
    const spread = render(pages, [1, 2], true, 'spread');
    const webtoon = render(pages, [1], true, 'webtoon');
    await Promise.all([...document.images].map(image => image.decode()));
    const loaded = render(pages, [1], true, 'webtoon');
    pages.forEach(page => URL.revokeObjectURL(page.url));
    return { first, next, back, off, on, spread, webtoon, loaded };
  });
  const cropped = { left: -9, top: -9, width: 82, height: 82 };
  for (const geometry of [result.first, result.next, result.back, result.on]) expect(geometry).toEqual([cropped]);
  expect(result.off).toEqual([{ left: 0, top: 0, width: 100, height: 100 }]);
  for (const geometry of [result.spread, result.webtoon, result.loaded]) expect(geometry).toEqual([cropped, cropped]);
});

test('canvas failures retain readable pages and invalid images still reject', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 100;
    const source = canvas.toDataURL();
    const original = HTMLCanvasElement.prototype.getContext;
    const pages = [];
    try {
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => null });
      pages.push(await window.readerTest.prepareReaderPage(source, 'no context'));
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => { throw new Error('Canvas unavailable'); } });
      pages.push(await window.readerTest.prepareReaderPage(source, 'failed canvas'));
    } finally {
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: original });
    }
    let rejected = false;
    try { await window.readerTest.prepareReaderPage('data:image/png;base64,invalid', 'invalid'); }
    catch { rejected = true; }
    return { crops: pages.map(page => page.crop), tightCrops: pages.map(page => page.tightCrop), geometry: window.readerTest.render(pages, [1, 2], true, 'spread', { cropTightness: 100 }), rejected };
  });
  expect(result.crops).toEqual(Array(2).fill({ left: 0, top: 0, right: 1, bottom: 1 }));
  expect(result.tightCrops).toEqual(result.crops);
  expect(result.geometry).toEqual(Array(2).fill({ left: 0, top: 0, width: 100, height: 100 }));
  expect(result.rejected).toBe(true);
});

test('tightness and independent extra crop change prepared geometry without image analysis or a page-turn flash', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 100;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'white'; context.fillRect(0, 0, 100, 100);
    context.fillStyle = '#808080'; context.fillRect(6, 8, 84, 84);
    context.fillStyle = 'black'; context.fillRect(98, 20, 1, 1);
    const prepared = await window.readerTest.prepareReaderPage(canvas.toDataURL(), 'dusty margin');
    const original = HTMLCanvasElement.prototype.getContext;
    let reads = 0;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => { reads++; throw new Error('Unexpected render-time analysis'); } });
    try {
      const pages = [prepared, { ...prepared, url: prepared.url + '#second' }];
      const render = (tightness: number, visiblePages = [1]) => window.readerTest.render(pages, visiblePages, true, 'single', { cropTightness: tightness });
      const conservative = render(0), middle = render(50), tight = render(100);
      const horizontal = window.readerTest.render(pages, [1], true, 'single', { cropTightness: 100, cropExtraHorizontal: 5 });
      const vertical = window.readerTest.render(pages, [1], true, 'single', { cropTightness: 100, cropExtraVertical: 5 });
      const options = { cropTightness: 100, cropExtraHorizontal: 10, cropExtraVertical: 10 };
      const maximum = window.readerTest.render(pages, [1], true, 'single', options);
      const turned = window.readerTest.render(pages, [2], true, 'single', options);
      const off = window.readerTest.render(pages, [2], false, 'single', options);
      return { conservative, middle, tight, horizontal, vertical, maximum, turned, off, reads };
    } finally { Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: original }); }
  });
  expect(result.tight[0].width).toBeLessThan(result.middle[0].width);
  expect(result.middle[0].width).toBeLessThan(result.conservative[0].width);
  expect(result.horizontal[0].width).toBeCloseTo(result.tight[0].width * .9, 2);
  expect(result.horizontal[0].height).toBe(result.tight[0].height);
  expect(result.vertical[0].width).toBe(result.tight[0].width);
  expect(result.vertical[0].height).toBeCloseTo(result.tight[0].height * .9, 2);
  expect(result.maximum[0].width).toBeCloseTo(result.tight[0].width * .8, 2);
  expect(result.maximum[0].height).toBeCloseTo(result.tight[0].height * .8, 2);
  expect(result.turned).toEqual(result.maximum);
  expect(result.off).toEqual([{ left: 0, top: 0, width: 100, height: 100 }]);
  expect(result.reads).toBe(0);
});

test('spread width allocation follows cropped proportions in either reading direction', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 100;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#808080'; context.fillRect(0, 0, 100, 100);
    const full = await window.readerTest.prepareReaderPage(canvas.toDataURL(), 'full bleed');
    context.fillStyle = 'white'; context.fillRect(90, 0, 10, 100);
    const margin = await window.readerTest.prepareReaderPage(canvas.toDataURL(), 'right margin');
    const pages = [full, margin];
    const options = { fit: 'width' as const, noUpscale: false, cropTightness: 100 };
    return {
      ltr: window.readerTest.render(pages, [1, 2], true, 'spread', options),
      rtl: window.readerTest.render(pages, [1, 2], true, 'spread', { ...options, direction: 'rtl' }),
    };
  });
  expect(result.ltr[0].width).toBeGreaterThan(result.ltr[1].width);
  expect(result.ltr[0].height).toBeCloseTo(result.ltr[1].height, 2);
  expect(result.rtl).toEqual([...result.ltr].reverse());
});
