"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { isOfflineReading } from "@/lib/offline";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkPlus, ChevronLeft, ChevronRight, PanelRight, SlidersHorizontal } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-controls";
import { db, type ComicBookmark } from "@/lib/dexieDB";
import { useBookmarks } from "@/lib/use-bookmarks";
import BookmarkEditor from "@/components/bookmark-editor";
import BookmarkSidebar from "./_bookmarkSidebar";
import { parseComicName } from "@/lib/comic-name";
import { pairReaderPages, type ReaderPage } from "@/lib/reader-pages";
import { effectiveReaderLayout, tapNavigation } from "@/lib/reader-settings";
import type { ReaderChapter } from "@/lib/reader-catalog";
import { useComic } from "./_useComic";
import { useReaderSettings, useReaderWakeLock } from "./_readerHooks";
import ComicView, { type ComicViewHandle } from "./_comicView";
import ComicOverlay, { ReaderIconButton } from "./_comicOverlay";
import ViewOptions from "./_viewOptions";
import ReaderLoading from "./_readerLoading";
import PreparationProgress from "./_preparationProgress";
import { useUpscaling } from "./_useUpscaling";
import UpscaleControls from "./_upscaleControls";
import styles from "./reader.module.css";

// Serialize progress writes so a slower older IndexedDB write cannot win a page turn.
let progressWrites = Promise.resolve();
function saveProgress(id: string, page: number, total: number, completed: boolean) {
  const write = progressWrites.catch(() => {}).then(() => db.markComicStatus(id, completed ? "completed" : "in_progress", page, total));
  progressWrites = write.catch(() => {});
  return write;
}
function comicTitle(name: string) { return parseComicName(name).title; }

