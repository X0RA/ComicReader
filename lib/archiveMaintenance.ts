import { db } from './dexieDB';
import { ContentItem } from './types';
import { removeArchive, storageLock, supportsOPFS, writeArchive, uniqueId, namedLock, tryLock, writerKey, leaseKey } from './archiveStore';
import { enforceBudget, isUnavailable, readStored, removeStored, storageInfo, sweepArchives } from './downloads';

let running: Promise<void> | undefined;
export function maintainArchives() {
  return running ??= run().finally(() => { running = undefined; });
}
async function run() {
  const opfs = await supportsOPFS();
  const names = new Map<string, string>();
  const visit = (items: ContentItem[]) => items.forEach(item => {
    if (item.type === 'folder') visit(item.children);
    else names.set(`${item.id}:${item.link}`, item.name);
  });
  visit((await db.comics.get('root'))?.content ?? []);
  // Recover Blobs written by an old tab after the schema upgrade.
  for (const id of await db.comicDownloads.toCollection().primaryKeys()) {
    await tryLock(writerKey(String(id)), async () => {
      if (await db.downloads.get(id)) return;
      const legacy = await db.comicDownloads.get(id);
      if (legacy?.status === 'completed' && legacy.data) {
        const { data, ...metadata } = legacy;
        await storageLock(() => db.downloads.put({ ...metadata, backend: 'idb', fileSize: data.size, name: names.get(`${legacy.id}:${legacy.url}`), lastAccessedAt: legacy.downloadedAt }));
      } else await db.comicDownloads.delete(id);
    });
  }
  for (const candidate of await db.downloads.toArray()) {
    await tryLock(writerKey(candidate.id), async () => {
      let row = await db.downloads.get(candidate.id);
      if (!row) return;
      if (!row.name && names.has(`${row.id}:${row.url}`)) await db.downloads.update(row.id, { name: names.get(`${row.id}:${row.url}`) });
      if (row.status !== 'completed') {
        if (row.previous) {
          const prior = row.previous;
          await storageLock(() => db.downloads.put(prior));
          if (opfs && row.pendingFile) await removeArchive(row.pendingFile);
          row = prior;
        } else {
          if (row.backend !== 'opfs' || opfs) await namedLock(leaseKey(row.id), () => removeStored(row!));
          return;
        }
      }
      if (row.backend === 'opfs' && !opfs) return;
      try { await readStored(row); }
      catch (error) {
        if (isUnavailable(error)) await namedLock(leaseKey(row.id), () => removeStored(row!));
        return; // Permission, IO, and transient failures preserve the record.
      }
      if (row.pendingFile && opfs) {
        await removeArchive(row.pendingFile);
        await db.downloads.update(row.id, { pendingFile: undefined });
      }
    });
  }
  if (opfs) {
    // Intent is committed before file creation, so a sweep keeps active writes.
    await sweepArchives();
    const rows = await db.downloads.where('status').equals('completed').reverse().sortBy('lastAccessedAt');
    for (const candidate of rows) {
      if (candidate.backend !== 'idb') continue;
      await tryLock(writerKey(candidate.id), async () => {
        const row = await db.downloads.get(candidate.id);
        if (!row || row.backend !== 'idb' || row.status !== 'completed') return;
        let blob: Blob;
        try { blob = await readStored(row); } catch { return; }
        const info = await storageInfo();
        if (info.quota && info.quota - (info.usage ?? 0) < blob.size + 64 * 1024 ** 2) return;
        const name = `${uniqueId()}.cbz`;
        await storageLock(() => db.downloads.update(row.id, { pendingFile: name }));
        let published = false;
        try {
          const copy = await writeArchive(name, blob.stream());
          if (copy.size !== blob.size) throw new Error('Migration size mismatch');
          for (let offset = 0; offset < blob.size; offset += 8 * 1024 ** 2) {
            const end = offset + 8 * 1024 ** 2;
            const [a, b] = await Promise.all([blob.slice(offset, end).arrayBuffer(), copy.slice(offset, end).arrayBuffer()]);
            const bytes = new Uint8Array(b);
            if (new Uint8Array(a).some((value, index) => value !== bytes[index])) throw new Error('Migration verification failed');
          }
          await namedLock(leaseKey(row.id), () => storageLock(() => db.transaction('rw', db.downloads, db.comicDownloads, async () => {
            if ((await db.downloads.get(row.id))?.pendingFile !== name) throw new Error('Migration cancelled');
            await db.downloads.update(row.id, { backend: 'opfs', archiveFile: name, pendingFile: undefined });
            await db.comicDownloads.delete(row.id);
            published = true;
          })));
        } catch (error) {
          if (!published) await removeArchive(name).catch(() => {});
          console.warn('Archive migration deferred; original retained.', error);
        } finally {
          await storageLock(async () => {
            if ((await db.downloads.get(row.id))?.pendingFile === name) await db.downloads.update(row.id, { pendingFile: undefined });
          });
        }
      });
    }
  }
  await enforceBudget();
}
