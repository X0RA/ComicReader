import type { ContentItem } from "./types";

export const SOURCES_KEY = "comic-reader-sources";
export const SOURCES_CHANGED = "comic-reader-sources-changed";
export const DEFAULT_SOURCE_ID = "default";

export interface CatalogSource { id: string; name: string; url: string }

export const DEFAULT_SOURCE: CatalogSource = { id: DEFAULT_SOURCE_ID, name: "comic.xora.space", url: "https://comic.xora.space/contents.json" };

/** The built-in source always comes first and cannot be removed; extra sources are saved on this device. */
export function getSources(): CatalogSource[] {
  const extra: CatalogSource[] = [];
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(SOURCES_KEY) ?? "[]");
    if (Array.isArray(saved)) for (const row of saved) {
      if (row && typeof row.id === "string" && typeof row.name === "string" && typeof row.url === "string"
        && row.id !== DEFAULT_SOURCE_ID && !extra.some(source => source.id === row.id)) extra.push({ id: row.id, name: row.name, url: row.url });
    }
  } catch { /* Corrupt or unavailable storage falls back to the built-in source. */ }
  return [DEFAULT_SOURCE, ...extra];
}

export function saveSources(sources: CatalogSource[]) {
  localStorage.setItem(SOURCES_KEY, JSON.stringify(sources.filter(source => source.id !== DEFAULT_SOURCE_ID)));
  window.dispatchEvent(new Event(SOURCES_CHANGED));
}

export function normalizeSourceUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error("Enter a full URL, like https://example.com/contents.json."); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http and https URLs are supported.");
  return url.href;
}

/** Accepts a plain item array, a root folder with children, or a { content: [...] } wrapper. */
export function parseCatalog(raw: unknown): ContentItem[] {
  const root = raw as { type?: unknown; children?: unknown; content?: unknown } | null;
  const items = Array.isArray(raw) ? raw : root?.type === "folder" ? root.children : root?.content;
  const ids = new Set<string>();
  function validate(value: unknown): asserts value is ContentItem[] {
    if (!Array.isArray(value)) throw new Error("This doesn't look like a comic catalog.");
    for (const item of value) {
      if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id.trim() || [".", ".."].includes(item.id)
        || typeof item.name !== "string" || !item.name.trim() || ids.has(item.id)) {
        throw new Error("Every catalog entry needs a unique string ID and a name.");
      }
      ids.add(item.id);
      if (item.type === "folder") validate(item.children);
      else if (item.type !== "file" || typeof item.link !== "string" || !item.link.trim()
        || typeof item.extension !== "string" || !item.extension.trim()) {
        throw new Error("Every comic needs a file type, link, and extension.");
      } else if (item.size !== undefined && (!Number.isSafeInteger(item.size) || item.size < 0)) {
        throw new Error("Comic sizes must be nonnegative whole bytes.");
      }
    }
  }
  validate(items);
  return items;
}

export async function fetchCatalog(source: CatalogSource, timeoutMs = 15000): Promise<ContentItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Revalidate via ETag so edits show up immediately. The deadline covers the body too.
    const response = await fetch(source.url, { cache: "no-cache", signal: controller.signal });
    if (!response.ok) throw new Error(`The catalog returned HTTP ${response.status}.`);
    let raw: unknown;
    try { raw = await response.json(); } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new Error("The catalog isn't valid JSON.");
    }
    return resolveLinks(parseCatalog(raw), response.url || source.url);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("The catalog took too long to respond. Please try again.");
    throw error;
  } finally { clearTimeout(timeout); }
}

function resolveLinks(items: ContentItem[], base: string): ContentItem[] {
  for (const item of items) {
    if (item.type === "folder") resolveLinks(item.children, base);
    else {
      const url = new URL(item.link, base);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Comic links must use http or https.");
      item.link = url.href;
    }
  }
  return items;
}

/** Hide removed sources even when a stale refresh or an offline cache still contains them. */
export function filterActiveSources(items: ContentItem[], sources = getSources()): ContentItem[] {
  const active = new Set(sources.map(source => `source:${source.id}`));
  return items.filter(item => !item.id.startsWith("source:") || active.has(item.id));
}

function prefixIds(items: ContentItem[], prefix: string): ContentItem[] {
  return items.map(item => item.type === "folder"
    ? { ...item, id: `${prefix}${item.id}`, children: prefixIds(item.children, prefix) }
    : { ...item, id: `${prefix}${item.id}` });
}

/**
 * The built-in source keeps its own IDs at the library root, so existing progress, bookmarks and
 * downloads still match. Each extra source becomes a top-level folder with namespaced IDs.
 */
export function mergeCatalogs(catalogs: { source: CatalogSource; items: ContentItem[] }[]): ContentItem[] {
  const merged: ContentItem[] = [];
  for (const { source, items } of catalogs) {
    if (source.id === DEFAULT_SOURCE_ID) merged.push(...items);
    else merged.push({ id: `source:${source.id}`, name: source.name, type: "folder", children: prefixIds(items, `${source.id}:`) });
  }
  return merged;
}
