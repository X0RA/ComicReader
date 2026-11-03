import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useLayoutEffect } from 'react';
import JSZip from 'jszip';
import ComicView from '../app/read/[id]/_comicView';
import { useComic } from '../app/read/[id]/_useComic';
import PreparationProgress from '../app/read/[id]/_preparationProgress';
import { db } from '../lib/dexieDB';
import { prepareReaderPage } from '../lib/reader-image';
import { defaultReaderSettings, type ReaderSettings } from '../lib/reader-settings';
import type { ReaderPage } from '../lib/reader-pages';

const host = document.createElement('div');
document.body.append(host);
const root = createRoot(host);
const noop = () => {};
let comic: ReturnType<typeof useComic> | undefined;
let firstReady: ReturnType<typeof useComic> | undefined;
function ComicProbe({ id, requestedPage }: { id: string; requestedPage?: number }) {
  const state = useComic(id, 0, requestedPage);
  useLayoutEffect(() => {
    comic = state;
    if (!state.loading && state.pages.length && !firstReady) firstReady = state;
  }, [state]);
  return state.loading ? <p>Opening comic</p> : <PreparationProgress prepared={state.prepared} total={state.pages.length} />;
}
const readerTest = {
  prepareReaderPage,
  get comic() { return comic; },
  get firstReady() { return firstReady; },
  mountComic(id: string, requestedPage?: number) { comic = firstReady = undefined; flushSync(() => root.render(<ComicProbe id={id} requestedPage={requestedPage} />)); },
  unmount() { flushSync(() => root.render(null)); },
  async seedComic(id: string, total: number, savedPage = 1, broken: number[] = []) {
    const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 150;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'white'; context.fillRect(0, 0, 100, 150);
    context.fillStyle = '#808080'; context.fillRect(10, 10, 80, 130);
    const png = canvas.toDataURL().split(',')[1];
    const zip = new JSZip();
    for (let page = 1; page <= total; page++) {
      if (broken.includes(page)) zip.file(`page${page}.png`, 'invalid image');
      else zip.file(`page${page}.png`, png, { base64: true });
    }
    const data = await zip.generateAsync({ type: 'blob' });
    const url = `/${id}.cbz`;
    await db.storeComicsData([{ id, name: `${id}.cbz`, type: 'file', extension: 'cbz', link: url, size: data.size, readStatus: 'unread', lastPage: savedPage, totalPages: total }]);
    await db.comicDownloads.put({ id, url, status: 'completed', progress: 100, data });
    await db.downloads.put({ id, url, status: 'completed', progress: 100, backend: 'idb', fileSize: data.size });
    await db.markComicStatus(id, 'in_progress', savedPage, total);
  },
  render(pages: ReaderPage[], visiblePages: number[], crop: boolean, layout: ReaderSettings['layout'] = 'single', options: Partial<ReaderSettings> = {}, interaction: { phone?: boolean; panelOpen?: boolean } = {}) {
    const settings = { ...defaultReaderSettings(false), crop, cropTightness: 0, layout, fit: 'original' as const, ...options };
    // Inspect the initial committed geometry before any image load event can fire.
    flushSync(() => root.render(<ComicView pages={pages} settings={settings} layout={layout}
      visiblePages={visiblePages} currentPage={visiblePages[0]} width={1000} height={800}
      phone={interaction.phone ?? false} panelOpen={interaction.panelOpen ?? false} turnDirection={1} onPage={noop} onScrollDirection={noop}
      onTap={noop} onTurn={noop} onEnd={noop} autoRunning={false} />));
    return [...host.querySelectorAll<HTMLImageElement>('img')].map(image => ({
      left: parseFloat(image.style.left), top: parseFloat(image.style.top),
      width: parseFloat(image.parentElement!.style.width), height: parseFloat(image.parentElement!.style.height),
    }));
  },
};
Object.assign(window, { readerTest });
declare global { interface Window { readerTest: typeof readerTest } }
