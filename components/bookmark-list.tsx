"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { bookmarkUrl, removeBookmark } from "@/lib/bookmarks";
import type { ComicBookmark } from "@/lib/dexieDB";

export default function BookmarkList({ bookmarks, onEdit, onOpen }: {
  bookmarks: ComicBookmark[]; onEdit: (bookmark: ComicBookmark) => void; onOpen?: (page: number) => void;
}) {
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<number | undefined>();
  return <>
    {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
    <ul className="divide-y" aria-label="Bookmarked pages">
      {bookmarks.map(bookmark => <li key={`${bookmark.comicId}:${bookmark.page}`} className="py-3">
        <div className="flex items-center gap-2">
          {onOpen ? <button type="button" onClick={() => onOpen(bookmark.page)} className="min-h-11 flex-1 rounded-lg text-left text-sm font-medium text-primary hover:underline">Page {bookmark.page}</button>
            : <Link href={bookmarkUrl(bookmark)} prefetch={false} className="flex min-h-11 flex-1 items-center rounded-lg text-sm font-medium text-primary hover:underline">Page {bookmark.page}</Link>}
          <button type="button" aria-label={`Edit bookmark on page ${bookmark.page}`} onClick={() => onEdit(bookmark)} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"><Pencil size={16} /></button>
          <button type="button" aria-label={`Remove bookmark on page ${bookmark.page}`} disabled={removing !== undefined} onClick={async () => {
            setRemoving(bookmark.page); setError("");
            try { await removeBookmark(bookmark); } catch { setError("The bookmark could not be removed. Please try again."); }
            finally { setRemoving(undefined); }
          }} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"><Trash2 size={16} /></button>
        </div>
        {bookmark.note && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{bookmark.note}</p>}
      </li>)}
    </ul>
  </>;
}
