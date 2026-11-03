"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { croppedPageSize, readerCropBounds, readerPageWidth, type ReaderPage } from "@/lib/reader-pages";
import type { ReaderSettings } from "@/lib/reader-settings";
import styles from "./reader.module.css";

function PageImage({ page, number, settings, availableWidth, availableHeight, eager, magnification, enhanced }: {
  page: ReaderPage; number: number; settings: ReaderSettings; availableWidth: number; availableHeight: number; eager: boolean; magnification: number; enhanced?: string;
}) {
  const [failed, setFailed] = useState<string>();
  const source = enhanced && enhanced !== failed ? enhanced : page.url;
  const bounds = readerCropBounds(page, settings.crop, settings.cropTightness, settings.cropExtraHorizontal, settings.cropExtraVertical);
  const { width: croppedWidth, height: croppedHeight } = croppedPageSize(page, bounds);
  const width = readerPageWidth({ width: croppedWidth, height: croppedHeight }, settings.fit, availableWidth, availableHeight, settings.zoom, settings.noUpscale) * magnification;
  const height = width * croppedHeight / croppedWidth;
  const scale = width / croppedWidth;
  return <div className={`relative shrink-0 overflow-hidden ${settings.shadow ? "shadow-2xl" : ""}`} style={{ width, height }}>
    {/* Local object URLs are decoded from the actual cached archive. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={source} data-upscaled={source !== page.url || undefined} onError={() => { if (enhanced) setFailed(enhanced); }} alt={`Page ${number}`} draggable={false} loading={eager ? "eager" : "lazy"} decoding="async"
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
  enhanced?: ReadonlyMap<number, string>;
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

const ComicView = forwardRef<ComicViewHandle, Props>(function ComicView({ pages, enhanced, settings, layout, visiblePages, currentPage, width, height, phone, panelOpen, turnDirection, onPage, onScrollDirection, onTap, onTurn, onEnd, autoRunning }, forwardedRef) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const [stageWidth, setStageWidth] = useState(width);
  const [camera, setCamera] = useState({ scale: 1, active: false });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const zoomAnchor = useRef<{ page: number; x: number; y: number; clientX: number; clientY: number } | undefined>(undefined);
  const resetPosition = useRef(false);
  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const measure = () => setStageWidth(root.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  const pointerStart = useRef<{ x: number; y: number; time: number; scroll: number; left: number } | null>(null);
  const lastScroll = useRef(0);
  const scrollAnchor = useRef({ page: currentPage, offset: 0 });
  const currentRef = useRef(currentPage);
  currentRef.current = currentPage;
  const callbacks = useRef({ onPage, onScrollDirection, onTurn, onEnd, panelOpen });
  callbacks.current = { onPage, onScrollDirection, onTurn, onEnd, panelOpen };
  const paged = layout !== "webtoon";
  const availableWidth = Math.max(1, stageWidth - (phone ? 0 : paged ? 144 : 32));
  const availableHeight = Math.max(120, height - 60 - (phone ? 16 : 32));
  const magnification = phone ? 1 : camera.scale;
  const zoomed = !phone && camera.active;
  const resetZoom = useCallback(() => {
    zoomAnchor.current = undefined;
    resetPosition.current = true;
    cameraRef.current = { scale: 1, active: false };
    setCamera(cameraRef.current);
  }, []);
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

  useLayoutEffect(() => { jump(currentRef.current); }, [jump, stageWidth, height, settings.maxWidth, settings.fit, settings.zoom, settings.noUpscale, settings.gap, settings.crop, settings.cropTightness, settings.cropExtraHorizontal, settings.cropExtraVertical]);
  const spreadKey = visiblePages.join("-");
  useLayoutEffect(() => { if (paged) jump(currentRef.current); }, [paged, spreadKey, jump]);
  useLayoutEffect(() => { if (cameraRef.current.active) resetZoom(); }, [paged, paged ? spreadKey : "webtoon", phone, stageWidth, height, settings.fit, settings.zoom, settings.noUpscale, settings.crop, settings.cropTightness, settings.cropExtraHorizontal, settings.cropExtraVertical, resetZoom]);
  useLayoutEffect(() => {
    if (resetPosition.current) {
      resetPosition.current = false;
      jump(currentRef.current);
      return;
    }
    const anchor = zoomAnchor.current;
    const root = scrollRef.current;
    const target = anchor && pageRefs.current.get(anchor.page);
    if (!anchor || !root || !target) return;
    const rect = target.getBoundingClientRect();
    root.scrollLeft += rect.left + rect.width * anchor.x - anchor.clientX;
    root.scrollTop += rect.top + rect.height * anchor.y - anchor.clientY;
    lastScroll.current = root.scrollTop;
    scrollAnchor.current = { page: anchor.page, offset: root.scrollTop - target.offsetTop };
    zoomAnchor.current = undefined;
  }, [camera, jump]);
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
      if (!phone) {
        if (!event.deltaY) return;
        const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-reader-page]") : null;
        const number = element ? Number(element.dataset.readerPage) : currentRef.current;
        const target = pageRefs.current.get(number);
        if (!target || target.querySelector('[aria-busy="true"]')) return;
        event.preventDefault();
        const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? root.clientHeight : 1);
        const scale = Math.max(.5, Math.min(5, cameraRef.current.scale * Math.exp(-Math.max(-200, Math.min(200, delta)) * .002)));
        if (scale === cameraRef.current.scale) return;
        const rect = target.getBoundingClientRect();
        zoomAnchor.current = { page: number, x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height, clientX: event.clientX, clientY: event.clientY };
        cameraRef.current = { scale, active: true };
        setCamera(cameraRef.current);
        return;
      }
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
  }, [paged, settings.wheel, phone]);

  useEffect(() => {
    if (!autoRunning || paged || panelOpen || zoomed) return;
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
  }, [autoRunning, paged, panelOpen, settings.autoScroll, zoomed]);

  const pointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    pointerStart.current = { x: event.clientX, y: event.clientY, time: performance.now(), scroll: scrollRef.current?.scrollTop ?? 0, left: scrollRef.current?.scrollLeft ?? 0 };
    if (zoomed) event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent) => {
    const start = pointerStart.current, root = scrollRef.current;
    if (!zoomed || !start || !root || !event.buttons) return;
    root.scrollLeft = start.left + start.x - event.clientX;
    root.scrollTop = start.scroll + start.y - event.clientY;
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
    const size = croppedPageSize(page, readerCropBounds(page, settings.crop, settings.cropTightness, settings.cropExtraHorizontal, settings.cropExtraVertical));
    return size.width / size.height;
  };
  const ratios = visiblePages.reduce((sum, number) => sum + pageRatio(pages[number - 1]), 0);
  const spreadPending = paged && visiblePages.some(number => pages[number - 1].status === "pending");
  return <><div ref={scrollRef} role="region" aria-label="Comic pages" tabIndex={0} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { pointerStart.current = null; }} className={`${styles.viewport} absolute inset-0 overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-ring`} style={{ overflowAnchor: "none", cursor: zoomed ? "grab" : undefined, backgroundColor: { black: "#09090a", grey: "#3a3a3f", white: "#f4f3ef" }[settings.background] }}>
    <div key={paged ? spreadKey : "webtoon"} className={`${paged ? `flex w-max min-w-full items-start justify-center px-0 py-4 ${styles.page} ${styles[settings.transition] ?? ""}` : "relative flex w-max min-w-full flex-col items-center"}`} style={{ paddingLeft: zoomed ? stageWidth : paged && !phone ? 72 : 0, paddingRight: zoomed ? stageWidth : paged && !phone ? 72 : 0, paddingTop: zoomed ? height : undefined, paddingBottom: zoomed ? height : undefined, gap: paged ? settings.spineGap : settings.gap ? 12 : 0, "--reader-slide": `${turnDirection * (settings.direction === "rtl" ? -1 : 1) * 24}px` } as CSSProperties}>
      {indices.map(number => {
        const page = pages[number - 1];
        const pageWidth = paged ? (availableWidth - settings.spineGap * (visiblePages.length - 1)) * pageRatio(page) / ratios : Math.min(stageWidth, settings.maxWidth);
        const placeholderWidth = readerPageWidth(page, settings.fit, pageWidth, availableHeight, settings.zoom, settings.noUpscale) * magnification;
        return <div key={page.name} data-reader-page={number} ref={element => { if (element) pageRefs.current.set(number, element); else pageRefs.current.delete(number); }} className="relative shrink-0">
          {page.status || spreadPending ? <div aria-label={`Page ${number}`} aria-busy={page.status === "pending" || spreadPending}
            className="flex items-center justify-center bg-background/60 text-sm text-muted-foreground" style={{ width: placeholderWidth, height: placeholderWidth * page.height / page.width }}>
            {page.status === "error" ? "This page could not be read." : "Preparing page…"}
          </div> : <PageImage enhanced={enhanced?.get(number)} page={page} number={number} settings={settings} availableWidth={pageWidth} availableHeight={availableHeight} eager={paged || Math.abs(number - currentPage) < 3} magnification={magnification} />}
        </div>;
      })}
    </div>
  </div>
    {zoomed && !panelOpen && <button type="button" onClick={resetZoom} className="fixed top-[72px] right-4 z-20 min-h-11 rounded-xl border bg-card/95 px-3 text-xs text-card-foreground shadow-lg hover:bg-secondary">Reset zoom · {Math.round(camera.scale * 100)}%</button>}
  </>;
});
export default ComicView;
