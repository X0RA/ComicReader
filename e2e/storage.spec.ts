import { test, expect } from '@playwright/test';
// The harness bundles the real storage modules; it is never part of the app.
declare global { interface Window { storageTest: any } }
test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForFunction(() => !!window.storageTest); });

test('streams a comic, queries metadata, reads it and deletes both stores', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    await s.downloadComic({ id: 'one', url: '/comic.cbz', name: 'One' });
    const row = await s.getComicDownloadStatus('one');
    const size = await s.withArchive({ id: 'one', url: '/comic.cbz' }, (blob: Blob) => Promise.resolve(blob.size));
    await s.deleteDownloadedComic('one');
    return { row, size, remaining: await s.getDownloadedComics(), files: await Array.fromAsync((await s.archiveDirectory()).keys()) };
  });
  expect(result.row.backend).toBe('opfs'); expect(result.row.data).toBeUndefined();
  expect(result.row.fileSize).toBe(result.size); expect(result.remaining).toEqual([]); expect(result.files).toEqual([]);
});

test('deduplicates downloads across tabs', async ({ page, context }) => {
  let requests = 0;
  await context.route('**/comic.cbz', async route => { requests++; await new Promise(r => setTimeout(r, 100)); await route.continue(); });
  const other = await context.newPage(); await other.goto('/');
  await Promise.all([page, other].map(tab => tab.evaluate(() => window.storageTest.downloadComic({ id: 'one', url: '/comic.cbz' }))));
  expect(requests).toBe(1);
});

test('rejects invalid downloads without leaving files', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    let rejected = false;
    try { await s.downloadComic({ id: 'bad', url: '/invalid.cbz' }); } catch { rejected = true; }
    return { rejected, rows: await s.getDownloadedComics(), files: await Array.fromAsync((await s.archiveDirectory()).keys()) };
  });
  expect(result).toEqual({ rejected: true, rows: [], files: [] });
});

test('migrates a version 2 Blob with identical bytes and preserves progress', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    s.db.close();
    const blob = await (await fetch('/comic.cbz')).blob();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('ComicsDatabase', 20); // Dexie schema v2 maps to native version 20.
      request.onupgradeneeded = () => {
        for (const name of ['comics', 'readComics', 'lastReadComic', 'lastFolder', 'comicDownloads']) request.result.createObjectStore(name, { keyPath: 'id' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const tx = database.transaction(['comicDownloads', 'readComics'], 'readwrite');
        tx.objectStore('comicDownloads').put({ id: 'old', url: '/comic.cbz', status: 'completed', data: blob, progress: 100 });
        tx.objectStore('readComics').put({ id: 'old', lastPage: 7 });
        tx.oncomplete = () => { database.close(); resolve(); };
      };
    });
    await s.db.open();
    await s.maintainArchives();
    const row = await s.db.downloads.get('old');
    const copy = await s.readStored(row);
    return { backend: row.backend, equal: await copy.text() === await blob.text(), legacy: !!await s.db.comicDownloads.get('old'), progress: (await s.db.readComics.get('old')).lastPage };
  });
  expect(result).toEqual({ backend: 'opfs', equal: true, legacy: false, progress: 7 });
});

test('recovers interrupted writes and orphan files', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    await s.db.downloads.put({ id: 'dead', url: '/comic.cbz', backend: 'opfs', status: 'in_progress', archiveFile: 'partial.cbz', progress: 1 });
    await s.writeArchive('partial.cbz', new Blob(['partial']).stream());
    await s.writeArchive('orphan.cbz', new Blob(['orphan']).stream());
    await s.maintainArchives();
    return { rows: await s.db.downloads.count(), files: await Array.fromAsync((await s.archiveDirectory()).keys()) };
  });
  expect(result).toEqual({ rows: 0, files: [] });
});

test('uses IndexedDB when OPFS probe fails', async ({ page }) => {
  const result = await page.evaluate(async () => {
    Object.defineProperty(navigator.storage, 'getDirectory', { value: () => Promise.reject(new Error('unavailable')) });
    const s = window.storageTest;
    await s.downloadComic({ id: 'fallback', url: '/comic.cbz' });
    const row = await s.db.downloads.get('fallback');
    return { backend: row.backend, size: (await s.readStored(row)).size };
  });
  expect(result.backend).toBe('idb'); expect(result.size).toBeGreaterThan(0);
});

