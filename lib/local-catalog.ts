import { db } from "./dexieDB";
import { isOfflineReading } from "./offline";
import type { ContentItem, File } from "./types";
/** Download metadata is enough to read an archive even if its catalog entry disappeared. */
export async function localCatalog(): Promise<ContentItem[] | undefined> {
  const [catalog, downloads, progress] = await Promise.all([db.getComicsData(), db.downloads.where("status").equals("completed").toArray(), db.getReadComics()]);
  if (!catalog && !downloads.length) return undefined;
  const result = catalog ?? [], found = new Set<string>(), byId = new Map(downloads.map(row => [row.id, row]));
  const visit = (items: ContentItem[]) => items.forEach(item => {
    if (item.type === "folder") visit(item.children);
    else { found.add(item.id); const saved = byId.get(item.id); if (saved && isOfflineReading()) item.link = saved.url; }
  });
  visit(result);
  const states = new Map(progress.map(row => [row.id, row]));
  for (const row of downloads) if (!found.has(row.id)) {
    const state = states.get(row.id);
    result.push({ id: row.id, name: row.name || `${row.id}.cbz`, type: "file", size: row.fileSize || 0, extension: "cbz", link: row.url,
      readStatus: state?.status || "unread", lastPage: state?.lastPage || 0, totalPages: state?.totalPages || 0 } satisfies File);
  }
  return result;
}
