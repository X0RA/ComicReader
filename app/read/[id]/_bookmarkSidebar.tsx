"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import BookmarkList from "@/components/bookmark-list";
import type { ComicBookmark } from "@/lib/dexieDB";

export default function BookmarkSidebar({ bookmarks, loading, error, onClose, onEdit, onOpen }: {
  bookmarks: ComicBookmark[]; loading: boolean; error?: string; onClose: () => void;
  onEdit: (bookmark: ComicBookmark) => void; onOpen: (page: number) => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <aside aria-label="Comic bookmarks" onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") onClose(); }}
    className="fixed top-[60px] right-0 bottom-0 z-40 flex w-[min(360px,100vw)] flex-col border-l bg-card text-card-foreground shadow-2xl">
    <div className="flex items-center justify-between border-b px-5 py-2"><h2 className="text-sm font-semibold">Comic bookmarks</h2>
      <button ref={close} type="button" aria-label="Close bookmarks sidebar" onClick={onClose} className="flex size-11 items-center justify-center rounded-lg hover:bg-secondary"><X size={18} /></button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3">
      {loading ? <p role="status" className="py-5 text-sm text-muted-foreground">Loading bookmarks…</p> : error ? <p role="alert" className="py-5 text-sm text-destructive">{error}</p>
        : bookmarks.length ? <BookmarkList bookmarks={bookmarks} onEdit={onEdit} onOpen={onOpen} />
        : <p className="py-5 text-sm leading-relaxed text-muted-foreground">No bookmarks in this comic yet. Use the bookmark button above to save a page.</p>}
    </div>
    <Link href="/bookmarks" className="flex min-h-14 items-center border-t px-5 text-sm text-primary hover:bg-secondary">All bookmarks</Link>
  </aside>;
}
