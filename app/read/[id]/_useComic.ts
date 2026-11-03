"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { localCatalog } from "@/lib/local-catalog";
import { isOfflineReading } from "@/lib/offline";
import JSZip from "jszip";
import { withArchive, getComicDownloadStatus, preloadComic } from "@/lib/downloads";
import { maintainArchives } from "@/lib/archiveMaintenance";
import { db } from "@/lib/dexieDB";
import { findReaderChapter, type ReaderChapter } from "@/lib/reader-catalog";
import { archiveImageNames, FULL_PAGE, type ReaderPage } from "@/lib/reader-pages";
import { prepareReaderPage } from "@/lib/reader-image";
import { prepareReaderPages } from "@/lib/reader-preparation";

interface ComicState {
  id: string;
  requestedPage?: number;
  chapter?: ReaderChapter;
  pages: ReaderPage[];
  initialPage: number;
  prepared: number;
  preparing: boolean;
  loading: boolean;
  progress: number;
  phase: string;
  error?: string;
  warning?: string;
}

export function useComic(id: string, retry: number, requestedPage?: number) {
  const [state, setState] = useState<ComicState>({ id, requestedPage, pages: [], initialPage: 1, prepared: 0, preparing: false, loading: true, progress: 0, phase: "Opening comic…" });
  const priority = useRef(1);
  const prioritize = useCallback((page: number) => { priority.current = page; }, []);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void maintainArchives().catch(console.warn);
    let tracker: ReturnType<typeof setInterval> | undefined;
    const urls = new Set<string>();
    const update = (patch: Partial<ComicState>) => { if (!cancelled) setState(current => ({ ...current, ...patch })); };
    setState({ id, requestedPage, pages: [], initialPage: 1, prepared: 0, preparing: false, loading: true, progress: 0, phase: "Opening comic…" });
    async function load() {
      try {
        const catalog = await localCatalog() ?? (isOfflineReading() ? [] : await db.updateFromRemoteDB());
        if (cancelled) return;
        const chapter = findReaderChapter(catalog, id);
        if (!chapter) throw new Error("This comic is not in the library. Return to the library to refresh the catalog.");
        update({ chapter });
        const saved = await db.getComicStatus(id);
        update({ phase: "Downloading for offline reading…" });
        tracker = setInterval(() => {
          void getComicDownloadStatus(id).then(status => {
            if (status?.status === "in_progress") update({ progress: status.progress });
          }).catch(() => {});
        }, 350);
        await withArchive({ id, url: chapter.comic.link, name: chapter.comic.name }, async blob => {
          clearInterval(tracker);
          if (cancelled) return;
          update({ phase: "Preparing nearby pages…", progress: 0 });
          const zip = await JSZip.loadAsync(blob);
          if (cancelled) return;
          const names = archiveImageNames(Object.keys(zip.files)).filter(name => !zip.files[name].dir);
          if (!names.length) throw new Error("No supported page images were found in this archive.");
          const initialPage = Math.max(1, Math.min(names.length, requestedPage ?? (saved?.lastPage || 1)));
          priority.current = initialPage;
          const pages: ReaderPage[] = names.map(name => ({ name, url: "", width: 600, height: 900, crop: FULL_PAGE, tightCrop: FULL_PAGE, status: "pending" }));
          let completed = 0, failed = 0, readable = 0, lastPrepared = 0, lastPublished = 0;
          const publish = () => {
            lastPublished = performance.now();
            update({ pages: [...pages], prepared: completed, preparing: completed < names.length,
              warning: failed ? `${failed} ${failed === 1 ? "page could" : "pages could"} not be read. You can continue past ${failed === 1 ? "it" : "them"}.` : undefined });
          };
          await prepareReaderPages({
            total: names.length, initialPage, currentPage: () => priority.current, signal: controller.signal,
            prepare: async number => {
              const index = number - 1;
              lastPrepared = number;
              let url: string | undefined;
              try {
                const content = await zip.files[names[index]].async("blob");
                if (cancelled) return;
                url = URL.createObjectURL(content);
                urls.add(url);
                const page = await prepareReaderPage(url, names[index]);
                if (cancelled) return;
                pages[index] = page;
                readable++;
              } catch {
                if (url) { URL.revokeObjectURL(url); urls.delete(url); }
                if (cancelled) return;
                pages[index] = { ...pages[index], status: "error" };
                failed++;
              }
            },
            progress: (count, openingTotal, background) => {
              completed = count;
              if (background) {
                // Publish nearby pages immediately, but batch distant changes so
                // long scrolling chapters do not re-render for every decoded page.
                if (completed === names.length || Math.abs(lastPrepared - priority.current) <= 2 || performance.now() - lastPublished >= 100) publish();
              }
              else update({ progress: completed / openingTotal * 100 });
            },
            opened: async () => {
              if (cancelled) return;
              // Approximate unknown page heights from nearby portraits, without
              // extracting the rest of the archive just to measure them.
              const sample = pages.find(page => !page.status && page.width <= page.height);
              if (sample) for (let index = 0; index < pages.length; index++) {
                if (pages[index].status) pages[index] = { ...pages[index], width: sample.width, height: sample.height };
              }
              await db.setLastReadComic(id);
              if (cancelled) return;
              publish();
              update({ initialPage, loading: false });
            },
          });
          if (!readable) throw new Error("The archive's page images could not be decoded.");
        }, controller.signal);
        if (cancelled) return;
        // Same real remote/cache path as an explicit open. A failed preload is nonfatal.
        if (chapter.next) preloadComic({ id: chapter.next.id, url: chapter.next.link, name: chapter.next.name });
      } catch (error) {
        update({ loading: false, preparing: false, error: error instanceof Error ? error.message : "Unable to open this comic." });
      } finally { clearInterval(tracker); }
    }
    void load();
    return () => { cancelled = true; controller.abort(); clearInterval(tracker); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [id, retry, requestedPage]);
  // Do not render previous chapter URLs during the render before the effect resets.
  return { ...(state.id === id && state.requestedPage === requestedPage ? state : { id, requestedPage, pages: [], initialPage: 1, prepared: 0, preparing: false, loading: true, progress: 0, phase: "Opening comic…" } satisfies ComicState), prioritize };
}
