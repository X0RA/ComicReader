"use client";

import { useEffect, useState } from "react";
import JSZip from "jszip";
import { withArchive, getComicDownloadStatus, preloadComic } from "@/lib/downloads";
import { maintainArchives } from "@/lib/archiveMaintenance";
import { db } from "@/lib/dexieDB";
import { findReaderChapter, type ReaderChapter } from "@/lib/reader-catalog";
import { archiveImageNames, type ReaderPage } from "@/lib/reader-pages";
import { prepareReaderPage } from "@/lib/reader-image";

interface ComicState {
  id: string;
  chapter?: ReaderChapter;
  pages: ReaderPage[];
  initialPage: number;
  loading: boolean;
  progress: number;
  phase: string;
  error?: string;
  warning?: string;
}

export function useComic(id: string, retry: number) {
  const [state, setState] = useState<ComicState>({ id, pages: [], initialPage: 1, loading: true, progress: 0, phase: "Opening comic…" });
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void maintainArchives().catch(console.warn);
    let tracker: ReturnType<typeof setInterval> | undefined;
    const urls: string[] = [];
    const update = (patch: Partial<ComicState>) => { if (!cancelled) setState(current => ({ ...current, ...patch })); };
    setState({ id, pages: [], initialPage: 1, loading: true, progress: 0, phase: "Opening comic…" });
    async function load() {
      try {
        const catalog = await db.getComicsData() ?? await db.updateFromRemoteDB();
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
        const { usable, skipped } = await withArchive({ id, url: chapter.comic.link, name: chapter.comic.name }, async blob => {
          clearInterval(tracker);
          if (cancelled) return { usable: [], skipped: 0 };
          update({ phase: "Preparing pages…", progress: 0 });
          const zip = await JSZip.loadAsync(blob);
          const names = archiveImageNames(Object.keys(zip.files)).filter(name => !zip.files[name].dir);
          if (!names.length) throw new Error("No supported page images were found in this archive.");
          const pages: (ReaderPage | undefined)[] = new Array(names.length);
          let cursor = 0, completed = 0, skipped = 0;
          // Bound concurrent decode work; release each decoded Image immediately.
          await Promise.all(Array.from({ length: Math.min(3, names.length) }, async () => {
            while (cursor < names.length && !cancelled) {
              const index = cursor++;
              let url: string | undefined;
              try {
                const content = await zip.files[names[index]].async("blob");
                if (cancelled) return;
                url = URL.createObjectURL(content);
                urls.push(url);
                const page = await prepareReaderPage(url, names[index]);
                if (cancelled) return;
                pages[index] = page;
              } catch { if (url) URL.revokeObjectURL(url); skipped++; }
              completed++;
              update({ progress: completed / names.length * 100 });
            }
          }));
          if (cancelled) return { usable: [], skipped: 0 };
          const usable = pages.filter((page): page is ReaderPage => !!page);
          if (!usable.length) throw new Error("The archive's page images could not be decoded.");
          return { usable, skipped };
        }, controller.signal);
        if (cancelled) return;
        await db.setLastReadComic(id);
        if (cancelled) return;
        update({ pages: usable, initialPage: Math.max(1, Math.min(usable.length, saved?.lastPage || 1)), loading: false,
          warning: skipped ? `${skipped} unreadable ${skipped === 1 ? "image was" : "images were"} skipped.` : undefined });
        // Same real remote/cache path as an explicit open. A failed preload is nonfatal.
        if (chapter.next) preloadComic({ id: chapter.next.id, url: chapter.next.link, name: chapter.next.name });
      } catch (error) {
        update({ loading: false, error: error instanceof Error ? error.message : "Unable to open this comic." });
      } finally { clearInterval(tracker); }
    }
    void load();
    return () => { cancelled = true; controller.abort(); clearInterval(tracker); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [id, retry]);
  // Do not render previous chapter URLs during the render before the effect resets.
  return state.id === id ? state : { id, pages: [], initialPage: 1, loading: true, progress: 0, phase: "Opening comic…" } satisfies ComicState;
}
