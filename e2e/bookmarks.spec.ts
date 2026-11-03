import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForFunction(() => !!window.storageTest); });

test('bookmarks persist, update notes without duplication, and stay distinct between comics', async ({ page }) => {
  await page.evaluate(async () => {
    const s = window.storageTest;
    await s.saveBookmark({ comicId: 'one', comicName: 'One', page: 12, note: '  A great panel  ' });
    await s.saveBookmark({ comicId: 'two', comicName: 'Two', page: 12, note: '' });
    await s.saveBookmark({ comicId: 'one', comicName: 'One', page: 12, note: 'Updated reason' });
  });
  await page.reload(); await page.waitForFunction(() => !!window.storageTest);
  const rows = await page.evaluate(() => window.storageTest.db.bookmarks.toArray());
  expect(rows).toHaveLength(2);
  expect(rows.find((row: any) => row.comicId === 'one').note).toBe('Updated reason');
  expect(rows.find((row: any) => row.comicId === 'two').note).toBe('');
  await page.evaluate(() => window.storageTest.removeBookmark({ comicId: 'one', page: 12 }));
  expect(await page.evaluate(() => window.storageTest.db.bookmarks.count())).toBe(1);
});

test('download deletion preserves bookmarks, while a requested hard reset removes them', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    await s.saveBookmark({ comicId: 'one', comicName: 'One', page: 2, note: 'Keep this' });
    await s.downloadComic({ id: 'one', url: '/comic.cbz' });
    await s.deleteDownloadedComic('one');
    await s.clearDownloads();
    const retained = await s.db.bookmarks.count();
    await s.hardReset(false);
    return { retained, reset: await s.db.bookmarks.count() };
  });
  expect(result).toEqual({ retained: 1, reset: 0 });
});

test('upgrading the existing database adds bookmarks without changing progress or downloads', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = window.storageTest; s.db.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('ComicsDatabase', 30);
      request.onupgradeneeded = () => {
        for (const name of ['comics', 'readComics', 'lastReadComic', 'lastFolder', 'comicDownloads', 'downloads']) request.result.createObjectStore(name, { keyPath: 'id' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const tx = database.transaction(['readComics', 'downloads'], 'readwrite');
        tx.objectStore('readComics').put({ id: 'old', lastPage: 42, totalPages: 100 });
        tx.objectStore('downloads').put({ id: 'old', status: 'completed', backend: 'opfs', archiveFile: 'old.cbz' });
        tx.oncomplete = () => { database.close(); resolve(); };
      };
    });
    await s.db.open();
    await s.saveBookmark({ comicId: 'old', comicName: 'Existing comic', page: 42, note: '' });
    return { page: (await s.db.readComics.get('old')).lastPage, archive: (await s.db.downloads.get('old')).archiveFile, count: await s.db.bookmarks.count() };
  });
  expect(result).toEqual({ page: 42, archive: 'old.cbz', count: 1 });
});

test('bookmark links encode comic IDs and invalid page numbers are rejected', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    let rejected = 0;
    for (const number of [0, -1, 1.5, NaN]) {
      try { await s.saveBookmark({ comicId: 'one', comicName: 'One', page: number, note: '' }); } catch { rejected++; }
    }
    return { rejected, href: s.bookmarkUrl({ comicId: 'a/b c', page: 42 }) };
  });
  expect(result).toEqual({ rejected: 4, href: '/read/a%2Fb%20c?page=42' });
});
