import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
const out = 'public/upscale-runtime';
await mkdir(out, { recursive: true });
await build({ entryPoints: ['lib/upscale/worker.ts'], outfile: `${out}/worker.js`, bundle: true, format: 'esm', platform: 'browser', minify: true });
for (const name of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) {
  await copyFile(`node_modules/onnxruntime-web/dist/${name}`, `${out}/${name}`);
}
await copyFile('scripts/ONNX-Runtime-LICENSE.txt', `${out}/LICENSE.txt`);
// Catch missing/corrupt deployment assets before producing a build.
const manifest = await build({ entryPoints: ['lib/upscale/models.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { UPSCALE_MODELS } = await import('data:text/javascript;base64,' + Buffer.from(manifest.outputFiles[0].contents).toString('base64'));
const { readFile } = await import('node:fs/promises');
const { createHash } = await import('node:crypto');
for (const model of UPSCALE_MODELS) {
  const bytes = await readFile(`public${model.url}`);
  if (bytes.length !== model.bytes || createHash('sha256').update(bytes).digest('hex') !== model.sha256) {
    throw new Error(`Invalid upscaling model: ${model.url}`);
  }
}
