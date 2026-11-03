import type { UpscaleModel } from "./models";
export interface RenderResult { blob: Blob; width: number; height: number; duration: number }
export interface RenderWorker {
  render(url: string, progress: (fraction: number) => void): Promise<RenderResult>;
  dispose(): void;
}
export async function checkUpscaleSupport() {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(options: { powerPreference: string }): Promise<{ info: { isFallbackAdapter: boolean } } | null> } }).gpu;
  const adapter = await gpu?.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter || adapter.info.isFallbackAdapter) throw new Error("GPU upscaling is unavailable. Use a browser with WebGPU and hardware acceleration enabled.");
}
export class BrowserUpscaleWorker implements RenderWorker {
  private worker: Worker;
  private ready: Promise<void>;
  private reject?: (error: Error) => void;
  private disposed = false;
  constructor(model: UpscaleModel, weights: ArrayBuffer) {
    this.worker = new Worker("/upscale-runtime/worker.js", { type: "module" });
    this.ready = new Promise((resolve, reject) => {
      this.reject = reject;
      this.worker.onmessage = ({ data }) => {
        if (data.type === "ready") { this.reject = undefined; resolve(); }
        if (data.type === "error") reject(new Error(data.message));
      };
      this.worker.onerror = event => reject(new Error(event.message || "The GPU worker could not start."));
      this.worker.postMessage({ type: "init", model, weights });
    });
  }
  async render(url: string, progress: (fraction: number) => void): Promise<RenderResult> {
    await this.ready;
    if (this.disposed) throw new DOMException("Stopped", "AbortError");
    return new Promise((resolve, reject) => {
      this.reject = reject;
      this.worker.onmessage = ({ data }) => {
        if (data.type === "progress") progress(data.progress);
        if (data.type === "result") { this.reject = undefined; resolve(data); }
        if (data.type === "error") { this.reject = undefined; reject(new Error(data.message)); }
      };
      this.worker.onerror = event => reject(new Error(event.message || "The GPU worker stopped unexpectedly."));
      this.worker.postMessage({ type: "render", url });
    });
  }
  dispose() { this.disposed = true; this.worker.terminate(); this.reject?.(new DOMException("Stopped", "AbortError")); this.reject = undefined; }
}
