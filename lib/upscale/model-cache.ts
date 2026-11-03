import type { UpscaleModel } from "./models";

export const MODEL_CACHE_CHANGED = "comic-reader-model-cache-changed";
export const MODEL_CACHE = "comic-reader-upscale-models-v1";
const CACHE_LOCK = "comic-reader-upscale-model-cache";
async function lock<T>(name: string, mode: LockMode, signal: AbortSignal | undefined, run: () => Promise<T>): Promise<T> {
  return navigator.locks ? navigator.locks.request(name, { mode, ...(signal ? { signal } : {}) }, run) : run();
}
export async function verifyModel(data: ArrayBuffer, model: UpscaleModel): Promise<boolean> {
  if (data.byteLength !== model.bytes) return false;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("") === model.sha256;
}
/** Only verified weights enter persistent storage. Rendered pages never use this cache. */
export async function loadUpscaleModel(model: UpscaleModel, signal: AbortSignal, progress: (fraction: number) => void): Promise<{ data: ArrayBuffer; warning?: string }> {
  return lock(CACHE_LOCK, "shared", signal, () => lock(`${CACHE_LOCK}:${model.sha256}`, "exclusive", signal, async () => {
    signal.throwIfAborted();
    const key = new URL(`/__upscale-models/${model.sha256}`, location.origin).href;
    let cache: Cache | undefined, warning: string | undefined;
    try {
      cache = await caches.open(MODEL_CACHE);
      const saved = await cache.match(key);
      if (saved) {
        const data = await saved.arrayBuffer();
        signal.throwIfAborted();
        if (await verifyModel(data, model)) { progress(1); return { data }; }
        await cache.delete(key);
      }
    } catch (error) {
      signal.throwIfAborted();
      warning = "Model storage is unavailable. This session can render, but the model may need downloading again.";
    }
    const response = await fetch(model.url, { signal });
    if (!response.ok || !response.body) throw new Error(`The model could not be downloaded (${response.status}). Try again.`);
    const reader = response.body.getReader();
    const data = new Uint8Array(model.bytes);
    let received = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const { value, done } = await reader.read();
        if (done) break;
        if (received + value.length > data.length) throw new Error("The model download has an unexpected size.");
        data.set(value, received); received += value.length;
        progress(received / data.length);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
    if (received !== model.bytes || !await verifyModel(data.buffer, model)) throw new Error("The model download did not pass verification. Try again.");
    signal.throwIfAborted();
    try { await cache?.put(key, new Response(data, { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(data.length) } })); }
    catch { warning = "The model is ready, but browser storage is full. It may need downloading again next time."; }
    if (typeof window !== "undefined") window.dispatchEvent(new Event(MODEL_CACHE_CHANGED));
    signal.throwIfAborted();
    return { data: data.buffer, warning };
  }));
}
export async function clearUpscaleModels(): Promise<void> {
  await lock(CACHE_LOCK, "exclusive", undefined, async () => { if (typeof caches !== "undefined") await caches.delete(MODEL_CACHE); });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MODEL_CACHE_CHANGED));
}
export async function upscaleModelCacheSize(): Promise<number> {
  if (typeof caches === "undefined" || !await caches.has(MODEL_CACHE)) return 0;
  const cache = await caches.open(MODEL_CACHE);
  const responses = await Promise.all((await cache.keys()).map(key => cache.match(key)));
  return responses.reduce((sum, response) => sum + Number(response?.headers.get("Content-Length") || 0), 0);
}
