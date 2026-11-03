# Browser upscaling models

These are the exact ONNX artifacts used in the November 2026 comparison on
[chunks.md](https://chunks.md/), served locally so reading does not depend on its
signed download service. SHA-256 digests, sizes, scales and input alignment are
pinned in `lib/upscale/models.ts`. The files are unmodified from those downloads;
no chunks.md application code is included. The reader's tile pipeline is our own.

| Files | Upstream author / project | License |
| --- | --- | --- |
| anime4k-v4-mode-{a,b,c}-x2.onnx | [bloc97 / Anime4K](https://github.com/bloc97/Anime4K) | MIT |
| realesr-animevideov3.onnx | [Xintao Wang / Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) | BSD-3-Clause |
| up{2,3,4}x-*.onnx | [Bilibili / Real-CUGAN](https://github.com/bilibili/ailab/tree/main/Real-CUGAN) | MIT |
| 2x-AnimeSharp.onnx | [Kim2091 / AnimeSharp V3](https://huggingface.co/Kim2091/AnimeSharpV3) | CC BY-NC-SA 4.0 |

See the accompanying license texts. AnimeSharp's non-commercial / share-alike
terms apply to its weights; including this optional model does not relicense the
application source. Its ONNX export filename omits V3, matching the comparison.

Model files total approximately 96 MB (92 MiB). They download only after the reader clicks
**Render from here**. Cache Storage retains verified weights across visits;
rendered page images never enter persistent storage. Browsers can evict caches.
**Clear models** in reader settings or **Hard reset** in Downloaded removes them.

The runtime is ONNX Runtime Web 1.27.0 (MIT), built from the pinned npm dependency.
`npm run dev` and `npm run build` generate `/upscale-runtime/` locally, including
its WASM modules and license. Deploy both public directories as static assets.

The queue keeps up to the configured 0–32 pages ahead (default 8) and two behind, within a conservative
memory estimate (384 MiB on phones; 768 MiB on desktop). It uses 256-pixel cores
with 16-pixel overlap and reflected edge padding. Output is lossless PNG at native
model scale; crop and logical layout continue to use original page dimensions.
GPU/driver allocations cannot be measured exactly, so 1 job is the default.
No CPU fallback or automatic render on opening a comic is enabled.

## Verification

Run `npm run build:upscale` before browser tests.
`npx playwright test e2e/upscale.spec.ts --project=chromium --project=firefox`
checks scheduling, memory admission, cancellation and persistent-cache integrity.
`COMIC_GPU_TEST=1 npx playwright test e2e/upscale-gpu.spec.ts --project=chromium --workers=1`
runs all ten actual models and the reader integration on a WebGPU machine. The
GPU suite opts into Chromium Vulkan flags for Linux; unsupported hardware should
use the standard suite. Production does not modify browser flags.
