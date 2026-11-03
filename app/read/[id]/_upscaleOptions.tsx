"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { ReaderSettings } from "@/lib/reader-settings";
import { selectedUpscaleModel } from "@/lib/upscale/models";
import { clearUpscaleModels, upscaleModelCacheSize, MODEL_CACHE_CHANGED } from "@/lib/upscale/model-cache";
function Select({ label, value, onChange, children }: { label: string; value: string; onChange(value: string): void; children: ReactNode }) {
  return <label className="flex items-center justify-between gap-3 text-sm"><span>{label}</span><select aria-label={label} value={value} onChange={event => onChange(event.target.value)} className="min-h-11 max-w-[65%] rounded-lg border bg-background px-2 text-sm">{children}</select></label>;
}
export default function UpscaleOptions({ settings: s, change, busy }: { settings: ReaderSettings; change(patch: Partial<ReaderSettings>): void; busy: boolean }) {
  const model = selectedUpscaleModel(s);
  const [bytes, setBytes] = useState(0), [message, setMessage] = useState("");
  const [clearing, setClearing] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => { void upscaleModelCacheSize().then(value => { if (alive) setBytes(value); }).catch(() => {}); };
    refresh(); window.addEventListener(MODEL_CACHE_CHANGED, refresh); window.addEventListener("focus", refresh);
    return () => { alive = false; window.removeEventListener(MODEL_CACHE_CHANGED, refresh); window.removeEventListener("focus", refresh); };
  }, []);
  return <section aria-label="Upscaling" className="space-y-3 border-t pt-5"><h3 className="text-sm font-semibold">Upscaling</h3>
    <Select label="Upscaling model" value={s.upscaleModel} onChange={value => change({ upscaleModel: value as ReaderSettings["upscaleModel"] })}>
      <option value="off">Off</option><option value="anime4k">Anime4K · 2×</option><option value="anime-v3">Real-ESRGAN Anime v3 · 4×</option><option value="cugan">Real-CUGAN</option><option value="anime-sharp">AnimeSharp V3 · 2×</option>
    </Select>
    {s.upscaleModel === "anime4k" && <Select label="Anime4K mode" value={s.upscaleMode} onChange={value => change({ upscaleMode: value as ReaderSettings["upscaleMode"] })}><option>A</option><option>B</option><option>C</option></Select>}
    {s.upscaleModel === "cugan" && <><Select label="Output scale" value={s.upscaleScale} onChange={value => change({ upscaleScale: value as ReaderSettings["upscaleScale"] })}><option value="2">2×</option><option value="3">3×</option><option value="4">4×</option></Select>
      {s.upscaleScale === "2" ? <Select label="Denoising" value={s.upscaleDenoise} onChange={value => change({ upscaleDenoise: value as ReaderSettings["upscaleDenoise"] })}><option value="conservative">Conservative</option><option value="none">None</option><option value="denoise3x">Strong</option></Select> : <p className="text-xs text-muted-foreground">3× and 4× use conservative denoising.</p>}</>}
    {model && <><label className="block text-sm"><span className="flex justify-between">Parallel jobs<output>Up to {s.upscaleJobs}</output></span><input aria-label="Parallel jobs" type="range" min="1" max="3" step="1" value={s.upscaleJobs} onChange={event => change({ upscaleJobs: Number(event.target.value) })} className="h-11 w-full accent-primary" /></label>
      <label className="block text-sm"><span className="flex justify-between">Pages to render ahead<output>{s.upscaleAhead === 0 ? "Current only" : s.upscaleAhead}</output></span><input aria-label="Pages to render ahead" aria-valuetext={s.upscaleAhead === 0 ? "Current page or spread only" : `${s.upscaleAhead} pages ahead`} type="range" min="0" max="32" step="1" value={s.upscaleAhead} onChange={event => change({ upscaleAhead: Number(event.target.value) })} className="h-11 w-full accent-primary" /></label>
      <p className="text-xs leading-relaxed text-muted-foreground">The current page or spread renders first, followed by this many pages ahead, within the memory budget. This slider adjusts an active job without restarting it.</p>
      <p className="text-xs leading-relaxed text-muted-foreground">Use Render from here in the top bar to start. Settings never start rendering automatically. Parallel jobs is a maximum. The app’s memory budget can reduce it, especially with larger models or pages. More jobs may not be faster.</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{(model.bytes / 1024 ** 2).toFixed(1)} MB model download on first use, cached in this browser. Enhanced pages stay in memory while reading. Changing the model, mode, scale, denoising, or job count stops the current render.</p>
      {s.upscaleModel === "anime-sharp" && <p className="text-xs text-muted-foreground">AnimeSharp V3 is licensed for non-commercial use under <a className="underline" href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a>.</p>}</>}
    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>Cached models: {(bytes / 1024 ** 2).toFixed(1)} MB</span><button type="button" disabled={busy || clearing || !bytes} className="min-h-11 rounded-lg border px-3 hover:bg-secondary disabled:opacity-40" onClick={async () => { setClearing(true); try { await clearUpscaleModels(); setBytes(0); setMessage("Cached models cleared."); } catch { setMessage("Could not clear models. Try again."); } finally { setClearing(false); } }}>Clear models</button></div>
    {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
  </section>;
}