test('deletion waits for an active archive reader', async ({ page, context }) => {
  await page.evaluate(() => window.storageTest.downloadComic({ id: 'one', url: '/comic.cbz' }));
  const other = await context.newPage(); await other.goto('/');
  const reading = page.evaluate(() => window.storageTest.withArchive({ id: 'one', url: '/comic.cbz' }, async (blob: Blob) => {
    (window as any).reading = true;
    await new Promise(resolve => setTimeout(resolve, 300));
    return blob.arrayBuffer().then(buffer => buffer.byteLength);
  }));
  await page.waitForFunction(() => (window as any).reading);
  const deleting = other.evaluate(() => window.storageTest.deleteDownloadedComic('one'));
  expect(await reading).toBeGreaterThan(0);
  await deleting;
  expect(await page.evaluate(() => window.storageTest.db.downloads.count())).toBe(0);
});

test('migration defers when quota is insufficient, keeping the Blob readable', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    const blob = await (await fetch('/comic.cbz')).blob();
    await s.db.comicDownloads.put({ id: 'old', url: '/comic.cbz', data: blob, status: 'completed', progress: 100 });
    await s.db.downloads.put({ id: 'old', url: '/comic.cbz', backend: 'idb', fileSize: blob.size, status: 'completed', progress: 100 });
    Object.defineProperty(navigator.storage, 'estimate', { value: async () => ({ quota: 1024 ** 3, usage: 1024 ** 3 }) });
    await s.maintainArchives();
    const row = await s.db.downloads.get('old');
    return { backend: row.backend, readable: (await s.readStored(row)).size === blob.size };
  });
  expect(result).toEqual({ backend: 'idb', readable: true });
});

test('clear downloads removes failed rows and keeps reading progress', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    await s.db.readComics.put({ id: 'one', lastPage: 5 });
    await s.downloadComic({ id: 'one', url: '/comic.cbz' });
    try { await s.downloadComic({ id: 'bad', url: '/invalid.cbz' }); } catch { /* expected */ }
    await s.clearDownloads();
    return { rows: await s.db.downloads.count(), progress: (await s.db.readComics.get('one')).lastPage };
  });
  expect(result).toEqual({ rows: 0, progress: 5 });
});

test('IndexedDB fallback works without secure-context randomUUID', async ({ page }) => {
  const result = await page.evaluate(async () => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined });
    Object.defineProperty(navigator.storage, 'getDirectory', { value: undefined });
    const s = window.storageTest;
    await s.downloadComic({ id: 'http', url: '/comic.cbz' });
    return (await s.db.downloads.get('http')).backend;
  });
  expect(result).toBe('idb');
});

test('a slow transfer does not block cached reads or unrelated deletion', async ({ page }) => {
  await page.evaluate(async () => {
    const s = window.storageTest;
    await s.downloadComic({ id: 'cached', url: '/comic.cbz' });
    await s.downloadComic({ id: 'delete', url: '/comic.cbz' });
  });
  await page.route('**/slow.cbz', () => {});
  const slow = page.evaluate(async () => {
    const controller = new AbortController(); (window as any).slowController = controller;
    await window.storageTest.downloadComic({ id: 'slow', url: '/slow.cbz' }, controller.signal).catch(() => {});
  });
  await page.waitForFunction(async () => (await window.storageTest.db.downloads.get('slow'))?.status === 'in_progress');
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    return Promise.race([
      (async () => { await s.withArchive({ id: 'cached', url: '/comic.cbz' }, (b: Blob) => b.arrayBuffer()); await s.deleteDownloadedComic('delete'); return 'ready'; })(),
      new Promise(resolve => setTimeout(() => resolve('blocked'), 1500))
    ]);
  });
  expect(result).toBe('ready');
  await page.evaluate(() => (window as any).slowController.abort()); await slow;
});

test('reader errors preserve valid cached archives without redownloading', async ({ page }) => {
  let requests = 0;
  await page.route('**/comic.cbz', async route => { requests++; await route.continue(); });
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    await s.downloadComic({ id: 'one', url: '/comic.cbz' });
    try { await s.withArchive({ id: 'one', url: '/comic.cbz' }, () => { throw new RangeError('Out of memory'); }); } catch { /* expected */ }
    return (await s.db.downloads.get('one')).status;
  });
  expect(result).toBe('completed'); expect(requests).toBe(1);
});

