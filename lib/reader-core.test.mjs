import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultReaderSettings, effectiveReaderLayout, parseReaderSettings, tapNavigation } from './reader-settings.ts';
import { archiveImageNames, croppedPageSize, detectTightMargins, detectUniformMargins, FULL_PAGE, pairReaderPages, readerCropBounds, readerPageWidth } from './reader-pages.ts';
import { findReaderChapter } from './reader-catalog.ts';

const portrait = { width: 600, height: 900 };
const wide = { width: 1200, height: 800 };

test('spread pairing keeps a cover, an intervening wide page and trailing page intact', () => {
  const pages = [portrait, portrait, wide, portrait, portrait, portrait];
  assert.deepEqual(pairReaderPages(pages, true, true), [[1], [2], [3], [4, 5], [6]]);
  assert.deepEqual(pairReaderPages(pages, false, false), [[1, 2], [3, 4], [5, 6]]);
  assert.deepEqual(pairReaderPages([wide, wide, portrait], true, true), [[1], [2], [3]]);
  assert.deepEqual(pairReaderPages([], true, true), []);
});

test('every page occurs exactly once across all cover/wide policies', () => {
  const pages = Array.from({ length: 31 }, (_, index) => index % 7 === 3 ? wide : portrait);
  for (const cover of [true, false]) for (const alone of [true, false]) {
    const spreads = pairReaderPages(pages, cover, alone);
    assert.deepEqual(spreads.flat(), pages.map((_, index) => index + 1));
    assert.ok(spreads.every(spread => spread.length >= 1 && spread.length <= 2));
    if (alone) for (const spread of spreads) if (spread.some(number => pages[number - 1] === wide)) assert.equal(spread.length, 1);
  }
});

test('discovering distant wide pages preserves the visible spread and all page numbers', () => {
  const pages = [portrait, portrait, portrait, portrait, portrait, portrait, portrait, portrait];
  assert.deepEqual(pairReaderPages(pages, true, true).find(group => group.includes(4)), [4, 5]);
  pages[1] = wide;
  const groups = pairReaderPages(pages, true, true, [4, 5]);
  assert.deepEqual(groups.find(group => group.includes(4)), [4, 5]);
  assert.deepEqual(groups.flat(), [1, 2, 3, 4, 5, 6, 7, 8]);
  // A pending visible page that turns out to be wide must still stand alone.
  pages[3] = wide;
  assert.deepEqual(pairReaderPages(pages, true, true, [4, 5]).find(group => group.includes(4)), [4]);
});

test('responsive defaults and auto spread respect explicit webtoon layout', () => {
  const desktop = defaultReaderSettings(false), phone = defaultReaderSettings(true);
  assert.equal(desktop.layout, 'spread');
  assert.equal(desktop.fit, 'height');
  assert.equal(phone.layout, 'webtoon');
  assert.equal(phone.shadow, false);
  assert.equal(effectiveReaderLayout(phone, true), 'webtoon');
  assert.equal(effectiveReaderLayout({ ...phone, layout: 'single' }, true), 'spread');
  assert.equal(effectiveReaderLayout({ ...phone, layout: 'spread' }, false), 'single');
  assert.equal(effectiveReaderLayout(desktop, false), 'spread');
});

test('settings tolerate corruption, partial versions, wrong types and untrusted bounds', () => {
  assert.deepEqual(parseReaderSettings('{broken', true), defaultReaderSettings(true));
  assert.deepEqual(parseReaderSettings('null', false), defaultReaderSettings(false));
  assert.deepEqual(parseReaderSettings('[]', false), defaultReaderSettings(false));
  const parsed = parseReaderSettings(JSON.stringify({ layout: 'webtoon', fit: 'height', zoom: 9999, maxWidth: -5, brightness: '20', crop: 'yes', shadow: false, direction: 'sideways', unexpected: 'ignored' }), false);
  assert.equal(parsed.fit, 'width');
  assert.equal(parsed.zoom, 200);
  assert.equal(parsed.maxWidth, 400);
  assert.equal(parsed.brightness, 100);
  assert.equal(parsed.crop, false);
  assert.equal(parsed.shadow, false);
  assert.equal(parsed.direction, 'ltr');
  assert.equal('unexpected' in parsed, false);
});

test('RTL reverses side taps in paged layouts; swap and vertical taps remain independent', () => {
  const settings = { ...defaultReaderSettings(false), direction: 'rtl' };
  assert.equal(tapNavigation(settings, .1, true), 1);
  assert.equal(tapNavigation(settings, .9, true), -1);
  assert.equal(tapNavigation(settings, .5, true), 0);
  assert.equal(tapNavigation(settings, .1, false), -1);
  assert.equal(tapNavigation({ ...settings, swapTapZones: true }, .1, true), -1);
  assert.equal(tapNavigation({ ...settings, tapZones: 'vertical' }, .1, true), -1);
  assert.equal(tapNavigation({ ...settings, tapZones: 'off' }, .1, true), 0);
});

