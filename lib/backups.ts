import { db, type ComicBookmark, type ReadComic, type LastRead } from "./dexieDB";
import { parseReaderSettings, READER_SETTINGS_KEY, type ReaderSettings } from "./reader-settings";

export const MAX_BACKUP_BYTES = 10 * 1024 ** 2;
export const MAX_IMPORT_TOKEN = 128_000;
export interface ReaderBackup {
  format: "comic-reader-backup";
  version: 1;
  exportedAt: string;
  settings: { reader: ReaderSettings; theme: "light" | "dark" | "gruvbox" };
  bookmarks: ComicBookmark[];
  progress: ReadComic[];
  navigation: { lastComic?: LastRead; lastFolder?: LastRead };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid backup object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string, max: number, empty = false): string {
  if (typeof value !== "string" || value.length > max || (!empty && !value.trim())) throw new Error(`Invalid ${name} in backup.`);
  return value;
}
function integer(value: unknown, name: string, min = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) throw new Error(`Invalid ${name} in backup.`);
  return value;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 50_000) throw new Error("Invalid or oversized backup collection.");
  return value;
}
function position(value: unknown): LastRead | undefined {
  if (value === undefined) return undefined;
  const row = object(value);
  return { id: text(row.id, "comic or folder ID", 1024), timestamp: integer(row.timestamp, "timestamp") };
}
/** Construct only known fields. Validate the entire file before any storage writes. */
export function validateBackup(input: unknown): ReaderBackup {
  const data = object(input);
  if (data.format !== "comic-reader-backup" || data.version !== 1) throw new Error("This is not a supported Comic Reader backup (version 1).");
  const exportedAt = text(data.exportedAt, "export date", 64);
  if (!Number.isFinite(Date.parse(exportedAt))) throw new Error("Invalid export date in backup.");
  const settings = object(data.settings), reader = object(settings.reader);
  if (!["light", "dark", "gruvbox"].includes(settings.theme as string)) throw new Error("Invalid theme in backup.");
  const bookmarks = list(data.bookmarks).map(value => {
    const row = object(value);
    return { comicId: text(row.comicId, "comic ID", 1024), comicName: text(row.comicName, "comic name", 4096),
      page: integer(row.page, "bookmark page", 1), note: text(row.note, "bookmark note", 2000, true),
      createdAt: integer(row.createdAt, "bookmark creation date"), updatedAt: integer(row.updatedAt, "bookmark update date") };
  });
  const progress = list(data.progress).map(value => {
    const row = object(value);
    if (!["unread", "in_progress", "completed"].includes(row.status as string)) throw new Error("Invalid reading status in backup.");
    const lastPage = integer(row.lastPage, "last page"), totalPages = integer(row.totalPages, "page count");
    if (totalPages && lastPage > totalPages) throw new Error("Reading progress exceeds the page count.");
    return { id: text(row.id, "comic ID", 1024), status: row.status as ReadComic["status"], lastPage, totalPages };
  });
  const nav = object(data.navigation ?? {});
  return { format: "comic-reader-backup", version: 1, exportedAt,
    settings: { reader: parseReaderSettings(JSON.stringify(reader), false), theme: settings.theme as ReaderBackup["settings"]["theme"] },
    bookmarks, progress, navigation: { lastComic: position(nav.lastComic), lastFolder: position(nav.lastFolder) } };
}
export function parseBackup(json: string): ReaderBackup {
  if (new TextEncoder().encode(json).byteLength > MAX_BACKUP_BYTES) throw new Error("Backup is too large (10 MiB maximum).");
  let data: unknown;
  try { data = JSON.parse(json); } catch { throw new Error("This file does not contain valid JSON."); }
  return validateBackup(data);
}
const latest = (rows: LastRead[]) => rows.sort((a, b) => b.timestamp - a.timestamp)[0];
export async function exportBackup(phone = false): Promise<ReaderBackup> {
  const reader = parseReaderSettings(localStorage.getItem(READER_SETTINGS_KEY), phone);
  const theme = localStorage.getItem("theme") ?? "light";
  const snapshot = await db.transaction("r", [db.bookmarks, db.readComics, db.lastReadComic, db.lastFolder], async () => ({
    bookmarks: await db.bookmarks.toArray(), progress: await db.readComics.toArray(),
    navigation: { lastComic: latest(await db.lastReadComic.toArray()), lastFolder: latest(await db.lastFolder.toArray()) },
  }));
  return parseBackup(JSON.stringify({ format: "comic-reader-backup", version: 1, exportedAt: new Date().toISOString(), settings: { reader, theme }, ...snapshot }));
}
function mergeProgress(a: ReadComic | undefined, b: ReadComic): ReadComic {
  if (!a) return b;
  const lastPage = Math.max(a.lastPage, b.lastPage), totalPages = Math.max(a.totalPages, b.totalPages, lastPage);
  const status = a.status === "completed" || b.status === "completed" ? "completed"
    : a.status === "in_progress" || b.status === "in_progress" || lastPage > 0 ? "in_progress" : "unread";
  return { id: b.id, lastPage, totalPages, status };
}
export interface ImportResult { bookmarksAdded: number; bookmarksKept: number; progressUpdated: number }
export async function importBackup(input: unknown): Promise<ImportResult> {
  const backup = validateBackup(input);
  const result: ImportResult = { bookmarksAdded: 0, bookmarksKept: 0, progressUpdated: 0 };
  let previous: (string | null)[] = [];
  const next = [JSON.stringify(backup.settings.reader), backup.settings.theme];
  const keys = [READER_SETTINGS_KEY, "theme"];
  let touchedSettings = false;
  try {
    await db.transaction("rw", [db.bookmarks, db.readComics, db.lastReadComic, db.lastFolder], async () => {
      // Compound primary keys make repeat imports and simultaneous tabs idempotent.
      const seen = new Set<string>();
      for (const bookmark of backup.bookmarks) {
        const key = JSON.stringify([bookmark.comicId, bookmark.page]);
        if (seen.has(key)) continue;
        seen.add(key);
        if (await db.bookmarks.get([bookmark.comicId, bookmark.page])) result.bookmarksKept++;
        else { await db.bookmarks.add(bookmark); result.bookmarksAdded++; }
      }
      const merged = new Map<string, ReadComic>();
      for (const row of backup.progress) merged.set(row.id, mergeProgress(merged.get(row.id), row));
      for (const row of merged.values()) {
        const existing = await db.readComics.get(row.id), next = mergeProgress(existing, row);
        if (!existing || existing.status !== next.status || existing.lastPage !== next.lastPage || existing.totalPages !== next.totalPages) {
          await db.readComics.put(next); result.progressUpdated++;
        }
      }
      for (const [table, incoming] of [[db.lastReadComic, backup.navigation.lastComic], [db.lastFolder, backup.navigation.lastFolder]] as const) {
        const existing = latest(await table.toArray());
        if (incoming && (!existing || incoming.timestamp > existing.timestamp)) { await table.clear(); await table.put(incoming); }
      }
      // A localStorage failure aborts the IndexedDB transaction too. Restore preferences
      // if either write or the final database commit fails; archives are never touched.
      previous = keys.map(key => localStorage.getItem(key));
      touchedSettings = true;
      keys.forEach((key, index) => localStorage.setItem(key, next[index]));
    });
  } catch (error) {
    if (touchedSettings) {
      try { keys.forEach((key, index) => {
        if (localStorage.getItem(key) !== next[index]) return;
        if (previous[index] === null) localStorage.removeItem(key); else localStorage.setItem(key, previous[index]!);
      }); } catch { throw new Error("Import failed and preferences could not be restored. Bookmarks and progress were not imported. Check browser storage and retry."); }
    }
    throw error;
  }
  window.dispatchEvent(new StorageEvent("storage", { key: READER_SETTINGS_KEY, newValue: next[0] }));
  return result;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
async function readLimited(stream: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > MAX_BACKUP_BYTES) { await reader.cancel(); throw new Error("Decoded backup is too large (10 MiB maximum)."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const output = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}
export async function encodeBackup(backup: ReaderBackup): Promise<string> {
  const json = JSON.stringify(validateBackup(backup)), bytes = new TextEncoder().encode(json);
  if (bytes.length > MAX_BACKUP_BYTES) throw new Error("Backup is too large (10 MiB maximum).");
  let token = `j1.${base64url(bytes)}`;
  if (typeof CompressionStream !== "undefined") {
    const compressed = await readLimited(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")));
    const gzip = `g1.${base64url(compressed)}`;
    if (gzip.length < token.length) token = gzip;
  }
  if (token.length > MAX_IMPORT_TOKEN) throw new Error("This backup is too large for a shareable link. Export a JSON file instead.");
  return token;
}
export async function decodeBackup(token: string): Promise<ReaderBackup> {
  if (token.length > MAX_IMPORT_TOKEN) throw new Error("Import link is too large. Use a JSON file instead.");
  const match = /^(?:(j1|g1)\.)?([A-Za-z0-9_-]+)$/.exec(token);
  if (!match) throw new Error("Invalid import link.");
  try {
    const binary = atob(match[2].replaceAll("-", "+").replaceAll("_", "/"));
    let bytes: Uint8Array<ArrayBuffer> = Uint8Array.from(binary, char => char.charCodeAt(0));
    if (match[1] === "g1") {
      if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot open compressed links. Import the JSON file instead.");
      bytes = await readLimited(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")));
    }
    return parseBackup(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(`Cannot read import link: ${error instanceof Error ? error.message : "invalid data"}`);
  }
}
export async function backupLink(backup: ReaderBackup, origin: string): Promise<string> {
  return `${new URL("/import", origin).href}#${await encodeBackup(backup)}`;
}
