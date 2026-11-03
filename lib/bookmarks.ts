import { db, type ComicBookmark } from "./dexieDB";

export function bookmarkUrl(bookmark: Pick<ComicBookmark, "comicId" | "page">): string {
  return `/read/${encodeURIComponent(bookmark.comicId)}?page=${bookmark.page}`;
}

export async function saveBookmark(bookmark: Pick<ComicBookmark, "comicId" | "comicName" | "page" | "note">): Promise<void> {
  if (!Number.isSafeInteger(bookmark.page) || bookmark.page < 1) throw new Error("Choose a valid page.");
  await db.transaction("rw", db.bookmarks, async () => {
    const previous = await db.bookmarks.get([bookmark.comicId, bookmark.page]);
    const now = Date.now();
    await db.bookmarks.put({ ...bookmark, note: bookmark.note.trim().slice(0, 2000), createdAt: previous?.createdAt ?? now, updatedAt: now });
  });
}

export function removeBookmark(bookmark: Pick<ComicBookmark, "comicId" | "page">): Promise<void> {
  return db.bookmarks.delete([bookmark.comicId, bookmark.page]);
}
