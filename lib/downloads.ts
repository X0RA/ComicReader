import { db, DownloadRecord } from './dexieDB';
import { archiveDirectory, openArchive, removeArchive, storageLock, supportsOPFS, verifyZip, writeArchive, uniqueId, namedLock, tryLock, writerKey, leaseKey } from './archiveStore';

export interface ComicSource { id: string; url: string; name?: string }
export class ArchiveUnavailableError extends Error {}
export const isUnavailable = (error: unknown) => error instanceof ArchiveUnavailableError || (error instanceof DOMException && error.name === 'NotFoundError');
let channel: BroadcastChannel | undefined;
function cancellationChannel() {
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('comic-storage-cancel');
    channel.onmessage = event => { if (event.data?.type === 'cancel') abortDownloads(event.data.id); };
  }
  return channel;
}
interface Transfer { controller: AbortController; promise: Promise<void>; users: number }
const active = new Map<string, Transfer>();
export const getComicDownloadStatus = (id: string) => db.downloads.get(id);
export const getDownloadedComics = () => db.downloads.where('status').equals('completed').toArray();
export async function storageInfo() {
  const estimate = await navigator.storage?.estimate?.().catch(() => ({} as StorageEstimate)) ?? {};
  return { ...estimate, budget: Math.min(2 * 1024 ** 3, estimate.quota ? estimate.quota / 4 : Infinity),
    persistent: await navigator.storage?.persisted?.().catch(() => false) ?? false };
}
export async function readStored(row: DownloadRecord): Promise<Blob> {
  const blob = row.backend === 'opfs' ? await openArchive(row.archiveFile!) : (await db.comicDownloads.get(row.id))?.data;
  if (!blob || blob.size !== row.fileSize) throw new ArchiveUnavailableError('Saved archive is missing or incomplete.');
  return blob;
}
// Caller holds the writer and exclusive reader lease. Publication uses the same order.
export async function removeStored(row: DownloadRecord) {
  await storageLock(() => db.transaction('rw', db.downloads, db.comicDownloads, async () => {
    await db.downloads.delete(row.id);
    await db.comicDownloads.delete(row.id);
  }));
  if (row.archiveFile) await removeArchive(row.archiveFile);
  if (row.pendingFile) await removeArchive(row.pendingFile);
}
export async function enforceBudget(protectedId?: string) {
  const { budget } = await storageInfo();
  const rows = (await getDownloadedComics()).sort((a, b) => (a.lastAccessedAt ?? 0) - (b.lastAccessedAt ?? 0));
  let size = rows.reduce((sum, row) => sum + (row.fileSize ?? 0), 0);
  // Keep the newest archive even when it alone exceeds the budget.
  const newest = rows.at(-1)?.id;
  for (const row of rows) {
    if (size <= budget) break;
    if (row.id === protectedId || row.id === newest) continue;
    await tryLock(writerKey(row.id), () => tryLock(leaseKey(row.id), async () => {
      const current = await db.downloads.get(row.id);
      if (current?.token !== row.token || current?.status !== 'completed') return;
      await removeStored(current);
      size -= row.fileSize ?? 0;
    }));
  }
}
async function fetchHeaders(url: string, signal: AbortSignal) {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try { return await fetch(url, { signal }); }
    catch (error) {
      if (signal.aborted || attempt === 2) throw error;
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 250 * 2 ** attempt);
        signal.addEventListener('abort', abort, { once: true });
      });
    }
  }
}
async function transfer(comic: ComicSource, controller: AbortController, background: boolean) {
  const signal = controller.signal;
  // Fast path avoids waiting for a migration of an already readable archive.
  const cached = await namedLock(leaseKey(comic.id), async () => {
    const row = await db.downloads.get(comic.id);
    if (row?.status !== 'completed' || row.url !== comic.url) return false;
    try { await readStored(row); return true; } catch (error) { if (!isUnavailable(error)) throw error; return false; }
  }, 'shared', signal);
  if (cached) return;
  await namedLock(writerKey(comic.id), async () => {
    signal.throwIfAborted();
    const saved = await db.downloads.get(comic.id);
    if (saved?.status === 'completed' && saved.url === comic.url) {
      try { await readStored(saved); return; } catch (error) { if (!isUnavailable(error)) throw error; }
    }
    const backend = await supportsOPFS() ? 'opfs' : 'idb';
    const token = uniqueId();
    const pendingFile = backend === 'opfs' ? `${token}.cbz` : undefined;
    await storageLock(() => db.downloads.put({ ...comic, backend, token, pendingFile, archiveFile: saved?.archiveFile, previous: saved?.status === 'completed' ? saved : undefined, status: 'in_progress', progress: 0 }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let published = false;
    const watchdog = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(new Error('Download stalled. Please try again.')), ms);
    };
    try {
      watchdog(90_000);
      const response = await fetchHeaders(comic.url, signal);
      if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}).`);
      const total = Number(response.headers.get('Content-Length')) || 0;
      if (background) {
        const { budget } = await storageInfo();
        const used = (await getDownloadedComics()).reduce((sum, row) => sum + (row.fileSize ?? 0), 0);
        if (total && used + total > budget) { controller.abort(); throw new Error('Preload skipped: cache budget reached.'); }
      }
      let received = 0, lastUpdate = 0;
      watchdog(60_000);
      const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        async transform(chunk, output) {
          watchdog(60_000);
          received += chunk.byteLength;
          if (Date.now() - lastUpdate > 500) {
            lastUpdate = Date.now();
            await db.downloads.update(comic.id, { receivedBytes: received, progress: total ? Math.min(99, received / total * 100) : 0 }).catch(() => {});
          }
          output.enqueue(chunk);
        }
      }), { signal });
      const blob = pendingFile ? await writeArchive(pendingFile, stream, signal) : await new Response(stream).blob();
      clearTimeout(timer);
      signal.throwIfAborted();
      if (blob.size !== received || (total && received < total)) throw new Error('The download was truncated.');
      await verifyZip(blob);
      await namedLock(leaseKey(comic.id), () => storageLock(async () => {
        signal.throwIfAborted();
        if (background) {
          const { budget } = await storageInfo();
          const used = (await getDownloadedComics()).reduce((sum, row) => sum + (row.fileSize ?? 0), 0);
          if (used + blob.size > budget) throw new Error('Preload skipped: cache budget reached.');
        }
        await db.transaction('rw', db.downloads, db.comicDownloads, async () => {
          if ((await db.downloads.get(comic.id))?.token !== token) throw new Error('Download cancelled.');
          if (backend === 'idb') await db.comicDownloads.put({ ...comic, data: blob, status: 'completed', progress: 100, fileSize: blob.size });
          else await db.comicDownloads.delete(comic.id);
          await db.downloads.put({ ...comic, backend, token, archiveFile: pendingFile, status: 'completed', progress: 100, fileSize: blob.size, receivedBytes: received, downloadedAt: Date.now(), lastAccessedAt: Date.now() });
        });
        published = true;
        if (saved?.archiveFile) await removeArchive(saved.archiveFile).catch(console.warn);
      }), 'exclusive', signal);
    } catch (error) {
      if (!published) {
        if (pendingFile) await removeArchive(pendingFile).catch(() => {});
        await storageLock(async () => {
          if ((await db.downloads.get(comic.id))?.token !== token) return;
          if (saved?.status === 'completed') await db.downloads.put(saved);
          else await db.downloads.update(comic.id, { status: 'failed', pendingFile: undefined, error: error instanceof Error ? error.message : String(error) });
        }).catch(console.warn);
      }
      throw error;
    } finally { clearTimeout(timer); }
  }, 'exclusive', signal);
  if (!background) await enforceBudget(comic.id).catch(console.warn);
}
export function downloadComic(comic: ComicSource, signal?: AbortSignal, background = false): Promise<void> {
  cancellationChannel();
  if (signal?.aborted) return Promise.reject(signal.reason);
  const key = `${comic.id}:${comic.url}`;
  let entry = active.get(key);
  if (!entry || entry.controller.signal.aborted) {
    const controller = new AbortController();
    const item: Transfer = { controller, users: 0, promise: Promise.resolve() };
    item.promise = transfer(comic, controller, background).finally(() => { if (active.get(key) === item) active.delete(key); });
    active.set(key, item);
    entry = item;
  }
  const item = entry;
  item.users++;
  return new Promise<void>((resolve, reject) => {
    let finished = false;
    const done = (error?: unknown) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', aborted);
      item.users--;
      if (!item.users && signal?.aborted) item.controller.abort(signal.reason);
      if (error !== undefined) reject(error); else resolve();
    };
    const aborted = () => done(signal?.reason ?? new DOMException('Cancelled', 'AbortError'));
    signal?.addEventListener('abort', aborted, { once: true });
    item.promise.then(() => done(), done);
  });
}
let preload: Promise<void> | undefined;
let preloadId: string | undefined;
export function preloadComic(comic: ComicSource) {
  if (!preload) {
    preloadId = comic.id;
    preload = downloadComic(comic, undefined, true).catch(() => {}).finally(() => { preload = undefined; preloadId = undefined; });
  }
}
export async function withArchive<T>(comic: ComicSource, fn: (blob: Blob) => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (preloadId && preloadId !== comic.id) abortDownloads(preloadId);
  for (let attempt = 0; ; attempt++) {
    await downloadComic(comic, signal);
    let storageFailure = false;
    try {
      return await namedLock(leaseKey(comic.id), async () => {
        let blob: Blob;
        try {
          const row = await db.downloads.get(comic.id);
          if (!row || row.url !== comic.url || row.status !== 'completed') throw new ArchiveUnavailableError('Archive no longer available.');
          blob = await readStored(row);
        } catch (error) { storageFailure = isUnavailable(error); throw error; }
        // Callback failures (including OOM) are not evidence that stored bytes are bad.
        const result = await fn(blob);
        await db.downloads.update(comic.id, { lastAccessedAt: Date.now() });
        return result;
      }, 'shared', signal);
    } catch (error) {
      if (!storageFailure || attempt > 0 || signal?.aborted) throw error;
      // Eviction may have occurred between the cache lookup and acquiring the
      // reader lease. Retry only a confirmed missing or size-mismatched archive.
    }
  }
}

function abortDownloads(id?: string) {
  for (const [key, item] of active) if (!id || key.startsWith(`${id}:`)) item.controller.abort();
}
export async function deleteDownloadedComic(id: string) {
  abortDownloads(id);
  cancellationChannel()?.postMessage({ type: 'cancel', id });
  await namedLock(writerKey(id), () => namedLock(leaseKey(id), async () => {
    const row = await db.downloads.get(id);
    if (row) await removeStored(row); else await db.comicDownloads.delete(id);
  }));
}
export async function clearDownloads() {
  abortDownloads();
  cancellationChannel()?.postMessage({ type: 'cancel' });
  const ids = new Set([...(await db.downloads.toCollection().primaryKeys()), ...(await db.comicDownloads.toCollection().primaryKeys())]);
  for (const id of ids) await deleteDownloadedComic(String(id));
  await sweepArchives();
}
export async function sweepArchives() {
  if (!await supportsOPFS()) return;
  await storageLock(async () => {
    const files: string[] = [];
    for await (const name of (await archiveDirectory() as FileSystemDirectoryHandle & { keys(): AsyncIterable<string> }).keys()) files.push(name);
    const referenced = new Set((await db.downloads.toArray()).flatMap(row => [row.archiveFile, row.pendingFile]));
    for (const name of files) if (!name.startsWith('.probe-') && !referenced.has(name)) await removeArchive(name);
  });
}
export async function hardReset(reload = true) {
  abortDownloads();
  cancellationChannel()?.postMessage({ type: 'cancel' });
  await Promise.allSettled([...active.values()].map(item => item.promise));
  await storageLock(async () => {
    db.close();
    try {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('ComicsDatabase');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new DOMException('Close other comic reader tabs, then reload to complete the reset.', 'InvalidStateError'));
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'InvalidStateError') void db.open().catch(() => {});
      else await db.open().catch(() => {});
      throw error;
    }
    // Database reset remains useful even if OPFS is denied or unavailable.
    let root: FileSystemDirectoryHandle | undefined;
    try { root = await navigator.storage?.getDirectory?.(); } catch { /* unavailable backend */ }
    try {
      await root?.removeEntry('archives', { recursive: true });
    } catch (error) {
      if (!isUnavailable(error)) throw new Error('Database reset succeeded, but archive files could not be removed. Retry the reset.');
    } finally { await db.open(); }
  });
  if (reload) location.reload();
}