test('fit/zoom preserve aspect ratio and the no-upscale ceiling', () => {
  assert.equal(readerPageWidth(portrait, 'height', 1000, 450, 100, true), 300);
  assert.equal(readerPageWidth(portrait, 'width', 1200, 900, 200, true), 600);
  assert.equal(readerPageWidth(portrait, 'width', 1200, 900, 200, false), 2400);
  assert.equal(readerPageWidth(portrait, 'original', 300, 300, 50, true), 300);
});

function pixels(background, border = 0, transparent = false) {
  const data = new Uint8ClampedArray(100 * 100 * 4);
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
    const i = (y * 100 + x) * 4;
    const edge = x < border || y < border || x >= 100 - border || y >= 100 - border;
    data[i] = data[i + 1] = data[i + 2] = edge ? background : 127;
    data[i + 3] = transparent && edge ? 0 : 255;
  }
  return data;
}

test('crop detects real uniform light/dark margins and retains safety padding', () => {
  const expected = { left: .09, top: .09, right: .91, bottom: .91 };
  assert.deepEqual(detectUniformMargins(pixels(255, 10), 100, 100), expected);
  assert.deepEqual(detectUniformMargins(pixels(0, 10), 100, 100), expected);
});

test('crop leaves blank, transparent, nonuniform and overlarge edge regions alone', () => {
  const blank = new Uint8ClampedArray(100 * 100 * 4).fill(255);
  assert.deepEqual(detectUniformMargins(blank, 100, 100), FULL_PAGE);
  assert.deepEqual(detectUniformMargins(pixels(255, 20), 100, 100), FULL_PAGE);
  assert.deepEqual(detectUniformMargins(pixels(255, 10, true), 100, 100), FULL_PAGE);
  assert.deepEqual(detectUniformMargins(pixels(127), 100, 100), FULL_PAGE);
});

test('tight crop tolerates tinted paper and isolated dust on an asymmetric right margin', () => {
  const data = pixels(255, 10);
  // A wider right margin and off-white paper with faint scan texture.
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
    if (x < 10 || x >= 87 || y < 10 || y >= 90) {
      const i = (y * 100 + x) * 4, variation = (x + y) % 7;
      data.set([250 - variation, 241 - variation, 225 - variation, 255], i);
    }
  }
  data.set([0, 0, 0, 255], (40 * 100 + 98) * 4);
  data.set([0, 0, 0, 255], (41 * 100 + 98) * 4);
  const bounds = detectTightMargins(data, 100, 100);
  assert.deepEqual(bounds, { left: .0975, top: .0975, right: .8725, bottom: .9025 });
  assert.ok(1 - bounds.right > bounds.left);
});

test('tight crop preserves thin connected ink and small lettering near an edge', () => {
  const data = pixels(255, 10);
  // A 1-pixel-wide line must not be discarded as dust, nor a 3-pixel glyph.
  for (let y = 30; y < 50; y++) data.set([0, 0, 0, 255], (y * 100 + 96) * 4);
  for (const [x, y] of [[3, 70], [4, 71], [3, 72]]) data.set([0, 0, 0, 255], (y * 100 + x) * 4);
  const bounds = detectTightMargins(data, 100, 100);
  assert.ok(bounds.left < .03);
  assert.ok(bounds.right > .96);
});

test('tight crop protects blank, transparent, coloured, full-bleed and overlarge margins', () => {
  const blank = new Uint8ClampedArray(100 * 100 * 4).fill(255);
  assert.deepEqual(detectTightMargins(blank, 100, 100), FULL_PAGE);
  assert.deepEqual(detectTightMargins(pixels(255, 20), 100, 100), FULL_PAGE);
  assert.deepEqual(detectTightMargins(pixels(255, 10, true), 100, 100), FULL_PAGE);
  assert.deepEqual(detectTightMargins(pixels(127), 100, 100), FULL_PAGE);
  const coloured = pixels(255, 10);
  for (let i = 0; i < coloured.length; i += 4) if (coloured[i] === 255) coloured[i + 1] = 0;
  assert.deepEqual(detectTightMargins(coloured, 100, 100), FULL_PAGE);
  assert.deepEqual(detectTightMargins(new Uint8ClampedArray(0), 100, 100), FULL_PAGE);
});

