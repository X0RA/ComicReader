import type { UpscaleModel } from "./models";
export interface RenderResult { blob: Blob; width: number; height: number; duration: number }
export interface RenderWorker {
  render(url: string, progress: (fraction: number) => void): Promise<RenderResult>;
  dispose(): void;
}
export async function checkUpscaleSupport() {
  const adapter = await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter || adapter.info?.isFallbackAdapter || (adapter as { isFallbackAdapter?: boolean }).isFallbackAdapter) throw new Error("GPU upscaling is unavailable. Use a browser with WebGPU and hardware acceleration enabled.");
}
export class BrowserUpscaleWorker implements RenderWorker {
  private worker: Worker;
  private ready: Promise<void>;
  private reject?: (error: Error) => void;
  private failure?: Error;
  private fail(error: Error) {
    this.failure = error;
    this.worker.terminate();
    this.reject?.(error);
    this.reject = undefined;
  }
  constructor(model: UpscaleModel, weights: ArrayBuffer) {
    this.worker = new Worker(`${document.documentElement.dataset.upscaleRuntime || "/upscale-runtime"}/worker.js`, { type: "module" });
    this.ready = new Promise((resolve, reject) => {
      this.reject = reject;
      this.worker.onmessage = ({ data }) => {
        if (data.type === "ready") { this.reject = undefined; resolve(); }
        if (data.type === "error") this.fail(new Error(data.message));
      };
      this.worker.onerror = event => this.fail(new Error(event.message || "The GPU worker stopped unexpectedly."));
      this.worker.onmessageerror = () => this.fail(new Error("The GPU worker sent an unreadable response."));
      this.worker.postMessage({ type: "init", model, weights });
    });
    void this.ready.catch(() => {});
  }
  async render(url: string, progress: (fraction: number) => void): Promise<RenderResult> {
    await this.ready;
    if (this.failure) throw this.failure;
    if (this.reject) throw new Error("The GPU worker is already rendering.");
    return new Promise((resolve, reject) => {
      this.reject = reject;
      this.worker.onmessage = ({ data }) => {
        if (data.type === "progress") progress(data.progress);
        if (data.type === "result") { this.reject = undefined; resolve(data); }
        if (data.type === "error") { this.reject = undefined; reject(new Error(data.message)); }
      };
      this.worker.postMessage({ type: "render", url });
    });
  }
  dispose() { this.fail(new DOMException("Stopped", "AbortError")); }
}
