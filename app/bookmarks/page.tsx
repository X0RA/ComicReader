"use client";

import Link from "next/link";
import { Bookmark, BookOpen, ChevronRight } from "lucide-react";
import { useState } from "react";
import { ThemeSwitcher } from "@/components/theme-controls";
import BookmarkList from "@/components/bookmark-list";
import BookmarkEditor from "@/components/bookmark-editor";
import { useBookmarks } from "@/lib/use-bookmarks";
import type { ComicBookmark } from "@/lib/dexieDB";

export default function BookmarksPage() {
  const { bookmarks, loading, error } = useBookmarks();
  const [editing, setEditing] = useState<ComicBookmark>();
  const groups = new Map<string, ComicBookmark[]>();
  for (const bookmark of bookmarks) {
    const group = groups.get(bookmark.comicId) ?? [];
    group.push(bookmark); groups.set(bookmark.comicId, group);
  }
  const comics = [...groups.values()].sort((a, b) => Math.max(...b.map(item => item.updatedAt)) - Math.max(...a.map(item => item.updatedAt)));
  return <main className="mx-auto flex min-h-dvh w-full max-w-[880px] flex-col gap-8 px-5 pt-7 pb-16 sm:px-6">
    <header className="flex items-center justify-between gap-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm font-medium">
        <Link href="/" aria-label="Library" className="-ml-2 flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"><BookOpen size={18} /></Link>
        <ChevronRight size={12} className="text-muted-foreground" /><span aria-current="page">Bookmarks</span>
      </nav><ThemeSwitcher />
    </header>
    <section aria-labelledby="bookmarks-title">
      <h1 id="bookmarks-title" className="text-[32px] font-semibold tracking-tight">Bookmarks</h1>
      <p className="mt-1 text-sm text-muted-foreground">{loading ? "Loading bookmarks…" : `${bookmarks.length} saved ${bookmarks.length === 1 ? "page" : "pages"} across ${comics.length} ${comics.length === 1 ? "comic" : "comics"}`}</p>
      {error && <p role="alert" className="mt-5 text-sm text-destructive">{error}</p>}
      {!loading && !error && !bookmarks.length && <div className="mt-8 rounded-2xl border bg-card px-5 py-12 text-center">
        <Bookmark className="mx-auto mb-4 text-muted-foreground" size={28} /><h2 className="font-medium">Keep a page worth returning to</h2>
        <p className="mt-2 text-sm text-muted-foreground">Use the bookmark button while reading. Add a note if you like.</p>
        <Link href="/" className="mt-4 inline-flex min-h-11 items-center text-sm text-primary hover:underline">Browse library</Link>
      </div>}
      <div className="mt-7 space-y-5">{comics.map(group => <section key={group[0].comicId} aria-label={group[0].comicName} className="rounded-2xl border bg-card px-5 py-3">
        <h2 className="border-b py-3 text-base font-medium">{group[0].comicName}</h2>
        <BookmarkList bookmarks={group} onEdit={setEditing} />
      </section>)}</div>
    </section>
    {editing && <BookmarkEditor key={`${editing.comicId}:${editing.page}`} bookmark={editing} onClose={() => setEditing(undefined)} />}
  </main>;
}
