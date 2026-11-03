import type { ReaderPage } from "../reader-pages";
import type { UpscaleModel } from "./models";
import type { RenderResult, RenderWorker } from "./client";

export interface EnhancedPage { url: string; bytes: number; release: () => void }
export interface UpscaleState {
  status: "idle" | "loading" | "running" | "paused" | "waiting" | "complete" | "error";
  download: number; active: { page: number; progress: number }[];
  images: ReadonlyMap<number, string>; rendered: number; bytes: number; secondsPerPage?: number;
  message?: string; warning?: string;
}
interface Dependencies {
  check(): Promise<void>;
  load(signal: AbortSignal, progress: (value: number) => void): Promise<{ data: ArrayBuffer; warning?: string }>;
  worker(weights: ArrayBuffer): RenderWorker;
  decode(result: RenderResult): Promise<EnhancedPage>;
  publish(state: UpscaleState): void;
}
interface Slot { worker: RenderWorker; page?: number; progress: number; reserve: number }
/** Session-only results. Starting and resuming are explicit; page changes only feed an already started queue. */
export class UpscaleQueue {
  private pages: ReaderPage[] = [];
  private visible = [1];
  private cache = new Map<number, EnhancedPage>();
  private slots: Slot[] = [];
  private failed = new Set<number>();
  private controller?: AbortController;
  private weights?: ArrayBuffer;
  private startPage = 1;
  private enabled = false;
  private paused = false;
  private loading = false;
  private generation = 0;
  private count = 0;
  private duration = 0;
  private message?: string;
  private warning?: string;
  private download = 0;
  private fatal = false;
  constructor(private model: UpscaleModel, private jobs: number, private budget: number, private deps: Dependencies) {}
  update(pages: ReaderPage[], visible: number[]) {
    this.pages = pages; this.visible = visible.length ? visible : [1];
    // Going back to an evicted page does not silently spend GPU time redoing it.
    if (this.enabled) this.startPage = Math.max(this.startPage, Math.min(...this.visible));
    this.prune(); this.pump();
  }
  private window() { return { first: Math.min(...this.visible), last: Math.min(this.pages.length, Math.max(...this.visible) + 8) }; }
  private prune() {
    const { first, last } = this.window();
    for (const [page, entry] of this.cache) if (page < first - 2 || page > last) { entry.release(); this.cache.delete(page); }
  }
  private used() { return [...this.cache.values()].reduce((sum, entry) => sum + entry.bytes, 0) + this.slots.reduce((sum, slot) => sum + slot.reserve + this.workerBytes(), 0); }
  private workerBytes() { return 128 * 1024 ** 2 + this.model.bytes * 2; }
  private candidates() {
    const { first, last } = this.window();
    return Array.from({ length: Math.max(0, last - Math.max(first, this.startPage) + 1) }, (_, i) => Math.max(first, this.startPage) + i)
      .filter(page => !this.cache.has(page) && !this.failed.has(page) && !this.slots.some(slot => slot.page === page));
  }
  private emit() {
    const active = this.slots.filter(slot => slot.page !== undefined).map(slot => ({ page: slot.page!, progress: slot.progress }));
    const complete = this.enabled && !this.loading && !active.length && !this.candidates().length && this.window().last === this.pages.length;
    this.deps.publish({ status: this.fatal ? "error" : !this.enabled ? "idle" : this.paused ? "paused" : this.loading ? "loading" : active.length ? "running" : complete ? "complete" : "waiting",
      download: this.download, active, images: new Map([...this.cache].map(([page, value]) => [page, value.url])), rendered: this.count,
      bytes: [...this.cache.values()].reduce((sum, value) => sum + value.bytes, 0), secondsPerPage: this.count ? this.duration / this.count / 1000 : undefined,
      message: this.message, warning: this.warning });
  }
  async start() {
    this.stop();
    this.enabled = true; this.startPage = this.window().first; this.failed.clear(); this.fatal = false; this.message = undefined;
    this.loading = true; this.download = 0; this.warning = undefined; this.count = 0; this.duration = 0;
    const generation = this.generation;
    const controller = this.controller = new AbortController();
    this.emit();
    try {
      await this.deps.check();
      controller.signal.throwIfAborted();
      const loaded = await this.deps.load(controller.signal, value => { if (generation === this.generation) { this.download = value; this.emit(); } });
      if (generation !== this.generation) return;
      this.weights = loaded.data; this.warning = loaded.warning; this.loading = false; this.pump();
    } catch (error) { if (generation === this.generation) this.fail(error); }
  }
  pause() { if (this.enabled) { this.paused = true; this.emit(); } }
  resume() { if (this.enabled) { this.paused = false; this.pump(); } }
  stop() {
    this.generation++; this.controller?.abort(); this.controller = undefined;
    this.slots.forEach(slot => slot.worker.dispose()); this.slots = []; this.weights = undefined;
    this.enabled = false; this.paused = false; this.loading = false; this.emit();
  }
  dispose() { this.stop(); for (const entry of this.cache.values()) entry.release(); this.cache.clear(); }
  private fail(error: unknown) {
    this.stop(); this.fatal = true;
    this.message = `${error instanceof Error ? error.message : String(error)} Originals remain available. Reduce parallel jobs or try another model, then start again.`; this.emit();
  }
  private pump() {
    if (!this.enabled || this.paused || this.loading || !this.weights) { this.emit(); return; }
    for (const number of this.candidates()) {
      const page = this.pages[number - 1];
      // Never let background pages overtake a visible page still being extracted.
      if (page.status === "pending") break;
      if (page.status === "error") { this.failed.add(number); continue; }
      if (this.slots.filter(slot => slot.page !== undefined).length >= this.jobs) break;
      const pixels = page.width * page.height * this.model.scale ** 2;
      // Allow for decoded output, PNG encoding, input pixels and a tile/session working set.
      const reserve = pixels * 8 + page.width * page.height * 4;
      let admission = reserve + (this.slots.some(slot => slot.page === undefined) ? 0 : this.workerBytes());
      if (pixels > 64_000_000 || reserve + this.workerBytes() > this.budget) {
        this.failed.add(number); this.message = `Page ${number} is too large for this rendering budget. Try a 2× model.`; continue;
      }
      while (this.used() + admission > this.budget && this.slots.length > 1) {
        const idle = this.slots.findIndex(slot => slot.page === undefined);
        if (idle < 0) break;
        this.slots.splice(idle, 1)[0].worker.dispose();
        admission = reserve + (this.slots.some(slot => slot.page === undefined) ? 0 : this.workerBytes());
      }
      if (this.used() + admission > this.budget && this.visible.includes(number)) {
        // Visible pages take precedence over retained or prefetched images.
        const evict = [...this.cache.keys()].filter(n => !this.visible.includes(n)).sort((a, b) => Math.abs(b - number) - Math.abs(a - number));
        for (const n of evict) { this.cache.get(n)!.release(); this.cache.delete(n); if (this.used() + admission <= this.budget) break; }
      }
      if (this.used() + admission > this.budget) break;
      let slot = this.slots.find(slot => slot.page === undefined);
      if (!slot) {
        try { slot = { worker: this.deps.worker(this.weights), progress: 0, reserve: 0 }; this.slots.push(slot); }
        catch (error) { this.fail(error); return; }
      }
      slot.page = number; slot.progress = 0; slot.reserve = reserve;
      void this.render(slot, page.url, number, this.generation);
    }
    this.emit();
  }
  private async render(slot: Slot, url: string, number: number, generation: number) {
    try {
      const result = await slot.worker.render(url, progress => { if (generation === this.generation) { slot.progress = progress; this.emit(); } });
      if (generation !== this.generation) return;
      const entry = await this.deps.decode(result);
      const { first, last } = this.window();
      if (generation !== this.generation || number < first - 2 || number > last) entry.release();
      else { this.cache.set(number, entry); this.count++; this.duration += result.duration; }
    } catch (error) { if (generation === this.generation) this.fail(error); return; }
    if (generation !== this.generation) return;
    slot.page = undefined; slot.reserve = 0; this.pump();
  }
}
