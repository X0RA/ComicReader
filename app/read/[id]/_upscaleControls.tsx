"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import type { Upscaling } from "./_useUpscaling";
export default function UpscaleControls({ upscaling: u }: { upscaling: Upscaling }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { state: s, model } = u;
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  if (!model) return null;
  const idle = s.status === "idle" || s.status === "error";
  const label = s.status === "loading" ? `Model ${Math.round(s.download * 100)}%` : s.status === "running" ? `Rendering ${s.active.length} ${s.active.length === 1 ? "page" : "pages"}` : s.status === "paused" ? "Render paused" : s.status === "waiting" ? "Render buffer ready" : s.status === "complete" ? "Render complete" : "Render from here";
  const progress = s.status === "loading" ? s.download : s.active.length ? s.active.reduce((sum, item) => sum + item.progress, 0) / s.active.length : 1;
  return <div ref={root} className="relative shrink-0" onKeyDown={event => { if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); root.current?.querySelector("button")?.focus(); } }}>
    <button type="button" title={label} aria-label={label} aria-expanded={open} onClick={() => { if (idle) u.start(); setOpen(value => idle || !value); }} className="relative flex h-11 items-center gap-2 overflow-hidden rounded-xl px-3 text-xs text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring">
      <Sparkles size={17} /><span className="hidden lg:inline">{label}</span>
      {!idle && <span aria-hidden="true" className="absolute inset-x-2 bottom-1 h-0.5 overflow-hidden rounded bg-secondary"><span className="block h-full bg-primary" style={{ width: `${progress * 100}%` }} /></span>}
    </button>
    {open && <section aria-label="Upscaling progress" className="fixed top-[68px] right-3 z-50 w-[min(340px,calc(100vw-24px))] space-y-3 rounded-xl border bg-card p-4 text-sm shadow-xl">
      <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{model.label} · {model.scale}×</h2><button type="button" aria-label="Close upscaling progress" onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-secondary"><X size={16} /></button></div>
      <p role="status">{label}</p>
      {s.status === "loading" && <><progress aria-label="Model download" value={s.download} max={1} className="h-2 w-full accent-primary" /><p className="text-xs text-muted-foreground">Loading and verifying the model, then preparing the GPU.</p></>}
      {s.active.map(item => <label key={item.page} className="block text-xs">Page {item.page} · {Math.round(item.progress * 100)}%<progress aria-label={`Rendering page ${item.page}`} value={item.progress} max={1} className="mt-1 h-2 w-full accent-primary" /></label>)}
      <p className="text-xs text-muted-foreground">{s.images.size} enhanced pages ready · {(s.bytes / 1024 ** 2).toFixed(0)} MB in memory{s.secondsPerPage ? ` · ~${s.secondsPerPage.toFixed(1)}s per page` : ""}</p>
      {s.status === "paused" && s.active.length > 0 && <p className="text-xs text-muted-foreground">Active pages will finish. No new pages start until you resume.</p>}
      {s.status === "waiting" && <p className="text-xs text-muted-foreground">Rendering continues as you read forward, within the memory limit. Earlier uncached pages need a new start.</p>}
      {s.message && <p role="alert" className="text-xs leading-relaxed">{s.message}</p>}{s.warning && <p role="status" className="text-xs leading-relaxed text-muted-foreground">{s.warning}</p>}
      <div className="flex flex-wrap gap-2">
        {!idle && <><button type="button" className="min-h-10 rounded-lg border px-3 hover:bg-secondary" onClick={s.status === "paused" ? u.resume : u.pause}>{s.status === "paused" ? "Resume" : "Pause"}</button><button type="button" className="min-h-10 rounded-lg border px-3 hover:bg-secondary" onClick={u.stop}>Stop</button></>}
        <button type="button" className="min-h-10 rounded-lg border px-3 hover:bg-secondary" onClick={u.start}>Render from here</button>
      </div>
    </section>}
  </div>;
}
