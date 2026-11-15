"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { db } from "@/lib/dexieDB";
import { DEFAULT_SOURCE_ID, SOURCES_CHANGED, SOURCES_KEY, fetchCatalog, getSources, normalizeSourceUrl, saveSources, type CatalogSource } from "@/lib/sources";

const button = "min-h-11 rounded-lg border px-4 text-sm font-medium disabled:opacity-50 hover:bg-accent";
const field = "mt-1.5 w-full rounded-lg border bg-background p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring";

export function SourceSettings({ onBusyChange }: { onBusyChange?: (busy: boolean) => void }) {
  const [sources, setSources] = useState<CatalogSource[]>([]);
  const [url, setUrl] = useState(""), [name, setName] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => setSources(getSources());
    const storage = (event: StorageEvent) => { if (event.key === SOURCES_KEY || event.key === null) refresh(); };
    refresh();
    window.addEventListener(SOURCES_CHANGED, refresh);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(SOURCES_CHANGED, refresh);
      window.removeEventListener("storage", storage);
    };
  }, []);

  async function add() {
    setBusy(true); onBusyChange?.(true); setError(null);
    try {
      const href = normalizeSourceUrl(url);
      if (getSources().some(source => source.url === href)) throw new Error("That source is already in your library.");
      const source = { id: crypto.randomUUID().slice(0, 8), name: name.trim() || new URL(href).hostname, url: href };
      // Check it's reachable and readable before saving, so a typo doesn't silently add nothing.
      await fetchCatalog(source);
      const current = getSources();
      if (current.some(item => item.url === href)) throw new Error("That source is already in your library.");
      const next = [...current, source];
      saveSources(next); setSources(next); setUrl(""); setName("");
    } catch (err) {
      setError(err instanceof TypeError ? "Couldn't reach that URL. Check it, and that the server allows cross-origin requests (CORS)." : err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); onBusyChange?.(false); }
  }

  async function remove(id: string) {
    setBusy(true); onBusyChange?.(true); setError(null);
    try {
      saveSources(getSources().filter(source => source.id !== id));
      await db.transaction("rw", "comics", async () => {
        await db.comics.delete(`source:${id}`);
        const root = await db.comics.get("root");
        if (root) await db.storeComicsData(root.content);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); onBusyChange?.(false); }
  }

  return <section aria-labelledby="sources-title" className="space-y-4">
    <div><h2 id="sources-title" className="text-xl font-semibold tracking-tight">Catalog sources</h2>
      <p className="mt-1 text-sm text-muted-foreground">Each extra source appears as its own folder in the library. Downloaded comics stay readable after a source is removed.</p></div>
    <ul className="border-t" aria-label="Catalog sources">
      {sources.map(source => <li key={source.id} className="flex min-h-[64px] items-center gap-3 border-b py-2 pl-2">
        <div className="min-w-0 flex-1"><p className="truncate font-medium">{source.name}{source.id === DEFAULT_SOURCE_ID && <span className="ml-2 text-xs font-normal text-muted-foreground">Default</span>}</p>
          <p className="truncate font-mono text-xs text-muted-foreground" title={source.url}>{source.url}</p></div>
        {source.id !== DEFAULT_SOURCE_ID && <button type="button" aria-label={`Remove ${source.name}`} disabled={busy} onClick={() => remove(source.id)} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 aria-hidden="true" size={18} strokeWidth={1.8} /></button>}
      </li>)}
    </ul>
    <form className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end" onSubmit={event => { event.preventDefault(); void add(); }}>
      <label className="text-sm">Catalog URL<input type="url" required className={field} value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/contents.json" disabled={busy} /></label>
      <label className="text-sm">Name <span className="text-muted-foreground">(optional)</span><input className={field} value={name} onChange={event => setName(event.target.value)} maxLength={80} disabled={busy} /></label>
      <button type="submit" className={button} disabled={busy || !url.trim()}>{busy ? "Checking…" : "Add source"}</button>
    </form>
    {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
  </section>;
}
