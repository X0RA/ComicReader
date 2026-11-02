"use client";
import { ArrowDownToLine, ArrowUpToLine, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Pause, Play, X } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

export function ReaderIconButton({ label, onClick, disabled = false, children, className = "" }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; className?: string }) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-30 sm:h-11 sm:w-11 ${className}`}>{children}</button>;
}

export default function ComicOverlay({ visible, page, lastVisiblePage, total, paged, rtl, previousChapter, nextChapter, canPrevious, canNext, jump, turn, chapter, hide, activity, autoScroll, autoPaused, toggleAuto }: {
  visible: boolean; page: number; lastVisiblePage: number; total: number; paged: boolean; rtl: boolean;
  previousChapter: boolean; nextChapter: boolean; canPrevious: boolean; canNext: boolean;
  jump: (page: number) => void; turn: (direction: number) => void; chapter: (direction: number) => void; hide: () => void; activity: () => void;
  autoScroll: number; autoPaused: boolean; toggleAuto: () => void;
}) {
  const button = (label: string, Icon: ComponentType<{ size: number }>, onClick: () => void, disabled = false, className = "") => <ReaderIconButton label={label} onClick={onClick} disabled={disabled} className={className}><Icon size={19} /></ReaderIconButton>;
  const prev = rtl && paged ? ChevronRight : ChevronLeft;
  const next = rtl && paged ? ChevronLeft : ChevronRight;
  const range = lastVisiblePage > page ? `${page}–${lastVisiblePage}` : String(page);
  return <nav aria-label="Reader controls" inert={!visible} onPointerMove={activity} onFocus={activity} className={`fixed right-3 bottom-[max(24px,env(safe-area-inset-bottom))] left-3 z-30 mx-auto max-w-[680px] rounded-[22px] border bg-card/95 p-2 text-card-foreground shadow-2xl backdrop-blur-xl transition-opacity duration-200 sm:rounded-[18px] ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}>
    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-1">
      <div className="hidden sm:contents">{button("Previous chapter", ChevronsLeft, () => chapter(-1), !previousChapter)}{paged && button("Previous page", prev, () => turn(-1), !canPrevious)}</div>
      <label className="flex min-h-11 min-w-0 flex-1 items-center gap-4 px-3"><span className="sr-only">Page</span>
        <input type="range" min={1} max={Math.max(1, total)} value={page} aria-valuetext={`${range} of ${total}`} onChange={event => jump(Number(event.target.value))} className="h-11 min-w-0 flex-1 cursor-pointer accent-primary" />
        <span className="whitespace-nowrap font-mono text-xs">{range}<span className="text-muted-foreground"> / {total}</span></span>
      </label>
      <div className="hidden sm:contents">{paged && button("Next page", next, () => turn(1), !canNext)}{button("Next chapter", ChevronsRight, () => chapter(1), !nextChapter)}
        <span className="mx-1 h-6 w-px bg-border" />{!paged && <>{button("Scroll to top", ArrowUpToLine, () => jump(1))}{button("Scroll to bottom", ArrowDownToLine, () => jump(total))}</>}
        {!paged && autoScroll > 0 && button(autoPaused ? "Resume auto-scroll" : "Pause auto-scroll", autoPaused ? Play : Pause, toggleAuto)}
        {button("Hide controls", X, hide)}
      </div>
      <div className="flex items-center justify-between sm:hidden">
        {button("Previous chapter", ChevronsLeft, () => chapter(-1), !previousChapter)}
        {paged ? button("Previous page", prev, () => turn(-1), !canPrevious) : button("Scroll to top", ArrowUpToLine, () => jump(1))}
        {button("Hide controls", X, hide, false, "bg-secondary text-foreground")}
        {paged ? button("Next page", next, () => turn(1), !canNext) : button("Scroll to bottom", ArrowDownToLine, () => jump(total))}
        {button("Next chapter", ChevronsRight, () => chapter(1), !nextChapter)}
      </div>
      {!paged && autoScroll > 0 && <button type="button" onClick={toggleAuto} className="flex min-h-11 items-center justify-center gap-2 rounded-xl text-xs text-muted-foreground hover:bg-secondary sm:hidden">{autoPaused ? <Play size={15} /> : <Pause size={15} />}{autoPaused ? "Resume" : "Pause"} auto-scroll</button>}
    </div>
  </nav>;
}
