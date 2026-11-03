/// <reference lib="webworker" />
import * as ort from "onnxruntime-web/webgpu";
import type { UpscaleModel } from "./models";
import { reflectPixel, upscaleTiles } from "./tiles";

const scope = self as unknown as DedicatedWorkerGlobalScope;
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = new URL("./", scope.location.href).href;
ort.env.webgpu.powerPreference = "high-performance";
let session: ort.InferenceSession | undefined;
let model: UpscaleModel | undefined;
let busy = false;

scope.onmessage = async ({ data }: MessageEvent<{ type: "init"; model: UpscaleModel; weights: ArrayBuffer } | { type: "render"; url: string }>) => {
  if (busy) return;
  busy = true;
  try {
    if (data.type === "init") {
      const adapter = await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter || adapter.info.isFallbackAdapter) throw new Error("GPU upscaling is unavailable in this browser. Enable hardware acceleration or use a browser with WebGPU support.");
      model = data.model;
      session = await ort.InferenceSession.create(data.weights, { executionProviders: ["webgpu"], graphOptimizationLevel: "all", enableMemPattern: false });
      scope.postMessage({ type: "ready" });
    } else {
      if (!session || !model) throw new Error("The upscaler is not ready.");
      const started = performance.now();
      const bitmap = await createImageBitmap(await (await fetch(data.url)).blob());
      const { width, height } = bitmap, scale = model.scale;
      // Limit CPU output allocations as well as GPU tiles; originals remain readable.
      if (width * height * scale * scale > 64_000_000) { bitmap.close(); throw new Error("This page is too large for GPU upscaling at the selected scale. Try a 2× model."); }
      const source = new OffscreenCanvas(width, height), context = source.getContext("2d")!;
      context.drawImage(bitmap, 0, 0); bitmap.close();
      const pixels = context.getImageData(0, 0, width, height).data;
      source.width = source.height = 1;
      const output = new OffscreenCanvas(width * scale, height * scale), target = output.getContext("2d")!;
      const tiles = upscaleTiles(width, height, 256, 16, model.multiple);
      for (let index = 0; index < tiles.length; index++) {
        const tile = tiles[index], area = tile.inputWidth * tile.inputHeight;
        const input = new Float32Array(area * 3);
        for (let y = 0; y < tile.inputHeight; y++) for (let x = 0; x < tile.inputWidth; x++) {
          const sourceIndex = (reflectPixel(tile.top + y, height) * width + reflectPixel(tile.left + x, width)) * 4;
          const dest = y * tile.inputWidth + x, alpha = pixels[sourceIndex + 3] / 255;
          for (let c = 0; c < 3; c++) input[c * area + dest] = (pixels[sourceIndex + c] * alpha + 255 * (1 - alpha)) / 255;
        }
        const tensor = new ort.Tensor("float32", input, [1, 3, tile.inputHeight, tile.inputWidth]);
        let outputs: ort.InferenceSession.OnnxValueMapType | undefined;
        try {
          outputs = await session.run({ [session.inputNames[0]]: tensor });
          const result = outputs[session.outputNames[0]], values = result.data as Float32Array;
          const outWidth = tile.inputWidth * scale, outHeight = tile.inputHeight * scale, plane = outWidth * outHeight;
          if (result.dims[2] !== outHeight || result.dims[3] !== outWidth) throw new Error("The model returned an unexpected image size.");
          const image = new ImageData(tile.width * scale, tile.height * scale);
          for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
            const src = ((tile.y - tile.top) * scale + y) * outWidth + (tile.x - tile.left) * scale + x;
            const dest = (y * image.width + x) * 4;
            for (let c = 0; c < 3; c++) image.data[dest + c] = Math.round(Math.max(0, Math.min(1, values[c * plane + src])) * 255);
            image.data[dest + 3] = 255;
          }
          target.putImageData(image, tile.x * scale, tile.y * scale);
        } finally { tensor.dispose(); if (outputs) for (const tensor of Object.values(outputs)) tensor.dispose(); }
        scope.postMessage({ type: "progress", progress: (index + 1) / tiles.length });
      }
      const blob = await output.convertToBlob({ type: "image/png" });
      output.width = output.height = 1;
      scope.postMessage({ type: "result", blob, width: width * scale, height: height * scale, duration: performance.now() - started });
    }
  } catch (error) {
    scope.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  } finally { busy = false; }
};
