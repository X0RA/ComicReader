"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { BookOpen, PanelTop, PanelsTopLeft, RotateCcw, X } from "lucide-react";
import type { ReaderSettings } from "@/lib/reader-settings";
import styles from "./reader.module.css";

function Segment<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void }) {
  return <div className="space-y-2"><p className="text-xs font-medium text-muted-foreground">{label}</p>
    <div role="group" aria-label={label} className="flex rounded-xl border bg-background p-1">
      {options.map(([key, title]) => <button key={key} type="button" aria-pressed={key === value} onClick={() => onChange(key)} className={`min-h-11 min-w-0 flex-1 rounded-lg px-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring ${key === value ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{title}</button>)}
    </div></div>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={onChange} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-md text-left text-sm focus-visible:outline-2 focus-visible:outline-ring">
    <span>{label}</span><span aria-hidden="true" className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted-foreground/35"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} /></span>
  </button>;
}
function Range({ label, value, min, max, step = 1, unit = "%", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  const display = unit === "×" && value === 0 ? "Off" : `${value}${unit}`;
  return <label className="block"><span className="flex justify-between gap-3 text-sm"><span>{label}</span><output className="font-mono text-xs text-muted-foreground">{display}</output></span>
    <input type="range" min={min} max={max} step={step} value={value} aria-valuetext={display} onChange={event => onChange(Number(event.target.value))} className="h-11 w-full cursor-pointer accent-primary" />
  </label>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section aria-label={title} className="space-y-3 border-t pt-5"><h3 className="text-sm font-semibold">{title}</h3>{children}</section>;
}

export default function ViewOptions({ settings: s, change, reset, onClose, phone, wakeStatus, storageError }: {
  settings: ReaderSettings; change: (patch: Partial<ReaderSettings>) => void; reset: () => void; onClose: () => void; phone: boolean; wakeStatus: string; storageError: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus({ preventScroll: true }); };
  }, []);
  const webtoon = s.layout === "webtoon";
  const toggle = (key: { [K in keyof ReaderSettings]: ReaderSettings[K] extends boolean ? K : never }[keyof ReaderSettings], label: string) => <Toggle label={label} checked={s[key]} onChange={() => change({ [key]: !s[key] })} />;
  return <dialog ref={ref} aria-labelledby="reader-options-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }} className={`${styles.options} border bg-card text-card-foreground shadow-2xl`}>
    <div className="flex max-h-[inherit] flex-col" onClick={event => event.stopPropagation()}>
      <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-muted-foreground/40 sm:hidden" />
      <div className="flex shrink-0 items-center justify-between border-b px-5 py-2">
        <div><h2 id="reader-options-title" className="text-sm font-semibold">View options</h2><p className="text-xs text-muted-foreground">Applies to all comics</p></div>
        <button type="button" onClick={onClose} aria-label="Close view options" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"><X size={18} /></button>
      </div>
      <div className="space-y-5 overflow-y-auto overscroll-contain px-5 pt-5 pb-[max(24px,env(safe-area-inset-bottom))]">
        <section aria-label="Layout" className="space-y-3"><h3 className="text-sm font-semibold">Layout</h3>
          <div role="group" aria-label="Reading layout" className="grid grid-cols-3 gap-2">{([
            ["webtoon", "Webtoon", PanelsTopLeft], ["single", "Single", PanelTop], ["spread", "Spread", BookOpen],
          ] as const).map(([key, label, Icon]) => <button key={key} type="button" aria-pressed={s.layout === key} onClick={() => change({ layout: key, fit: key === "webtoon" ? "width" : phone ? "width" : "height" })} className={`flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-xl border text-xs focus-visible:outline-2 focus-visible:outline-ring ${s.layout === key ? "border-primary bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50"}`}><Icon size={22} strokeWidth={1.6} />{label}</button>)}</div>
          {webtoon ? <>{!phone && <Range label="Maximum width" value={s.maxWidth} min={400} max={1200} step={20} unit=" px" onChange={maxWidth => change({ maxWidth })} />}{toggle("gap", "Gap between pages")}</> : <>
            <Segment label="Direction" value={s.direction} options={[["ltr", "Left to right"], ["rtl", "Right to left"]]} onChange={direction => change({ direction })} />
            {toggle("autoSpread", "Auto spread in landscape")}
            {(s.layout === "spread" || s.autoSpread) && <><Range label="Spine gap" value={s.spineGap} min={0} max={24} unit=" px" onChange={spineGap => change({ spineGap })} />{toggle("coverAlone", "Cover on its own")}{toggle("wideAlone", "Show wide pages alone")}</>}
          </>}
        </section>
        <Section title="Size">
          <Segment label="Fit" value={s.fit} options={webtoon ? [["width", "Width"], ["original", "Original"]] : [["width", "Width"], ["height", "Height"], ["original", "Original"]]} onChange={fit => change({ fit })} />
          <Range label="Zoom" value={s.zoom} min={50} max={200} step={5} onChange={zoom => change({ zoom })} />
          <div>{toggle("noUpscale", "Don’t enlarge small pages")}{toggle("crop", "Crop borders")}</div>
          {s.crop && <p className="text-xs leading-relaxed text-muted-foreground">Trims uniform black or white edges conservatively. Artwork and ambiguous margins are kept.</p>}
        </Section>
        <Section title="Navigation">
          <Segment label="Tap zones" value={s.tapZones} options={[["off", "Off"], ["sides", "Sides"], ["vertical", "Top & bottom"]]} onChange={tapZones => change({ tapZones })} />
          {s.tapZones !== "off" && toggle("swapTapZones", "Swap tap zones")}
          {!webtoon && <>{!phone && <Segment label="Mouse wheel" value={s.wheel} options={[["scroll", "Scroll"], ["turn", "Turn page"]]} onChange={wheel => change({ wheel })} />}
            <Segment label="Page transition" value={s.transition} options={[["none", "None"], ["slide", "Slide"], ["fade", "Fade"]]} onChange={transition => change({ transition })} /></>}
          {webtoon && <Range label="Auto-scroll speed" value={s.autoScroll} min={0} max={10} unit="×" onChange={autoScroll => change({ autoScroll })} />}
          {toggle("autoAdvance", "Open next chapter at end")}
          <p className="text-xs leading-relaxed text-muted-foreground">Tap the middle to show controls{webtoon ? "; tap anywhere to pause auto-scroll." : ". Arrow keys turn pages; Home and End jump to the first and last page."}</p>
        </Section>
        <Section title="Display">
          <Segment label="Background" value={s.background} options={[["black", "Black"], ["grey", "Grey"], ["white", "White"]]} onChange={background => change({ background })} />
          <Range label="Brightness" value={s.brightness} min={20} max={100} step={5} onChange={brightness => change({ brightness })} />
          <Range label="Warmth" value={s.warmth} min={0} max={100} step={5} onChange={warmth => change({ warmth })} />
          <div>{toggle("shadow", "Page shadow")}{toggle("greyscale", "Greyscale")}{toggle("keepAwake", "Keep screen awake")}</div>
          {wakeStatus && <p role="status" className="text-xs text-muted-foreground">{wakeStatus}</p>}
        </Section>
        {storageError && <p role="status" className="text-xs text-muted-foreground">Settings apply now, but browser storage is unavailable and they cannot be saved.</p>}
        <button type="button" onClick={reset} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"><RotateCcw size={15} />Reset to defaults</button>
      </div>
    </div>
  </dialog>;
}
