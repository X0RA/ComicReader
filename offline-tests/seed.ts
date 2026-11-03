import JSZip from 'jszip';
import { db } from '../lib/dexieDB';
import { supportsOPFS, writeArchive } from '../lib/archiveStore';
import { defaultReaderSettings, READER_SETTINGS_KEY } from '../lib/reader-settings';
import type { File } from '../lib/types';

async function seed() {
  const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 150;
  const context = canvas.getContext('2d')!;
  context.fillStyle = 'white'; context.fillRect(0, 0, 100, 150);
  context.fillStyle = '#808080'; context.fillRect(10, 10, 80, 130);
  const zip = new JSZip();
  for (let page = 1; page <= 8; page++) zip.file(`page${page}.png`, canvas.toDataURL().split(',')[1], { base64: true });
  const data = await zip.generateAsync({ type: 'blob' });
  const catalog: File[] = [];
  for (const id of ['saved-idb', 'saved-opfs', 'not-downloaded']) {
    catalog.push({ id, name: `${id}.cbz`, type: 'file', extension: 'cbz', link: `/${id}.cbz`, size: data.size, readStatus: 'unread', lastPage: 1, totalPages: 8 });
    if (id === 'not-downloaded') continue;
    const opfs = id === 'saved-opfs' && await supportsOPFS();
    if (opfs) await writeArchive(`${id}.zip`, data.stream());
    else await db.comicDownloads.put({ id, url: `/${id}.cbz`, status: 'completed', progress: 100, data });
    await db.downloads.put({ id, name: `${id}.cbz`, url: `/${id}.cbz`, status: 'completed', progress: 100,
      backend: opfs ? 'opfs' : 'idb', archiveFile: opfs ? `${id}.zip` : undefined, fileSize: data.size });
    await db.markComicStatus(id, 'in_progress', id === 'saved-idb' ? 5 : 2, 8);
  }
  await db.storeComicsData(catalog);
  localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify({ ...defaultReaderSettings(true), layout: 'single', autoSpread: false, transition: 'none', crop: true }));
}
Object.assign(window, { offlineTest: { db, seed } });
declare global { interface Window { offlineTest: { db: typeof db; seed: typeof seed } } }
