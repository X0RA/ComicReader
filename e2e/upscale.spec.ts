import { test, expect } from '@playwright/test';
import type { ReaderPage } from '../lib/reader-pages';
import type { RenderResult } from '../lib/upscale/client';
import type { UpscaleState } from '../lib/upscale/queue';

test.beforeEach(async ({ page }) => { await page.goto('/upscale'); await page.waitForFunction(() => !!window.upscaleTest); });

test('queue is manual, prioritizes the current spread, pauses and cancels obsolete results', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { UpscaleQueue, UPSCALE_MODELS } = window.upscaleTest;
    const pages = Array.from({ length: 30 }, (_, i) => ({ url: String(i + 1), width: 100, height: 150 }) as ReaderPage);
    const calls: { page: number; resolve: (value: RenderResult) => void }[] = [];
    let loads = 0, disposed = 0, released = 0, state!: UpscaleState;
    const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
    const queue = new UpscaleQueue(UPSCALE_MODELS.find(m => m.id === 'anime4k-a')!, 2, 768 * 1024 ** 2, {
      check: async () => {}, load: async () => { loads++; return { data: new ArrayBuffer(0) }; },
      worker: () => ({ render: url => new Promise(resolve => calls.push({ page: +url, resolve })), dispose: () => { disposed++; } }),
      decode: async result => ({ url: `enhanced:${result.duration}`, bytes: 1000, release: () => { released++; } }), publish: value => { state = value; },
    });
    queue.update(pages, [10, 11]);
    const before = { loads, calls: calls.length };
    await queue.start(); const first = calls.map(c => c.page);
    queue.pause(); calls[0].resolve({ blob: new Blob(), width: 200, height: 300, duration: 10 }); await tick();
    const paused = { status: state.status, calls: calls.length, ready: [...state.images.keys()] };
    queue.update(pages, [23, 24]); queue.resume(); const afterJump = calls.map(c => c.page);
    queue.stop(); const stopped = calls.length;
    calls[1].resolve({ blob: new Blob(), width: 200, height: 300, duration: 11 }); await tick();
    queue.update(pages, [28]); await tick();
    const afterStop = { calls: calls.length, ready: state.images.size };
    queue.dispose();
    return { before, first, paused, afterJump, stopped, afterStop, disposed, released };
  });
  expect(result.before).toEqual({ loads: 0, calls: 0 });
  expect(result.first).toEqual([10, 11]);
  expect(result.paused).toEqual({ status: 'paused', calls: 2, ready: [10] });
  expect(result.afterJump).toEqual([10, 11, 23]);
  expect(result.afterStop).toEqual({ calls: result.stopped, ready: 0 });
  expect(result.disposed).toBe(2); expect(result.released).toBe(1);
});

test('nearby buffer fills then waits; moving forward frees old pages and continues', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { UpscaleQueue, UPSCALE_MODELS } = window.upscaleTest;
    const pages = Array.from({ length: 40 }, (_, i) => ({ url: String(i + 1), width: 100, height: 150 }) as ReaderPage);
    let state!: UpscaleState; const rendered: number[] = [], released: number[] = [];
    const tick = async () => { for (let i = 0; i < 120; i++) await Promise.resolve(); };
    const queue = new UpscaleQueue(UPSCALE_MODELS.find(m => m.id === 'anime4k-a')!, 3, 768 * 1024 ** 2, {
      check: async () => {}, load: async () => ({ data: new ArrayBuffer(0) }),
      worker: () => ({ render: async url => { rendered.push(+url); return { blob: new Blob(), width: 200, height: 300, duration: +url }; }, dispose: () => {} }),
      decode: async r => ({ url: `ready:${r.duration}`, bytes: 240000, release: () => { released.push(r.duration); } }), publish: value => { state = value; },
    });
    queue.update(pages, [12, 13]); await queue.start(); await tick();
    const buffered = { rendered: [...rendered], status: state.status };
    queue.update(pages, [16, 17]); await tick();
    const moved = { ready: [...state.images.keys()].sort((a,b)=>a-b), released: [...released], rendered: [...rendered] };
    queue.update(pages, [12]); await tick(); const backwards = rendered.length;
    queue.dispose(); return { buffered, moved, backwards };
  });
  expect(result.buffered).toEqual({ rendered: Array.from({ length: 10 }, (_, i) => i + 12), status: 'waiting' });
  expect(result.moved.ready).toEqual(Array.from({ length: 12 }, (_, i) => i + 14));
  expect(result.moved.released.sort()).toEqual([12, 13]);
  expect(result.backwards).toBe(result.moved.rendered.length);
});

