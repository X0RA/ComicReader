import { test, expect } from '@playwright/test';
import { UPSCALE_MODELS } from '../lib/upscale/models';

test.use({ launchOptions: { args: ['--enable-unsafe-webgpu', '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface'] } });
test.skip(!process.env.COMIC_GPU_TEST, 'Opt in with COMIC_GPU_TEST=1 on a WebGPU machine.');
test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'GPU integration suite uses Chromium.');
  await page.goto('/upscale'); await page.waitForFunction(() => !!window.upscaleTest);
});

for (const model of UPSCALE_MODELS) test(`real GPU output: ${model.label}`, async ({ page }) => {
  test.setTimeout(120_000);
  const result = await page.evaluate(async id => {
    const t = window.upscaleTest, model = t.UPSCALE_MODELS.find(m => m.id === id)!;
    await t.checkUpscaleSupport();
    const canvas = document.createElement('canvas'); canvas.width = 301; canvas.height = 269;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 301, 269); ctx.fillStyle = 'black'; ctx.font = '20px serif'; ctx.fillText('Manga 123', 25, 70); ctx.strokeRect(10, 10, 280, 245); ctx.fillRect(100, 210, 100, 30);
    for (let x=0; x<100; x++) ctx.fillRect(x*3, 130, 1, x%30+50);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!)));
    const url = URL.createObjectURL(blob);
    const weights = await t.loadUpscaleModel(model, new AbortController().signal, () => {});
    const worker = new t.BrowserUpscaleWorker(model, weights.data);
    const progress: number[] = [];
    try {
      const output = await worker.render(url, value => progress.push(value));
      const bitmap = await createImageBitmap(output.blob);
      canvas.width = bitmap.width; canvas.height = bitmap.height; ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let dark=0, light=0;
      for (let i=0; i<pixels.length; i+=4) { if (pixels[i]<30) dark++; if (pixels[i]>230) light++; }
      return { width: output.width, height: output.height, progress, dark, light, duration: output.duration };
    } finally { worker.dispose(); URL.revokeObjectURL(url); }
  }, model.id);
  expect(result.width).toBe(301*model.scale); expect(result.height).toBe(269*model.scale);
  expect(result.progress).toHaveLength(4); expect(result.progress.at(-1)).toBe(1);
  expect(result.dark).toBeGreaterThan(100); expect(result.light).toBeGreaterThan(100); expect(result.duration).toBeGreaterThan(0);
});

test('reader starts manually, runs parallel jobs, preserves geometry, and invalidates changed settings', async ({ page }) => {
  test.setTimeout(120_000);
  let modelRequests = 0, workers = 0;
  page.on('request', request => { if (request.url().endsWith('.onnx')) modelRequests++; });
  page.on('worker', () => workers++);
  await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width=301; canvas.height=269;
    const c=canvas.getContext('2d')!; c.fillStyle='white'; c.fillRect(0,0,301,269); c.fillStyle='black'; c.fillRect(15,15,271,239);
    const crop={left:.02,right:.03,top:.04,bottom:.01};
    window.upscaleTest.mount(Array.from({length:12},(_,i)=>({name:String(i),url:canvas.toDataURL(),width:301,height:269,crop,tightCrop:crop})));
  });
  await page.getByLabel('Upscaling model', { exact: true }).selectOption('anime4k');
  await page.getByLabel('Parallel jobs', { exact: true }).fill('2');
  expect(modelRequests).toBe(0); expect(workers).toBe(0);
  const before = await page.getByAltText('Page 1', { exact: true }).evaluate(img => ({ style: img.getAttribute('style'), parent: img.parentElement!.getAttribute('style') }));
  await page.getByRole('button', { name: 'Render from here', exact: true }).click();
  await expect(page.locator('img[data-upscaled="true"]')).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => workers).toBe(2);
  expect(modelRequests).toBe(1);
  const after = await page.getByAltText('Page 1', { exact: true }).evaluate(img => ({ style: img.getAttribute('style'), parent: img.parentElement!.getAttribute('style') }));
  expect(after).toEqual(before);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.upscaleTest.state?.state.status)).toBe('paused');
  await expect.poll(() => page.evaluate(() => window.upscaleTest.state?.state.active.length), { timeout: 30_000 }).toBe(0);
  await page.getByLabel('Anime4K mode', { exact: true }).selectOption('B');
  await expect(page.locator('img[data-upscaled="true"]')).toHaveCount(0);
  expect(workers).toBe(2); expect(modelRequests).toBe(1);
  await page.evaluate(() => window.upscaleTest.unmount());
});
