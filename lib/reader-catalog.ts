import type { ContentItem, File } from "./types";

export interface ReaderChapter { comic: File; previous?: File; next?: File; folderId: string }

/** Chapter navigation stays in the current folder and follows natural filename order. */
export function findReaderChapter(items: ContentItem[], id: string, folderId = "0"): ReaderChapter | undefined {
  const files = items.filter((item): item is File => item.type === "file" && /(?:^|\.)(?:cbz|zip)$/i.test(item.extension || item.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }));
  const index = files.findIndex(file => file.id === id);
  if (index >= 0) return { comic: files[index], previous: files[index - 1], next: files[index + 1], folderId };
  for (const item of items) {
    if (item.type === "folder") {
      const found = findReaderChapter(item.children, id, item.id);
      if (found) return found;
    }
  }
}