test('memory budget reduces parallel jobs and rejects oversized pages without starting workers', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { UpscaleQueue, UPSCALE_MODELS } = window.upscaleTest;
    let workers = 0, state!: UpscaleState;
    const queue = new UpscaleQueue(UPSCALE_MODELS.find(m => m.id === 'anime-v3')!, 3, 400 * 1024 ** 2, {
      check: async () => {}, load: async () => ({ data: new ArrayBuffer(0) }),
      worker: () => { workers++; return { render: () => new Promise(() => {}), dispose: () => {} }; },
      decode: async () => { throw Error('unused'); }, publish: value => { state = value; },
    });
    queue.update(Array.from({ length: 10 }, (_, i) => ({ url: String(i), width: 1000, height: 1500 }) as ReaderPage), [1]);
    await queue.start(); const limited = { workers, active: state.active.length }; queue.dispose();
    const huge = new UpscaleQueue(UPSCALE_MODELS.find(m => m.id === 'anime-v3')!, 3, 400 * 1024 ** 2, {
      check: async () => {}, load: async () => ({ data: new ArrayBuffer(0) }),
      worker: () => { workers++; throw Error('must not run'); }, decode: async () => { throw Error('unused'); }, publish: value => { state = value; },
    });
    huge.update([{ url: 'huge', width: 5000, height: 8000 } as ReaderPage], [1]); await huge.start();
    const message = state.message; huge.dispose(); return { limited, workers, message };
  });
  expect(result.limited).toEqual({ workers: 1, active: 1 }); expect(result.workers).toBe(1); expect(result.message).toContain('too large');
});

test('verified model cache survives reload, works offline, and replaces corrupt entries', async ({ page }) => {
  let requests = 0;
  await page.route('**/upscale-models/anime4k-v4-mode-a-x2.onnx', async route => { requests++; await route.continue(); });
  const first = await page.evaluate(async () => {
    const t = window.upscaleTest, m = t.UPSCALE_MODELS.find(m => m.id === 'anime4k-a')!;
    await t.clearUpscaleModels(); const loaded = await t.loadUpscaleModel(m, new AbortController().signal, () => {});
    return { valid: await t.verifyModel(loaded.data, m), bytes: await t.upscaleModelCacheSize() };
  });
  expect(first).toEqual({ valid: true, bytes: 84451 }); expect(requests).toBe(1);
  await page.reload(); await page.waitForFunction(() => !!window.upscaleTest);
  await page.route('**/upscale-models/**', route => route.abort());
  const cached = await page.evaluate(async () => { const t = window.upscaleTest, m = t.UPSCALE_MODELS.find(m => m.id === 'anime4k-a')!; return (await t.loadUpscaleModel(m, new AbortController().signal, () => {})).data.byteLength; });
  expect(cached).toBe(84451);
  await page.unroute('**/upscale-models/**');
  await page.evaluate(async () => { const t = window.upscaleTest, m = t.UPSCALE_MODELS.find(m => m.id === 'anime4k-a')!; const cache = await caches.open(t.MODEL_CACHE); await cache.put(`/__upscale-models/${m.sha256}`, new Response(new Uint8Array(m.bytes))); });
  await page.evaluate(async () => { const t = window.upscaleTest; await t.loadUpscaleModel(t.UPSCALE_MODELS.find(m => m.id === 'anime4k-a')!, new AbortController().signal, () => {}); });
  expect(requests).toBe(2);
  await page.evaluate(async () => { const t = window.upscaleTest; await t.clearUpscaleModels(); });
  expect(await page.evaluate(() => window.upscaleTest.upscaleModelCacheSize())).toBe(0);
});