test('hard reset still clears IndexedDB when OPFS is inaccessible', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    Object.defineProperty(navigator.storage, 'getDirectory', { value: () => Promise.reject(new DOMException('denied', 'SecurityError')) });
    await s.downloadComic({ id: 'one', url: '/comic.cbz' });
    await s.db.readComics.put({ id: 'one', lastPage: 5 });
    await s.hardReset(false);
    return { rows: await s.db.downloads.count(), progress: await s.db.readComics.count(), open: s.db.isOpen() };
  });
  expect(result).toEqual({ rows: 0, progress: 0, open: true });
});

test('failed database reset preserves archives and reopens Dexie', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    await s.downloadComic({ id: 'one', url: '/comic.cbz' });
    const original = indexedDB.deleteDatabase.bind(indexedDB);
    Object.defineProperty(indexedDB, 'deleteDatabase', { configurable: true, value: () => {
      const request: any = { error: new Error('reset denied') };
      setTimeout(() => request.onerror(), 0); return request;
    } });
    let rejected = false;
    try { await s.hardReset(false); } catch { rejected = true; }
    Object.defineProperty(indexedDB, 'deleteDatabase', { value: original });
    return { rejected, open: s.db.isOpen(), size: (await s.readStored(await s.db.downloads.get('one'))).size };
  });
  expect(result.rejected).toBe(true); expect(result.open).toBe(true); expect(result.size).toBeGreaterThan(0);
});

test('immediately reopening an aborted transfer starts fresh', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    const controller = new AbortController();
    const first = s.downloadComic({ id: 'one', url: '/comic.cbz' }, controller.signal).catch(() => {});
    controller.abort();
    const second = s.downloadComic({ id: 'one', url: '/comic.cbz' });
    await Promise.all([first, second]);
    return (await s.db.downloads.get('one')).status;
  });
  expect(result).toBe('completed');
});

test('transient archive read failures preserve files during open and maintenance', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    await s.downloadComic({ id: 'one', url: '/comic.cbz' });
    const original = FileSystemFileHandle.prototype.getFile;
    FileSystemFileHandle.prototype.getFile = async function() { throw new DOMException('busy', 'NotReadableError'); };
    try {
      await s.downloadComic({ id: 'one', url: '/comic.cbz' }).catch(() => {});
      await s.maintainArchives();
      return (await s.db.downloads.get('one')).status;
    } finally { FileSystemFileHandle.prototype.getFile = original; }
  });
  expect(result).toBe('completed');
});

test('the newest oversized comic survives maintenance', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    Object.defineProperty(navigator.storage, 'estimate', { value: async () => ({ quota: 100, usage: 0 }) });
    await s.downloadComic({ id: 'one', url: '/comic.cbz' });
    await s.maintainArchives();
    return (await s.db.downloads.get('one')).status;
  });
  expect(result).toBe('completed');
});

test('network errors before headers retry, while failed preloads preserve cache', async ({ page }) => {
  let attempts = 0;
  await page.route('**/comic.cbz', async route => { attempts++; if (attempts < 3) await route.abort('failed'); else await route.continue(); });
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    await s.downloadComic({ id: 'one', url: '/comic.cbz' });
    Object.defineProperty(navigator.storage, 'estimate', { value: async () => ({ quota: 100, usage: 0 }) });
    await s.downloadComic({ id: 'bad', url: '/invalid.cbz' }, undefined, true).catch(() => {});
    return (await s.db.downloads.get('one')).status;
  });
  expect(attempts).toBe(3); expect(result).toBe('completed');
});

test('accepts ZIP trailing bytes compatible with JSZip', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    const blob = await (await fetch('/comic.cbz')).blob();
    await s.verifyZip(new Blob([blob, '\n']));
    return true;
  });
  expect(result).toBe(true);
});

test('recovers old-tab Blobs and restores catalogue names', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    await s.db.comics.put({ id: 'root', content: [{ id: 'old', type: 'file', name: 'Old comic', link: '/comic.cbz' }] });
    await s.db.comicDownloads.put({ id: 'old', url: '/comic.cbz', status: 'completed', data: await (await fetch('/comic.cbz')).blob(), progress: 100 });
    await s.maintainArchives();
    return (await s.db.downloads.get('old')).name;
  });
  expect(result).toBe('Old comic');
});

