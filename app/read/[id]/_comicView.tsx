"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { croppedPageSize, readerCropBounds, readerPageWidth, type ReaderPage } from "@/lib/reader-pages";
import type { ReaderSettings } from "@/lib/reader-settings";
import styles from "./reader.module.css";

function PageImage({ page, number, settings, availableWidth, availableHeight, eager }: {
  page: ReaderPage; number: number; settings: ReaderSettings; availableWidth: number; availableHeight: number; eager: boolean;
}) {
  const bounds = readerCropBounds(page, settings.crop, settings.cropTightness);
  const { width: croppedWidth, height: croppedHeight } = croppedPageSize(page, bounds);
  const width = readerPageWidth({ width: croppedWidth, height: croppedHeight }, settings.fit, availableWidth, availableHeight, settings.zoom, settings.noUpscale);
  const height = width * croppedHeight / croppedWidth;
  const scale = width / croppedWidth;
  return <div className={`relative shrink-0 overflow-hidden ${settings.shadow ? "shadow-2xl" : ""}`} style={{ width, height }}>
    {/* Local object URLs are decoded from the actual cached archive. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={page.url} alt={`Page ${number}`} draggable={false} loading={eager ? "eager" : "lazy"} decoding="async"
      width={page.width} height={page.height} className="absolute block max-w-none select-none" style={{ filter: settings.greyscale ? "grayscale(1)" : undefined, width: page.width * scale, height: page.height * scale, left: -bounds.left * page.width * scale, top: -bounds.top * page.height * scale }} />
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: 1 - settings.brightness / 100 }} />
    <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: `rgba(255, 150, 60, ${settings.warmth / 100 * .3})`, mixBlendMode: "multiply" }} />
  </div>;
}

export interface ComicViewHandle {
  jump: (page: number, bottom?: boolean) => void;
  scrollBy: (amount: number) => void;
  atEnd: () => boolean;
}
interface Props {
  pages: ReaderPage[];
  settings: ReaderSettings;
  layout: ReaderSettings["layout"];
  visiblePages: number[];
  currentPage: number;
  width: number;
  height: number;
  phone: boolean;
  panelOpen: boolean;
  turnDirection: number;
  onPage: (page: number) => void;
  onScrollDirection: (direction: number) => void;
  onTap: (x: number, y: number) => void;
  onTurn: (direction: number) => void;
  onEnd: () => void;
  autoRunning: boolean;
}

const ComicView = forwardRef<ComicViewHandle, Props>(function ComicView({ pages, settings, layout, visiblePages, currentPage, width, height, phone, panelOpen, turnDirection, onPage, onScrollDirection, onTap, onTurn, onEnd, autoRunning }, forwardedRef) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const [stageWidth, setStageWidth] = useState(width);
  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const measure = () => setStageWidth(root.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  const pointerStart = useRef<{ x: number; y: number; time: number; scroll: number } | null>(null);
  const lastScroll = useRef(0);
  const scrollAnchor = useRef({ page: currentPage, offset: 0 });
  const currentRef = useRef(currentPage);
  currentRef.current = currentPage;
  const callbacks = useRef({ onPage, onScrollDirection, onTurn, onEnd, panelOpen });
  callbacks.current = { onPage, onScrollDirection, onTurn, onEnd, panelOpen };
  const paged = layout !== "webtoon";
  const availableWidth = Math.max(1, stageWidth - (phone ? 0 : paged ? 144 : 32));
  const availableHeight = Math.max(120, height - 60 - (phone ? 16 : 32));
  const jump = useCallback((page: number, bottom = false) => {
    const root = scrollRef.current;
    if (!root) return;
    if (paged) { root.scrollTo({ top: 0, left: 0 }); lastScroll.current = 0; return; }
    const target = pageRefs.current.get(page);
    if (target) {
      root.scrollTop = bottom ? root.scrollHeight : target.offsetTop - 16;
      lastScroll.current = root.scrollTop;
      scrollAnchor.current = { page, offset: root.scrollTop - target.offsetTop };
    }
  }, [paged]);
  useImperativeHandle(forwardedRef, () => ({
    jump,
    scrollBy: amount => scrollRef.current?.scrollBy({ top: amount, behavior: "instant" }),
    atEnd: () => { const root = scrollRef.current; return !!root && root.scrollTop + root.clientHeight >= root.scrollHeight - 3; },
  }), [jump]);

  useLayoutEffect(() => { jump(currentRef.current); }, [jump, stageWidth, height, settings.maxWidth, settings.fit, settings.zoom, settings.noUpscale, settings.gap, settings.crop, settings.cropTightness]);
  const spreadKey = visiblePages.join("-");
  useLayoutEffect(() => { if (paged) jump(currentRef.current); }, [paged, spreadKey, jump]);
  useLayoutEffect(() => {
    if (paged) return;
    const root = scrollRef.current;
    const anchor = scrollAnchor.current;
    const target = pageRefs.current.get(anchor.page);
    if (root && target) {
      // Background pages can replace estimated heights above the reader.
      // Preserve the position within the page, rather than jumping as they arrive.
      const unhandledScroll = root.scrollTop - lastScroll.current;
      root.scrollTop = target.offsetTop + anchor.offset + unhandledScroll;
      scrollAnchor.current = { page: anchor.page, offset: root.scrollTop - target.offsetTop };
      lastScroll.current = root.scrollTop;
    }
  }, [pages, paged]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    let frame = 0;
    const scroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const delta = root.scrollTop - lastScroll.current;
        if (Math.abs(delta) > 3) callbacks.current.onScrollDirection(delta > 0 ? 1 : -1);
        lastScroll.current = root.scrollTop;
        if (paged) return;
        // A viewport probe works for both very tall strips and short pages.
        const probe = root.scrollTop + root.clientHeight * .35;
        let page = 1;
        for (const [number, element] of pageRefs.current) {
          if (element.offsetTop <= probe) page = number;
          else break;
        }
        const target = pageRefs.current.get(page);
        if (target) scrollAnchor.current = { page, offset: root.scrollTop - target.offsetTop };
        callbacks.current.onPage(page);
        if (delta > 3 && root.scrollTop + root.clientHeight >= root.scrollHeight - 2 && !callbacks.current.panelOpen) callbacks.current.onEnd();
      });
    };
    root.addEventListener("scroll", scroll, { passive: true });
    return () => { root.removeEventListener("scroll", scroll); cancelAnimationFrame(frame); };
  }, [paged]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    let lastTurn = 0, accumulated = 0;
    const wheel = (event: WheelEvent) => {
      if (callbacks.current.panelOpen || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if (paged && settings.wheel === "turn") {
        event.preventDefault();
        if (performance.now() - lastTurn < 320) return;
        accumulated += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
        if (Math.abs(accumulated) < 35) return;
        callbacks.current.onTurn(accumulated > 0 ? 1 : -1);
        accumulated = 0;
        lastTurn = performance.now();
      } else if (!paged && event.deltaY > 0 && root.scrollTop + root.clientHeight >= root.scrollHeight - 2) {
        callbacks.current.onEnd();
      }
    };
    root.addEventListener("wheel", wheel, { passive: false });
    return () => root.removeEventListener("wheel", wheel);
  }, [paged, settings.wheel]);

  useEffect(() => {
    if (!autoRunning || paged || panelOpen) return;
    const root = scrollRef.current;
    if (!root) return;
    let frame = 0, previous = 0, residual = 0;
    const tick = (time: number) => {
      if (previous && document.visibilityState === "visible") {
        residual += Math.min(64, time - previous) / 1000 * settings.autoScroll * 45;
        if (residual >= 1) { const pixels = Math.floor(residual); root.scrollTop += pixels; residual -= pixels; }
        if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) callbacks.current.onEnd();
      }
      previous = time;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [autoRunning, paged, panelOpen, settings.autoScroll]);

  const pointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    pointerStart.current = { x: event.clientX, y: event.clientY, time: performance.now(), scroll: scrollRef.current?.scrollTop ?? 0 };
  };
  const pointerUp = (event: PointerEvent) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || Math.abs(start.x - event.clientX) + Math.abs(start.y - event.clientY) > 12 || Math.abs(start.scroll - (scrollRef.current?.scrollTop ?? 0)) > 12 || performance.now() - start.time > 650 || window.getSelection()?.toString()) return;
    const rect = scrollRef.current!.getBoundingClientRect();
    onTap((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  };
  const indices = paged ? (settings.direction === "rtl" ? [...visiblePages].reverse() : visiblePages) : pages.map((_, index) => index + 1);
  const pageRatio = (page: ReaderPage) => {
    const size = croppedPageSize(page, readerCropBounds(page, settings.crop, settings.cropTightness));
    return size.width / size.height;
  };
  const ratios = visiblePages.reduce((sum, number) => sum + pageRatio(pages[number - 1]), 0);
  const spreadPending = paged && visiblePages.some(number => pages[number - 1].status === "pending");
  return <div ref={scrollRef} role="region" aria-label="Comic pages" tabIndex={0} onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={() => { pointerStart.current = null; }} className={`${styles.viewport} absolute inset-0 overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-ring`} style={{ overflowAnchor: "none", backgroundColor: { black: "#09090a", grey: "#3a3a3f", white: "#f4f3ef" }[settings.background] }}>
    <div key={paged ? spreadKey : "webtoon"} className={`${paged ? `flex w-max min-w-full items-start justify-center px-0 py-4 ${styles.page} ${styles[settings.transition] ?? ""}` : "relative flex w-max min-w-full flex-col items-center"}`} style={{ paddingLeft: paged && !phone ? 72 : 0, paddingRight: paged && !phone ? 72 : 0, gap: paged ? settings.spineGap : settings.gap ? 12 : 0, "--reader-slide": `${turnDirection * (settings.direction === "rtl" ? -1 : 1) * 24}px` } as CSSProperties}>
      {indices.map(number => {
        const page = pages[number - 1];
        const pageWidth = paged ? (availableWidth - settings.spineGap * (visiblePages.length - 1)) * pageRatio(page) / ratios : Math.min(stageWidth, settings.maxWidth);
        const placeholderWidth = readerPageWidth(page, settings.fit, pageWidth, availableHeight, settings.zoom, settings.noUpscale);
        return <div key={page.name} data-reader-page={number} ref={element => { if (element) pageRefs.current.set(number, element); else pageRefs.current.delete(number); }} className="relative shrink-0">
          {page.status || spreadPending ? <div aria-label={`Page ${number}`} aria-busy={page.status === "pending" || spreadPending}
            className="flex items-center justify-center bg-background/60 text-sm text-muted-foreground" style={{ width: placeholderWidth, height: placeholderWidth * page.height / page.width }}>
            {page.status === "error" ? "This page could not be read." : "Preparing page…"}
          </div> : <PageImage page={page} number={number} settings={settings} availableWidth={pageWidth} availableHeight={availableHeight} eager={paged || Math.abs(number - currentPage) < 3} />}
        </div>;
      })}
    </div>
  </div>;
});
export default ComicView;