test('corrupt downloads never enter the model cache; abort releases the download lock', async ({ page }) => {
  await page.route('**/upscale-models/**', route => route.fulfill({ body: 'bad weights' }));
  const result = await page.evaluate(async () => {
    const t = window.upscaleTest, m = t.UPSCALE_MODELS.find(m => m.id === 'anime4k-a')!;
    await t.clearUpscaleModels(); let message = '';
    try { await t.loadUpscaleModel(m, new AbortController().signal, () => {}); } catch (error) { message = String(error); }
    const c = new AbortController(); c.abort(); let abort = '';
    try { await t.loadUpscaleModel(m, c.signal, () => {}); } catch (error) { abort = (error as Error).name; }
    return { message, abort, bytes: await t.upscaleModelCacheSize() };
  });
  expect(result.message).toContain('verification'); expect(result.abort).toBe('AbortError'); expect(result.bytes).toBe(0);
});

test('tile cores cover odd image sizes exactly and padding stays inside the source', async ({ page }) => {
  const result = await page.evaluate(() => {
    const t = window.upscaleTest, width = 519, height = 273;
    const coverage = new Uint8Array(width * height);
    const tiles = t.upscaleTiles(width, height, 256, 16, 4);
    for (const tile of tiles) for (let y=tile.y; y<tile.y+tile.height; y++) for (let x=tile.x; x<tile.x+tile.width; x++) coverage[y*width+x]++;
    return { covered: coverage.every(v=>v===1), multiples: tiles.every(tile=>tile.inputWidth%4===0 && tile.inputHeight%4===0), padding: Array.from({length:30},(_,i)=>t.reflectPixel(i-15,3)), onePixel: t.reflectPixel(200,1) };
  });
  expect(result.covered).toBe(true); expect(result.multiples).toBe(true); expect(result.padding.every(v=>v>=0&&v<3)).toBe(true); expect(result.onePixel).toBe(0);
});

test('unsupported GPUs do not download, and stopping during a download never starts workers', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const t=window.upscaleTest, model=t.UPSCALE_MODELS[0];
    let loads=0, workers=0, state!: UpscaleState;
    const deps={ check: async()=>{throw Error('GPU unavailable');}, load:async()=>{loads++;return{data:new ArrayBuffer(0)};}, worker:()=>{workers++;throw Error('unexpected worker');}, decode:async()=>{throw Error('unused');}, publish:(value:UpscaleState)=>{state=value;} };
    const unsupported=new t.UpscaleQueue(model,1,768*1024**2,deps);
    unsupported.update([{url:'page',width:100,height:150} as ReaderPage],[1]);await unsupported.start();
    const error=state.status;unsupported.dispose();
    let resolve!: (value:{data:ArrayBuffer})=>void, signal!: AbortSignal;
    const queue=new t.UpscaleQueue(model,1,768*1024**2,{...deps,check:async()=>{},load:(s)=>{loads++;signal=s;return new Promise(r=>{resolve=r;});}});
    queue.update([{url:'page',width:100,height:150} as ReaderPage],[1]);const start=queue.start();
    for(let i=0;i<4;i++)await Promise.resolve();queue.stop();resolve({data:new ArrayBuffer(0)});await start;
    const stopped=state.status;queue.dispose();return{error,loads,workers,aborted:signal.aborted,stopped};
  });
  expect(result).toEqual({error:'error',loads:1,workers:0,aborted:true,stopped:'idle'});
});

test('leaving while an enhanced image decodes releases its URL instead of publishing it', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const t=window.upscaleTest;let decode!:()=>void, released=0, state!:UpscaleState;
    const queue=new t.UpscaleQueue(t.UPSCALE_MODELS[0],1,768*1024**2,{
      check:async()=>{},load:async()=>({data:new ArrayBuffer(0)}),worker:()=>({render:async()=>({blob:new Blob(),width:200,height:300,duration:1}),dispose:()=>{}}),
      decode:()=>new Promise(resolve=>{decode=()=>resolve({url:'enhanced',bytes:1000,release:()=>{released++;}});}),publish:value=>{state=value;},
    });
    queue.update([{url:'page',width:100,height:150} as ReaderPage],[1]);await queue.start();
    for(let i=0;i<4;i++)await Promise.resolve();queue.dispose();decode();for(let i=0;i<4;i++)await Promise.resolve();
    return{released,images:state.images.size,status:state.status};
  });
  expect(result).toEqual({released:1,images:0,status:'idle'});
});
