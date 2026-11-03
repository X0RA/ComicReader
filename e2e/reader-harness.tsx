import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import ComicView from '../app/read/[id]/_comicView';
import { prepareReaderPage } from '../lib/reader-image';
import { defaultReaderSettings, type ReaderSettings } from '../lib/reader-settings';
import type { ReaderPage } from '../lib/reader-pages';

const host = document.createElement('div');
document.body.append(host);
const root = createRoot(host);
const noop = () => {};
const readerTest = {
  prepareReaderPage,
  render(pages: ReaderPage[], visiblePages: number[], crop: boolean, layout: ReaderSettings['layout'] = 'single', options: Partial<ReaderSettings> = {}) {
    const settings = { ...defaultReaderSettings(false), crop, cropTightness: 0, layout, fit: 'original' as const, ...options };
    // Inspect the initial committed geometry before any image load event can fire.
    flushSync(() => root.render(<ComicView pages={pages} settings={settings} layout={layout}
      visiblePages={visiblePages} currentPage={visiblePages[0]} width={1000} height={800}
      phone={false} panelOpen={false} turnDirection={1} onPage={noop} onScrollDirection={noop}
      onTap={noop} onTurn={noop} onEnd={noop} autoRunning={false} />));
    return [...host.querySelectorAll<HTMLImageElement>('img')].map(image => ({
      left: parseFloat(image.style.left), top: parseFloat(image.style.top),
      width: parseFloat(image.parentElement!.style.width), height: parseFloat(image.parentElement!.style.height),
    }));
  },
};
Object.assign(window, { readerTest });
declare global { interface Window { readerTest: typeof readerTest } }