function Reader({ id, chapter, pages, initialPage, prepared, preparing, prioritize, warning }: {
  id: string; chapter: ReaderChapter; pages: ReaderPage[]; initialPage: number; prepared: number; preparing: boolean;
  prioritize: (page: number) => void; warning?: string;
}) {
  const router = useRouter();
  const { settings, change, reset, ready, viewport, storageError } = useReaderSettings();
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [controls, setControls] = useState(true);
  const [panel, setPanel] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [bookmarkEditor, setBookmarkEditor] = useState<{ bookmark: ComicBookmark; choices?: ComicBookmark[] }>();
  const bookmarkState = useBookmarks(id);
  const [autoPaused, setAutoPaused] = useState(false);
  const [turnDirection, setTurnDirection] = useState(1);
  const [progressError, setProgressError] = useState(false);
  const [dismissWarning, setDismissWarning] = useState(false);
  const view = useRef<ComicViewHandle>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const manuallyHidden = useRef(false);
  const navigating = useRef(false);
  const started = useRef(0);
  const complete = useRef(false);
  const wakeStatus = useReaderWakeLock(ready && settings.keepAwake);
  const layout = effectiveReaderLayout(settings, viewport.width > viewport.height);
  const paged = layout !== "webtoon";
  const spreadPolicy = `${layout}:${settings.coverAlone}:${settings.wideAlone}`;
  const spreadAnchor = useRef<{ policy: string; pages: number[] } | undefined>(undefined);
  const groups = useMemo(() => {
    const anchor = spreadAnchor.current;
    const keep = anchor?.policy === spreadPolicy && anchor.pages.includes(currentPage) ? anchor.pages : undefined;
    return layout === "spread" ? pairReaderPages(pages, settings.coverAlone, settings.wideAlone, keep) : pages.map((_, index) => [index + 1]);
  }, [layout, pages, settings.coverAlone, settings.wideAlone, spreadPolicy, currentPage]);
  const groupIndex = Math.max(0, groups.findIndex(group => group.includes(currentPage)));
  const visiblePages = groups[groupIndex];
  spreadAnchor.current = { policy: spreadPolicy, pages: visiblePages };
  const page = visiblePages[0];
  const lastPage = visiblePages[visiblePages.length - 1];
  const upscaling = useUpscaling(pages, visiblePages, settings, viewport.phone);
  const visibleReady = !visiblePages.some(number => pages[number - 1].status === "pending");
  const bookmarkChoices = visiblePages.filter(number => !pages[number - 1].status).map(number =>
    bookmarkState.bookmarks.find(bookmark => bookmark.page === number) ?? {
      comicId: id, comicName: chapter.comic.name.replace(/\.(cbz|zip)$/i, ""), page: number, note: "", createdAt: 0, updatedAt: 0,
    });
  const latest = useRef({ page, lastPage });
  latest.current = { page, lastPage };
  useEffect(() => { prioritize(currentPage); }, [currentPage, prioritize]);

  const activity = useCallback(() => {
    // Desktop visibility belongs to hover/focus regions, never page activity.
    if (!viewport.phone || manuallyHidden.current) return;
    clearTimeout(idle.current);
    setControls(true);
    idle.current = setTimeout(() => {
      // Keyboard users retain their focused controls until they move away.
      if (!document.activeElement?.closest('nav[aria-label="Reader controls"]')) setControls(false);
    }, 4500);
  }, [viewport.phone]);
  const hideControls = useCallback(() => {
    manuallyHidden.current = true;
    clearTimeout(idle.current);
    setControls(false);
  }, []);
  const resetDesktopControls = () => {
    if (viewport.phone) return;
    // X/Escape dismisses the current hover; a fresh entry can reveal it again.
    manuallyHidden.current = false;
    setControls(true);
  };
  useEffect(() => { started.current = performance.now(); activity(); return () => clearTimeout(idle.current); }, [activity]);
  useEffect(() => { if (panel) { manuallyHidden.current = false; clearTimeout(idle.current); setControls(true); } else activity(); }, [panel, activity]);
  useEffect(() => { setAutoPaused(false); }, [settings.autoScroll]);

  const chapterNavigation = useCallback((direction: number) => {
    const target = direction < 0 ? chapter.previous : chapter.next;
    if (!target || navigating.current) return;
    navigating.current = true;
    const url = `/read/${encodeURIComponent(target.id)}`;
    if (isOfflineReading()) location.assign(url); else router.push(url);
  }, [chapter, router]);
  const atEnd = useCallback(() => {
    // Do not auto-advance merely because a restored page is already at the end.
    if (panel || bookmarkEditor || performance.now() - started.current < 1000) return;
    if (pages[pages.length - 1].status === "pending") { prioritize(pages.length); return; }
    complete.current = true;
    latest.current = { page: pages.length, lastPage: pages.length };
    setCurrentPage(pages.length);
    if (settings.autoAdvance && chapter.next) chapterNavigation(1);
    else if (settings.autoScroll > 0) { setAutoPaused(true); activity(); }
  }, [panel, bookmarkEditor, settings.autoAdvance, settings.autoScroll, chapter.next, chapterNavigation, activity, pages, prioritize]);
  const jump = useCallback((target: number) => {
    const next = Math.min(pages.length, Math.max(1, target));
    spreadAnchor.current = { policy: spreadPolicy, pages: groups.find(group => group.includes(next)) ?? [next] };
    prioritize(next);
    setTurnDirection(next >= currentPage ? 1 : -1);
    setCurrentPage(next);
    view.current?.jump(next, !paged && next === pages.length);
    activity();
  }, [pages.length, currentPage, paged, activity, groups, spreadPolicy, prioritize]);
  const turn = useCallback((direction: number) => {
    if (direction > 0 && groupIndex === groups.length - 1) { if (settings.autoAdvance) chapterNavigation(1); return; }
    const next = groups[groupIndex + direction];
    if (next) jump(next[0]);
  }, [groupIndex, groups, settings.autoAdvance, chapterNavigation, jump]);

  const onTap = (x: number, y: number) => {
    if (panel || bookmarkEditor) return;
    if (viewport.phone) manuallyHidden.current = false;
    activity();
    if (settings.autoScroll > 0 && !autoPaused && !paged) { setAutoPaused(true); return; }
    const direction = tapNavigation(settings, settings.tapZones === "vertical" ? y : x, paged);
    if (direction) turn(direction);
  };

  useEffect(() => {
    if (!ready) return;
    if (!visibleReady) return;
    if (lastPage === pages.length) complete.current = true;
    const timer = setTimeout(() => {
      void saveProgress(id, page, pages.length, complete.current).then(() => setProgressError(false)).catch(() => setProgressError(true));
    }, 250);
    return () => clearTimeout(timer);
  }, [id, page, lastPage, pages.length, visibleReady, ready]);
  useEffect(() => {
    const flush = () => { void saveProgress(id, latest.current.page, pages.length, complete.current).catch(() => {}); };
    const visibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", visibility); flush(); };
  }, [id, pages.length]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (panel || bookmarkEditor || event.altKey || event.ctrlKey || event.metaKey || (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable="true"]'))) return;
      if (event.key === " " && event.target instanceof HTMLElement && event.target.closest("button, a")) return;
      const rtl = paged && settings.direction === "rtl";
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", " ", "Escape"].includes(event.key)) {
        event.preventDefault();
        activity();
        if (event.key === "ArrowLeft") turn(rtl ? 1 : -1);
        if (event.key === "ArrowRight") turn(rtl ? -1 : 1);
        if (event.key === "Home") jump(1);
        if (event.key === "End") jump(pages.length);
        if (event.key === "PageDown" || event.key === " ") { if (paged) turn(event.shiftKey ? -1 : 1); else view.current?.scrollBy(viewport.height * (event.shiftKey ? -.85 : .85)); }
        if (event.key === "PageUp") { if (paged) turn(-1); else view.current?.scrollBy(-viewport.height * .85); }
        if (event.key === "ArrowUp") view.current?.scrollBy(-80);
        if (event.key === "ArrowDown") { if (!paged && view.current?.atEnd()) atEnd(); else view.current?.scrollBy(80); }
        if (event.key === "Escape") hideControls();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [panel, bookmarkEditor, paged, settings.direction, activity, turn, jump, pages.length, viewport.height, atEnd, hideControls]);

  const back = () => { void db.setLastFolder(chapter.folderId).catch(() => {}).then(() => { if (isOfflineReading()) location.assign("/"); else router.push("/"); }); };
  const canPrevious = groupIndex > 0;
  const canNext = groupIndex < groups.length - 1 || (settings.autoAdvance && !!chapter.next);
  const rtl = paged && settings.direction === "rtl";
  return <main className="fixed inset-0 bg-background font-sans text-foreground">
    <header className="absolute inset-x-0 top-0 z-30 flex h-[60px] items-center gap-1 border-b bg-background/90 px-1 backdrop-blur-xl sm:gap-3 sm:px-4">
      <ReaderIconButton label="Back to library folder" onClick={back}><ChevronLeft size={19} /></ReaderIconButton>
      <h1 title={chapter.comic.name} className="min-w-0 flex-1 truncate text-[15px] font-medium">{comicTitle(chapter.comic.name)}</h1>
      <UpscaleControls upscaling={upscaling} />
      {preparing && <PreparationProgress prepared={prepared} total={pages.length} />}
      <ReaderIconButton label="Bookmark page" disabled={bookmarkState.loading || !bookmarkChoices.length} onClick={() => setBookmarkEditor({ bookmark: bookmarkChoices[0], choices: bookmarkChoices })}>
        {bookmarkState.bookmarks.some(bookmark => visiblePages.includes(bookmark.page)) ? <Bookmark size={18} className="fill-primary text-primary" /> : <BookmarkPlus size={18} />}
      </ReaderIconButton>
      <button type="button" aria-label="Toggle bookmarks sidebar" aria-expanded={bookmarksOpen} onClick={() => setBookmarksOpen(value => !value)} className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary ${bookmarksOpen ? "bg-secondary text-foreground" : ""}`}><PanelRight size={18} /></button>
      <button type="button" onClick={() => setPanel(true)} aria-label="View options" aria-haspopup="dialog" aria-expanded={panel} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring ${panel ? "bg-secondary text-foreground" : ""}`}><SlidersHorizontal size={19} /></button>
      <ThemeSwitcher />
    </header>
    <div className="absolute inset-x-0 top-[60px] bottom-0">
      {ready && <ComicView ref={view} pages={pages} enhanced={upscaling.state.images} settings={settings} layout={layout} visiblePages={visiblePages} currentPage={currentPage} width={viewport.width} height={viewport.height} phone={viewport.phone} panelOpen={panel || !!bookmarkEditor} turnDirection={turnDirection} onPage={setCurrentPage}
        onScrollDirection={direction => { if (!viewport.phone) return; if (direction < 0) activity(); else if (!panel) setControls(false); }} onTap={onTap} onTurn={turn} onEnd={atEnd} autoRunning={settings.autoScroll > 0 && !autoPaused && pages[currentPage - 1].status !== "pending"} />}
    </div>
    {(progressError || (warning && !dismissWarning)) && <div role="status" className="fixed inset-x-3 top-[72px] z-30 mx-auto flex max-w-lg items-center gap-3 rounded-xl border bg-card p-3 text-xs shadow-lg"><span className="flex-1">{progressError ? "Reading progress could not be saved. Browser storage may be full." : warning}</span>{!progressError && <button type="button" onClick={() => setDismissWarning(true)} className="min-h-11 px-2 text-primary">Dismiss</button>}</div>}
    {paged && (!viewport.phone || controls) && !panel && <div className="pointer-events-none fixed inset-x-3 top-1/2 z-20 hidden justify-between sm:flex">
      <div className={viewport.phone ? "pointer-events-auto" : styles.desktopTurn}>
        <ReaderIconButton label={rtl ? "Next page" : "Previous page"} disabled={rtl ? !canNext : !canPrevious} onClick={() => turn(rtl ? 1 : -1)} className="pointer-events-auto rounded-full bg-card/80 text-foreground shadow-lg backdrop-blur"><ChevronLeft size={20} /></ReaderIconButton>
      </div>
      <div className={viewport.phone ? "pointer-events-auto" : styles.desktopTurn}>
        <ReaderIconButton label={rtl ? "Previous page" : "Next page"} disabled={rtl ? !canPrevious : !canNext} onClick={() => turn(rtl ? -1 : 1)} className="pointer-events-auto rounded-full bg-card/80 text-foreground shadow-lg backdrop-blur"><ChevronRight size={20} /></ReaderIconButton>
      </div>
    </div>}
    <div hidden={panel} className={viewport.phone ? undefined : styles.desktopControls} onPointerEnter={resetDesktopControls} onPointerLeave={resetDesktopControls}>
      <ComicOverlay visible={controls && !panel} page={page} lastVisiblePage={lastPage} total={pages.length} paged={paged} rtl={rtl} previousChapter={!!chapter.previous} nextChapter={!!chapter.next} canPrevious={canPrevious} canNext={canNext} jump={jump} turn={turn} chapter={chapterNavigation} hide={hideControls} activity={activity} autoScroll={settings.autoScroll} autoPaused={autoPaused} toggleAuto={() => { setAutoPaused(value => !value); activity(); }} />
    </div>
    <p className="sr-only" aria-live="polite" aria-atomic="true">Page {page}{lastPage > page ? ` to ${lastPage}` : ""} of {pages.length}</p>
    {bookmarksOpen && <BookmarkSidebar {...bookmarkState} onClose={() => setBookmarksOpen(false)} onEdit={bookmark => setBookmarkEditor({ bookmark })} onOpen={number => { jump(number); setBookmarksOpen(false); }} />}
    {bookmarkEditor && <BookmarkEditor key={`${bookmarkEditor.bookmark.comicId}:${bookmarkEditor.bookmark.page}`} {...bookmarkEditor} onClose={() => setBookmarkEditor(undefined)} />}
    {panel && <>
      {settings.tapZones !== "off" && <div aria-hidden="true" className={`pointer-events-none fixed inset-x-0 top-[60px] bottom-0 z-40 grid ${settings.tapZones === "sides" ? "grid-cols-3" : "grid-rows-3"}`}>
        {[0, 1, 2].map((zone) => zone === 1 ? <div key={zone} /> : <div key={zone} className="m-3 flex items-center justify-center rounded-2xl border border-dashed border-primary/60"><span className="rounded-full bg-card/90 px-3 py-1.5 text-xs text-primary">{tapNavigation(settings, zone === 0 ? 0 : 1, paged) === 1 ? "Next" : "Previous"}</span></div>)}
      </div>}
      <ViewOptions upscaleBusy={["loading", "running", "waiting", "paused"].includes(upscaling.state.status)} settings={settings} change={change} reset={reset} onClose={() => setPanel(false)} phone={viewport.phone} wakeStatus={wakeStatus} storageError={storageError} />
    </>}
  </main>;
}