test('downloads on an actual insecure origin', async ({ page }) => {
  await page.route('http://comic-reader.test:4319/**', async route => {
    const response = await route.fetch({ url: route.request().url().replace('comic-reader.test', '127.0.0.1') });
    await route.fulfill({ response });
  });
  await page.goto('http://comic-reader.test:4319/');
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    await s.downloadComic({ id: 'http', url: '/comic.cbz' });
    return { secure: isSecureContext, backend: (await s.db.downloads.get('http')).backend };
  });
  expect(result).toEqual({ secure: false, backend: 'idb' });
});

test('stalled response body times out and cleans its partial file', async ({ page }) => {
  await page.clock.install();
  const pending = page.evaluate(async () => {
    try { await window.storageTest.downloadComic({ id: 'stall', url: '/stall.cbz' }); return ''; }
    catch (error) { return String(error); }
  });
  await expect.poll(() => page.evaluate(async () => (await window.storageTest.db.downloads.get('stall'))?.receivedBytes)).toBe(32);
  await page.clock.fastForward(61_000);
  expect(await pending).toContain('stalled');
  expect(await page.evaluate(async () => Array.fromAsync((await window.storageTest.archiveDirectory()).keys()))).toEqual([]);
});

test('real quota failure keeps the existing comic', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Quota override uses Chromium CDP');
  await page.evaluate(() => window.storageTest.downloadComic({ id: 'keep', url: '/comic.cbz' }));
  const cdp = await context.newCDPSession(page);
  const { usage } = await cdp.send('Storage.getUsageAndQuota', { origin: 'http://127.0.0.1:4319' });
  await cdp.send('Storage.overrideQuotaForOrigin', { origin: 'http://127.0.0.1:4319', quotaSize: usage + 64 * 1024 });
  const result = await page.evaluate(async () => {
    const s = window.storageTest;
    let error = '';
    try { await s.downloadComic({ id: 'large', url: '/large.cbz' }); } catch (e) { error = (e as Error).name; }
    return { error, kept: (await s.db.downloads.get('keep')).status, files: await Array.fromAsync((await s.archiveDirectory()).keys()) };
  });
  expect(result.error).toBe('QuotaExceededError'); expect(result.kept).toBe('completed'); expect(result.files).toHaveLength(1);
});

test('renderer crash releases the download lock and recovers partial files', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Renderer crash uses Chromium CDP');
  const other = await context.newPage(); await other.goto('/');
  const cdp = await context.newCDPSession(other);
  const transfer = other.evaluate(() => window.storageTest.downloadComic({ id: 'crash', url: '/stall.cbz' })).catch(() => {});
  await expect.poll(() => page.evaluate(async () => (await window.storageTest.db.downloads.get('crash'))?.receivedBytes)).toBe(32);
  void cdp.send('Page.crash').catch(() => {});
  await other.waitForEvent('crash');
  await other.close(); await transfer;
  await page.evaluate(() => window.storageTest.maintainArchives());
  expect(await page.evaluate(() => window.storageTest.db.downloads.count())).toBe(0);
  expect(await page.evaluate(async () => Array.fromAsync((await window.storageTest.archiveDirectory()).keys()))).toEqual([]);
});

test('migration leaves the original readable while its copy is in progress', async ({ page, context }) => {
  await page.evaluate(async () => {
    const s = window.storageTest;
    await s.supportsOPFS();
    const blob = await (await fetch('/comic.cbz')).blob();
    await s.db.comicDownloads.put({ id: 'old', url: '/comic.cbz', status: 'completed', data: blob, progress: 100 });
    await s.db.downloads.put({ id: 'old', url: '/comic.cbz', status: 'completed', backend: 'idb', fileSize: blob.size, progress: 100 });
    const original = FileSystemFileHandle.prototype.createWritable;
    FileSystemFileHandle.prototype.createWritable = async function(options) {
      if (this.name.endsWith('.cbz')) await new Promise<void>(resolve => { (window as any).resumeMigration = resolve; });
      return original.call(this, options);
    };
  });
  const migration = page.evaluate(() => window.storageTest.maintainArchives());
  await page.waitForFunction(() => !!(window as any).resumeMigration);
  const other = await context.newPage(); await other.goto('/');
  const result = await other.evaluate(() => Promise.race([
    window.storageTest.withArchive({ id: 'old', url: '/comic.cbz' }, async (blob: Blob) => (await blob.arrayBuffer()).byteLength),
    new Promise(resolve => setTimeout(() => resolve('blocked'), 1500))
  ]));
  expect(typeof result).toBe('number');
  await page.evaluate(() => (window as any).resumeMigration()); await migration;
});
