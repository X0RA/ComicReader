import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultReaderSettings, effectiveReaderLayout, parseReaderSettings, tapNavigation } from './reader-settings.ts';
import { archiveImageNames, detectUniformMargins, FULL_PAGE, pairReaderPages, readerPageWidth } from './reader-pages.ts';
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
