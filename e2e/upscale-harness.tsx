import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useState, useLayoutEffect } from 'react';
import { UpscaleQueue } from '../lib/upscale/queue';
import { BrowserUpscaleWorker, checkUpscaleSupport } from '../lib/upscale/client';
import { UPSCALE_MODELS } from '../lib/upscale/models';
import { loadUpscaleModel, clearUpscaleModels, upscaleModelCacheSize, verifyModel, MODEL_CACHE } from '../lib/upscale/model-cache';
import { upscaleTiles, reflectPixel } from '../lib/upscale/tiles';
import { defaultReaderSettings, type ReaderSettings } from '../lib/reader-settings';
import type { ReaderPage } from '../lib/reader-pages';
import { useUpscaling, type Upscaling } from '../app/read/[id]/_useUpscaling';
import UpscaleControls from '../app/read/[id]/_upscaleControls';
import UpscaleOptions from '../app/read/[id]/_upscaleOptions';
import ComicView from '../app/read/[id]/_comicView';
const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
let state: Upscaling | undefined;
function Probe({ pages }: { pages: ReaderPage[] }) {
  const [settings, setSettings] = useState<ReaderSettings>({ ...defaultReaderSettings(false), layout: 'single' });
  const [page, setPage] = useState(1);
  const u = useUpscaling(pages, [page], settings, false);
  useLayoutEffect(() => { state = u; }, [u]);
  return <><UpscaleControls upscaling={u} /><UpscaleOptions settings={settings} change={patch => setSettings(s => ({ ...s, ...patch }))} busy={u.state.status === 'running'} />
    <button onClick={() => setPage(p => Math.min(pages.length, p + 1))}>Next</button>
    <ComicView pages={pages} enhanced={u.state.images} settings={settings} layout="single" visiblePages={[page]} currentPage={page} width={1000} height={800} phone={false} panelOpen={false} turnDirection={1} onPage={setPage} onScrollDirection={() => {}} onTap={() => {}} onTurn={() => {}} onEnd={() => {}} autoRunning={false} /></>;
}
const upscaleTest = { UpscaleQueue, BrowserUpscaleWorker, checkUpscaleSupport, UPSCALE_MODELS, loadUpscaleModel, clearUpscaleModels, upscaleModelCacheSize, verifyModel, MODEL_CACHE, upscaleTiles, reflectPixel,
  get state() { return state; },
  mount(pages: ReaderPage[]) { flushSync(() => root.render(<Probe pages={pages} />)); },
  unmount() { flushSync(() => root.render(null)); },
};
declare global { interface Window { upscaleTest: typeof upscaleTest } }
window.upscaleTest = upscaleTest;
