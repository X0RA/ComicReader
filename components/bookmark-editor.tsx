"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { ComicBookmark } from "@/lib/dexieDB";
import { saveBookmark } from "@/lib/bookmarks";

export default function BookmarkEditor({ bookmark, choices = [bookmark], onClose }: {
  bookmark: ComicBookmark; choices?: ComicBookmark[]; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(bookmark);
  const [note, setNote] = useState(bookmark.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} aria-labelledby="bookmark-editor-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border bg-card p-5 text-card-foreground shadow-2xl backdrop:bg-black/50">
    <form onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      setBusy(true); setError("");
      try { await saveBookmark({ ...selected, note }); onClose(); }
      catch { setError("The bookmark could not be saved. Please try again."); setBusy(false); }
    }}>
      <div className="flex items-center justify-between gap-3"><h2 id="bookmark-editor-title" className="text-lg font-semibold">{selected.createdAt ? "Edit bookmark" : "Bookmark page"}</h2>
        <button type="button" aria-label="Close bookmark editor" disabled={busy} onClick={onClose} className="flex size-11 items-center justify-center rounded-lg hover:bg-secondary"><X size={18} /></button>
      </div>
      <p className="mt-1 break-words text-sm text-muted-foreground">{bookmark.comicName}</p>
      {choices.length > 1 ? <label className="mt-4 block text-sm">Page
        <select value={selected.page} disabled={busy} onChange={event => { const next = choices.find(choice => choice.page === Number(event.target.value))!; setSelected(next); setNote(next.note); }} className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3">
          {choices.map(choice => <option key={choice.page} value={choice.page}>Page {choice.page}{choice.createdAt ? " · bookmarked" : ""}</option>)}
        </select>
      </label> : <p className="mt-4 font-mono text-sm">Page {selected.page}</p>}
      <label className="mt-4 block text-sm">Note (optional)
        <textarea value={note} onChange={event => setNote(event.target.value)} disabled={busy} maxLength={2000} rows={4} placeholder="Why save this page?" className="mt-2 w-full resize-y rounded-lg border bg-background p-3 text-sm" />
      </label>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border px-4 text-sm">Cancel</button>
        <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save bookmark"}</button>
      </div>
    </form>
  </dialog>;
}
