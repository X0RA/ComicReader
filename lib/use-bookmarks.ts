"use client";

import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { db, type ComicBookmark } from "./dexieDB";

export function useBookmarks(comicId?: string) {
  const [state, setState] = useState<{ bookmarks: ComicBookmark[]; loading: boolean; error?: string }>({ bookmarks: [], loading: true });
  useEffect(() => {
    setState({ bookmarks: [], loading: true });
    const subscription = liveQuery(() => comicId === undefined ? db.bookmarks.toArray() : db.bookmarks.where("comicId").equals(comicId).toArray()).subscribe({
      next: bookmarks => setState({ bookmarks: bookmarks.sort((a, b) => a.page - b.page), loading: false }),
      error: () => setState({ bookmarks: [], loading: false, error: "Bookmarks could not be loaded from browser storage." }),
    });
    return () => subscription.unsubscribe();
  }, [comicId]);
  return state;
}
