'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { BookOpen, ChevronRight, Trash2 } from 'lucide-react';
import { getDownloadedComics, deleteDownloadedComic, clearDownloads, hardReset, storageInfo } from '@/lib/downloads';
import { maintainArchives } from '@/lib/archiveMaintenance';
import { ThemeSwitcher } from '@/components/theme-controls';
import Link from 'next/link';

interface CachedComic { id: string; name: string; totalSize: number; downloadedAt?: number }
type Confirmation = { kind: 'delete'; comic: CachedComic } | { kind: 'clear' | 'reset' };
const button = 'min-h-11 rounded-lg border px-4 text-sm font-medium disabled:opacity-50 hover:bg-accent';
const danger = `${button} border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20`;
const size = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

export default function DownloadedPage() {
  const [comics, setComics] = useState<CachedComic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof storageInfo>> | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const { setTheme } = useTheme();

  async function load() {
    const downloads = await getDownloadedComics();
    setComics(downloads.map(entry => ({
      id: entry.id, name: entry.name || entry.id, totalSize: entry.fileSize || 0,
      downloadedAt: entry.lastAccessedAt || entry.downloadedAt,
    })).sort((a, b) => (b.downloadedAt ?? 0) - (a.downloadedAt ?? 0)));
    setStorage(await storageInfo());
  }

  useEffect(() => {
    void maintainArchives().then(load).catch(err => setError(`Archive maintenance failed: ${String(err)}`));
    load().catch(err => setError(`Failed to load downloads: ${String(err)}`)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!confirmation) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    cancel.current?.focus();
    return () => { element?.close(); if (previous?.isConnected) previous.focus(); };
  }, [confirmation]);

  async function confirm() {
    if (!confirmation || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (confirmation.kind === 'delete') {
        await deleteDownloadedComic(confirmation.comic.id);
      } else if (confirmation.kind === 'clear') {
        // Remove blobs and all download metadata, preserving catalog and progress.
        await clearDownloads();
      } else {
        // Use the storage manager to cancel transfers and remove OPFS archives safely.
        await hardReset(false);
        localStorage.removeItem('comic-reader-view-options');
        setTheme('light');
        localStorage.removeItem('theme');
      }
      await load();
      setConfirmation(null);
    } catch (err) {
      setError(`Unable to ${confirmation.kind === 'reset' ? 'reset app data' : 'delete downloads'}: ${String(err)}`);
    } finally { setBusy(false); }
  }

  const title = confirmation?.kind === 'reset' ? 'Hard reset app data?' : confirmation?.kind === 'clear' ? 'Clear all downloads?' : 'Delete download?';
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[880px] flex-col gap-9 px-5 pb-16 pt-7 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm font-medium">
          <Link href="/" aria-label="Library" className="-ml-2 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"><BookOpen aria-hidden="true" size={18} strokeWidth={1.8} /></Link>
          <ChevronRight aria-hidden="true" className="size-3 text-muted-foreground" />
          <span aria-current="page">Storage</span>
        </nav>
        <ThemeSwitcher />
      </header>
      <section aria-labelledby="downloads-title">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-5">
          <div><h1 id="downloads-title" className="text-[32px] font-semibold tracking-tight">Downloaded</h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground" aria-live="polite">{loading ? 'Loading downloads…' : `${comics.length} ${comics.length === 1 ? 'comic' : 'comics'} · ${size(comics.reduce((total, comic) => total + comic.totalSize, 0))}`}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className={button} disabled={loading || busy} onClick={() => setConfirmation({ kind: 'reset' })}>Hard reset</button>
            <button type="button" className={danger} disabled={loading || busy || !comics.length} onClick={() => setConfirmation({ kind: 'clear' })}>Clear all</button>
          </div>
        </div>
        {storage && <div className="mb-5 space-y-2 rounded-xl border bg-card p-4 text-xs leading-relaxed text-muted-foreground">
          <p>Browser storage: {size(storage.usage ?? 0)} used · Comic cache budget: {size(storage.budget)}.</p>
          <p>Older cached comics are removed when space is needed. Reading progress and bookmarks are kept.</p>
          <button type="button" className="min-h-11 text-primary underline underline-offset-4" onClick={async () => {
            try { await navigator.storage.persist(); setStorage(await storageInfo()); }
            catch (err) { setError(String(err)); }
          }}>{storage.persistent ? 'Persistent storage enabled' : 'Request persistent storage'}</button>
          <p>Clearing site data removes comics, reading progress, and bookmarks. Cached comics alone do not guarantee the app opens offline.</p>
        </div>}
        {error && !confirmation && <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</p>}
        {!loading && comics.length === 0 && <div className="border-t py-12 text-center text-muted-foreground"><p>No comics downloaded yet.</p><Link href="/" className="mt-3 inline-flex min-h-11 items-center text-primary hover:underline">Browse library</Link></div>}
        <ul className="border-t" aria-label="Downloaded comics" aria-busy={loading}>
          {comics.map(comic => <li key={comic.id} className="flex min-h-[76px] items-center gap-3 border-b py-2 pl-2 sm:gap-5">
            <div className="min-w-0 flex-1"><p className="truncate font-medium" title={comic.name}>{comic.name.replace(/\.cbz$/i, '')}</p><p className="mt-1 text-xs text-muted-foreground">{comic.downloadedAt ? <>Opened <time dateTime={new Date(comic.downloadedAt).toISOString()}>{new Date(comic.downloadedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</time></> : 'Open time unavailable'}</p></div>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{size(comic.totalSize)}</span>
            <button type="button" disabled={busy} aria-label={`Delete ${comic.name}`} onClick={() => setConfirmation({ kind: 'delete', comic })} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 aria-hidden="true" size={18} strokeWidth={1.8} /></button>
          </li>)}
        </ul>
      </section>
      <dialog ref={dialog} aria-labelledby="confirm-title" aria-describedby="confirm-description" onCancel={event => { event.preventDefault(); if (!busy) setConfirmation(null); }} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border bg-card p-6 text-card-foreground shadow-xl backdrop:bg-black/60">
        <h2 id="confirm-title" className="text-xl font-semibold">{title}</h2>
        <p id="confirm-description" className="mt-3 break-words text-sm leading-relaxed text-muted-foreground">{confirmation?.kind === 'reset' ? 'Remove this app’s downloaded comics, catalog cache, reading progress, bookmarks, reader options, and saved theme. This cannot be undone.' : confirmation?.kind === 'clear' ? 'Remove every downloaded comic from this device. Reading progress, bookmarks, and settings are kept. You can download comics again from the library.' : `Remove ${confirmation?.kind === 'delete' ? confirmation.comic.name : 'this comic'} from this device? You can download it again from the library.`}</p>
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex justify-end gap-2"><button ref={cancel} type="button" disabled={busy} className={button} onClick={() => { setConfirmation(null); setError(null); }}>Cancel</button><button type="button" disabled={busy} className={danger} onClick={confirm}>{busy ? 'Removing…' : confirmation?.kind === 'reset' ? 'Hard reset' : confirmation?.kind === 'clear' ? 'Clear all' : 'Delete'}</button></div>
      </dialog>
    </main>
  );
}