export default function ReadFilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { id } = use(params);
  const { page: requested } = use(searchParams);
  const requestedPage = typeof requested === "string" && /^\d+$/.test(requested) && Number.isSafeInteger(Number(requested)) && Number(requested) > 0 ? Number(requested) : undefined;
  const [retry, setRetry] = useState(0);
  const comic = useComic(id, retry, requestedPage);
  if (comic.loading || comic.error || !comic.chapter) return <main className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
    <header className="flex h-[60px] items-center gap-3 border-b px-4"><Link href="/" aria-label="Back to library" className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary"><ChevronLeft size={19} /></Link><h1 className="min-w-0 flex-1 truncate text-sm font-medium">{comic.chapter ? comicTitle(comic.chapter.comic.name) : "Reader"}</h1><ThemeSwitcher /></header>
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
      {comic.error ? <><h2 className="text-lg font-medium">Couldn’t open this comic</h2><p role="alert" className="max-w-md text-sm text-muted-foreground">{comic.error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="min-h-11 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground">Try again</button></> : <ReaderLoading phase={comic.phase} progress={comic.progress} />}
    </div>
  </main>;
  return <Reader key={`${id}-${retry}-${requestedPage ?? "resume"}`} id={id} chapter={comic.chapter} pages={comic.pages} initialPage={comic.initialPage} prepared={comic.prepared} preparing={comic.preparing} prioritize={comic.prioritize} warning={comic.warning} />;
}