test('tight crop handles black margins and independently estimates opposite edge colours', () => {
  assert.deepEqual(detectTightMargins(pixels(0, 10), 100, 100), { left: .0975, top: .0975, right: .9025, bottom: .9025 });
  const data = pixels(255, 10);
  for (let y = 0; y < 100; y++) for (let x = 0; x < 10; x++) data.set([0, 0, 0, 255], (y * 100 + x) * 4);
  const bounds = detectTightMargins(data, 100, 100);
  assert.equal(bounds.left, .0975);
  assert.equal(bounds.right, .9025);
});

test('tightness is bounded, monotonic, instant geometry and disabled crop restores the original', () => {
  const page = { width: 100, height: 200, crop: { left: .01, top: .02, right: .99, bottom: .98 }, tightCrop: { left: .09, top: .08, right: .87, bottom: .92 } };
  assert.deepEqual(readerCropBounds(page, true, 0), page.crop);
  assert.deepEqual(readerCropBounds(page, true, -5), page.crop);
  assert.deepEqual(readerCropBounds(page, true, 100), page.tightCrop);
  assert.deepEqual(readerCropBounds(page, false, 100), FULL_PAGE);
  const middle = readerCropBounds(page, true, 50);
  assert.ok(middle.left > page.crop.left && middle.left < page.tightCrop.left);
  assert.ok(middle.right < page.crop.right && middle.right > page.tightCrop.right);
  const size = croppedPageSize(page, middle);
  assert.ok(Math.abs(size.width - 88) < 1e-9);
  assert.ok(Math.abs(size.height - 180) < 1e-9);
});

test('extended tightness trims beyond detection, stays bounded and works without a detected border', () => {
  for (const tightCrop of [FULL_PAGE, { left: .1, top: .12, right: .86, bottom: .9 }]) {
    const page = { width: 600, height: 900, crop: FULL_PAGE, tightCrop };
    let previous = tightCrop;
    for (const value of [105, 150, 250, 400, 500]) {
      const bounds = readerCropBounds(page, true, value);
      assert.ok(bounds.left > previous.left && bounds.top > previous.top);
      assert.ok(bounds.right < previous.right && bounds.bottom < previous.bottom);
      assert.ok(bounds.left < bounds.right && bounds.top < bounds.bottom);
      previous = bounds;
    }
    const maximum = readerCropBounds(page, true, 500);
    assert.ok(Math.abs((maximum.right - maximum.left) / (tightCrop.right - tightCrop.left) - .8) < 1e-9);
    assert.ok(Math.abs((maximum.bottom - maximum.top) / (tightCrop.bottom - tightCrop.top) - .8) < 1e-9);
    assert.deepEqual(readerCropBounds(page, true, 1000), maximum);
    assert.deepEqual(readerCropBounds(page, false, 500), FULL_PAGE);
    assert.deepEqual(readerCropBounds(page, true, NaN), FULL_PAGE);
  }
});

test('crop tightness settings migrate, clamp, reject invalid values and persist', () => {
  assert.equal(parseReaderSettings('{"crop":true}', false).cropTightness, 50);
  assert.equal(parseReaderSettings('{"cropTightness":200}', false).cropTightness, 200);
  assert.equal(parseReaderSettings('{"cropTightness":900}', false).cropTightness, 500);
  assert.equal(parseReaderSettings('{"cropTightness":-20}', false).cropTightness, 0);
  assert.equal(parseReaderSettings('{"cropTightness":"90"}', false).cropTightness, 50);
  const settings = { ...defaultReaderSettings(false), crop: true, cropTightness: 450 };
  assert.deepEqual(parseReaderSettings(JSON.stringify(settings), false), settings);
});

test('archive filenames sort naturally and omit hidden/metadata files', () => {
  assert.deepEqual(archiveImageNames(['page10.JPG', 'page2.png', 'page1.webp', '__MACOSX/page3.jpg', 'folder/.secret/4.png', '.cover.jpg', 'ComicInfo.xml']), ['page1.webp', 'page2.png', 'page10.JPG']);
});

test('chapters are natural ordered supported archives in the same folder', () => {
  const file = (id, name, extension = 'cbz') => ({ id, name, extension, type: 'file', link: 'https://example.invalid/file.cbz' });
  const items = [{ id: 'other', type: 'folder', children: [file('outside', '001.cbz')] }, { id: 'series', type: 'folder', children: [file('10', 'Chapter 10.cbz'), file('2', 'Chapter 2.cbz'), file('1', 'Chapter 1.cbz'), file('text', 'notes.txt', 'txt')] }];
  const middle = findReaderChapter(items, '2');
  assert.equal(middle.folderId, 'series');
  assert.equal(middle.previous.id, '1');
  assert.equal(middle.next.id, '10');
  assert.equal(findReaderChapter(items, '1').previous, undefined);
  assert.equal(findReaderChapter(items, '10').next, undefined);
  assert.equal(findReaderChapter(items, 'unknown'), undefined);
});
