import { test, expect } from '../e2e/storage-context';
import type { BrowserContext } from '@playwright/test';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {} from './seed';

let harness: string;
async function disconnect(context: BrowserContext) {
  await context.addCookies([{ name: 'offline-test-network', value: 'disconnected', url: 'http://127.0.0.1:4322' }]);
  await context.setOffline(true);
}
test.beforeAll(async () => {
  harness = (await build({ entryPoints: ['offline-tests/seed.ts'], bundle: true, write: false, format: 'iife', platform: 'browser' })).outputFiles[0].text;
});
test.beforeEach(async ({ page }) => {
  await page.goto('/downloaded');
  await expect(page.locator('[data-offline-status]')).toHaveAttribute('data-offline-status', 'ready', { timeout: 30000 });
  await page.addScriptTag({ content: harness });
  await page.evaluate(() => window.offlineTest.seed());
});

test('cold offline launch opens unvisited downloads, saves bookmarks and resumes progress', async ({ page, context }) => {
  await page.close();
  await disconnect(context);
  const reader = await context.newPage();
  const errors: string[] = []; reader.on('pageerror', error => errors.push(error.message));
  await reader.goto('/');
  await expect(reader.locator('html')).toHaveAttribute('data-offline-app', 'true');
  await expect(reader.getByText('Offline — downloaded comics are available on this device.')).toBeVisible();
  await reader.goto('/downloaded');
  await reader.getByRole('link', { name: 'saved-idb', exact: true }).click();
  await expect(reader.getByText('Page 5 of 8', { exact: true })).toHaveCount(1);
  await expect(reader.locator('img').first()).toBeVisible();
  await expect.poll(() => reader.locator('img').first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await reader.getByRole('button', { name: 'View options', exact: true }).click();
  await reader.getByRole('slider', { name: 'Brightness', exact: true }).fill('80');
  await reader.getByRole('button', { name: 'Close view options' }).click();
  await reader.keyboard.press('ArrowRight');
  await expect(reader.getByText('Page 6 of 8', { exact: true })).toHaveCount(1);
  await reader.getByRole('button', { name: 'Bookmark page', exact: true }).click();
  await reader.getByRole('textbox', { name: 'Note (optional)' }).fill('Saved without a network');
  await reader.getByRole('button', { name: 'Save bookmark', exact: true }).click();
  await reader.addScriptTag({ content: harness });
  await expect.poll(() => reader.evaluate(async () => (await window.offlineTest.db.readComics.get('saved-idb'))?.lastPage)).toBe(6);
  await reader.reload();
  await expect(reader.getByText('Page 6 of 8', { exact: true })).toHaveCount(1);
  expect(await reader.evaluate(() => JSON.parse(localStorage.getItem('comic-reader-view-options')!).brightness)).toBe(80);
  await reader.getByRole('button', { name: 'Back to library folder' }).click();
  await expect(reader.locator('[data-offline-status]')).toBeVisible();
  await reader.goto('/bookmarks');
  await expect(reader.getByText('Saved without a network')).toBeVisible();
  await reader.goto('/downloaded');
  await reader.getByRole('link', { name: 'saved-opfs', exact: true }).click();
  await expect(reader.getByText('Page 2 of 8', { exact: true })).toHaveCount(1);
  await reader.goto('/read/saved-opfs?page=7');
  await expect(reader.getByText('Page 7 of 8', { exact: true })).toHaveCount(1);
  await reader.goto('/backup');
  await expect(reader.getByRole('heading', { name: 'Backup & transfer' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('offline downloads survive a changed URL and a missing catalog', async ({ page, context }) => {
  await page.evaluate(async () => {
    const data = (await window.offlineTest.db.getComicsData())!;
    for (const item of data) if (item.type === 'file') item.link = '/new-location.cbz';
    await window.offlineTest.db.storeComicsData(data);
  });
  await disconnect(context);
  await page.goto('/read/saved-idb');
  await expect(page.getByText('Page 5 of 8', { exact: true })).toHaveCount(1);
  await page.addScriptTag({ content: harness });
  await page.evaluate(() => window.offlineTest.db.comics.clear());
  await page.goto('/read/saved-opfs');
  await expect(page.getByText('Page 2 of 8', { exact: true })).toHaveCount(1);
});

test('offline uncached comic fails clearly without a new download record', async ({ page, context }) => {
  await disconnect(context);
  await page.goto('/read/not-downloaded');
  await expect(page.getByRole('alert')).toContainText('not downloaded on this device');
  await page.addScriptTag({ content: harness });
  expect(await page.evaluate(() => window.offlineTest.db.downloads.count())).toBe(2);
});

test('next online launch repairs a reclaimed offline asset', async ({ page }) => {
  const removed = await page.evaluate(async () => {
    const name = (await caches.keys()).find(name => name.startsWith('comic-reader-app-'))!;
    const cache = await caches.open(name);
    const url = (await cache.keys()).find(request => request.url.endsWith('/app.js'))!.url;
    await cache.delete(url);
    return { name, url };
  });
  await page.reload();
  await expect(page.locator('[data-offline-status]')).toHaveAttribute('data-offline-status', 'ready');
  expect(await page.evaluate(async ({ name, url }) => !!await (await caches.open(name)).match(url), removed)).toBe(true);
});

test('offline reading survives a full browser restart', async ({ playwright, browserName }) => {
  const profile = await mkdtemp(join(tmpdir(), 'comic-offline-'));
  let context: BrowserContext | undefined;
  try {
    context = await playwright[browserName].launchPersistentContext(profile, { baseURL: 'http://127.0.0.1:4322' });
    let page = await context.newPage();
    await page.goto('/downloaded');
    await expect(page.locator('[data-offline-status]')).toHaveAttribute('data-offline-status', 'ready', { timeout: 30000 });
    await page.addScriptTag({ content: harness });
    await page.evaluate(() => window.offlineTest.seed());
    await context.close();
    context = await playwright[browserName].launchPersistentContext(profile, { baseURL: 'http://127.0.0.1:4322' });
    await disconnect(context);
    page = await context.newPage();
    await page.goto('/read/saved-idb');
    await expect(page.locator('html')).toHaveAttribute('data-offline-app', 'true');
    await expect(page.getByText('Page 5 of 8', { exact: true })).toHaveCount(1);
    await expect.poll(() => page.locator('img').first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

for (const network of ['disconnected', 'stalled']) test(`switch between downloads with a ${network} network while the browser reports online`, async ({ page, context }) => {
  await page.reload();
  await expect(page.getByRole('link', { name: 'saved-idb', exact: true })).toBeVisible();
  await context.addCookies([{ name: 'offline-test-network', value: network, url: 'http://127.0.0.1:4322' }]);
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  await page.getByRole('link', { name: 'saved-idb', exact: true }).click();
  await expect(page.getByText('Page 5 of 8', { exact: true })).toHaveCount(1);
  await page.evaluate(() => { document.documentElement.dataset.testReader = 'first'; });
  await page.getByRole('button', { name: 'Next chapter', exact: true }).filter({ visible: true }).click();
  await expect(page.getByText('Page 2 of 8', { exact: true })).toHaveCount(1);
  await expect(page.locator('html')).toHaveAttribute('data-test-reader', 'first');
  await page.goBack();
  await expect(page.getByText('Page 5 of 8', { exact: true })).toHaveCount(1);
});

test('a backup link waits for confirmation before it changes stored settings', async ({ page }) => {
  const token = await page.evaluate(() => {
    const backup = { format: 'comic-reader-backup', version: 1, exportedAt: new Date().toISOString(),
      settings: { theme: 'gruvbox', reader: {} }, bookmarks: [], progress: [], navigation: {} };
    localStorage.setItem('theme', 'dark');
    return 'j1.' + btoa(JSON.stringify(backup)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  });
  await page.goto('/import#' + token);
  const confirm = page.getByRole('button', { name: 'Import this backup' });
  await expect(confirm).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
  await confirm.click();
  await expect(page.getByText('Import complete.')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('gruvbox');
  expect(new URL(page.url()).hash).toBe('');
});

test('precache excludes the large upscale WASM, Retry online reacts to reconnect, and offline/legacy backup imports stay intact', async ({ page, context, browserName }) => {
  const cachedUrls = await page.evaluate(async () => {
    const name = (await caches.keys()).find(key => key.startsWith('comic-reader-app-'))!;
    return (await (await caches.open(name)).keys()).map(req => new URL(req.url).pathname);
  });
  expect(cachedUrls.some(url => url.endsWith('.wasm'))).toBe(false);

  const token = await page.evaluate(() => {
    const backup = { format: 'comic-reader-backup', version: 1, exportedAt: new Date().toISOString(),
      settings: { theme: 'gruvbox', reader: {} }, bookmarks: [], progress: [], navigation: {} };
    localStorage.setItem('theme', 'dark');
    return 'j1.' + btoa(JSON.stringify(backup)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  });

  // Legacy /import/<payload> stays in the online shell (no SW opaqueredirect trap) and moves token to hash.
  await page.goto('/import/' + token);
  await expect(page.locator('html')).not.toHaveAttribute('data-offline-app', 'true');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/import');
  await expect.poll(() => new URL(page.url()).hash).toBe('#' + token);

  // Offline launch shows Retry online once connectivity returns, and offline backup import keeps its result visible.
  await disconnect(context);
  await page.goto('/downloaded');
  await expect(page.locator('html')).toHaveAttribute('data-offline-app', 'true');
  await expect(page.getByRole('button', { name: 'Retry online' })).toHaveCount(0);
  await context.setOffline(false);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
  // Playwright's Firefox offline toggle updates navigator.onLine without firing window's online event.
  if (browserName === 'firefox') await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('button', { name: 'Retry online' })).toBeVisible();

  await disconnect(context);
  await page.goto('/import#' + token);
  await expect(page.locator('html')).toHaveAttribute('data-offline-app', 'true');
  await page.getByRole('button', { name: 'Import this backup' }).click();
  await expect(page.getByText('Import complete.')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
});

for (const offline of [false, true]) test(`native fullscreen spans chapter turns in the ${offline ? 'offline' : 'online'} reader`, async ({ page, context }) => {
  if (offline) await disconnect(context);
  await page.goto('/read/saved-idb');
  await page.getByRole('button', { name: 'Enter fullscreen' }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  const next = page.getByRole('button', { name: 'Next chapter', exact: true }).filter({ visible: true }).first();
  await next.focus();
  await next.press('Enter');
  await expect(page.getByText('Page 2 of 8', { exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  const leave = page.getByRole('button', { name: 'Back to library folder' });
  await leave.focus();
  await leave.press('Enter');
  await expect(page.locator('[data-offline-status]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});
