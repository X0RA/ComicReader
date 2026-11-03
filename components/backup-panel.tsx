"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { backupLink, decodeBackup, encodeBackup, exportBackup, importBackup, MAX_BACKUP_BYTES, parseBackup, type ImportResult, type ReaderBackup } from "@/lib/backups";
const button = "min-h-11 rounded-xl border px-4 text-sm font-medium hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";
const field = "w-full rounded-xl border bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";
async function transfer(body: object) {
  const response = await fetch("/api/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Transfer failed. Try a JSON file or import link.");
  return data;
}
export default function BackupPanel({ automaticToken }: { automaticToken?: string }) {
  const { setTheme } = useTheme();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [link, setLink] = useState(""), [codeInput, setCodeInput] = useState("");
  const [code, setCode] = useState<{ code: string; expiresAt: number }>();
  const [result, setResult] = useState<ImportResult>();
  const automatic = useRef<{ token: string; promise: Promise<{ backup: ReaderBackup; result: ImportResult }> } | undefined>(undefined);
  const operation = useRef(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!automaticToken) return;
    let alive = true;
    setBusy(true); operation.current = true; setError(""); setMessage("Importing link…");
    if (automatic.current?.token !== automaticToken) automatic.current = { token: automaticToken, promise: (async () => {
      const backup = await decodeBackup(automaticToken); return { backup, result: await importBackup(backup) };
    })() };
    automatic.current.promise.then(({ backup, result }) => {
      if (!alive) return;
      setTheme(backup.settings.theme); setResult(result); setMessage("Import complete.");
      // Keep the imported data out of subsequent history entries and copied addresses.
      history.replaceState(history.state, "", "/import");
    }).catch(error => { if (alive) { setError(String(error instanceof Error ? error.message : error)); setMessage(""); } })
      .finally(() => { if (alive) { setBusy(false); operation.current = false; } });
    return () => { alive = false; };
  }, [automaticToken, setTheme]);
  const snapshot = () => exportBackup(Math.min(innerWidth, innerHeight) < 640);
  async function run(action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(""); setMessage(""); setResult(undefined);
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { operation.current = false; setBusy(false); }
  }
  async function apply(backup: ReaderBackup) {
    const imported = await importBackup(backup); setTheme(backup.settings.theme); setResult(imported); setMessage("Import complete.");
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage("Copied."); }
    catch { setMessage("Select the text below and copy it manually."); }
  }
  return <div className="space-y-6">
    <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Move your reader settings, theme, bookmarks, reading progress, and last-opened comic/folder between browsers. Comic files and cached upscaling models are excluded.</p>
    <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Imports add missing bookmarks and keep existing notes on duplicate pages. Progress keeps the furthest page and completed status. Imported settings replace this browser’s settings.</p>
    {(message || error || result) && <div className="space-y-2 rounded-xl border bg-card p-4 text-sm">
      {error && <p role="alert" className="text-destructive">{error}</p>}{message && <p role="status">{message}</p>}
      {result && <><p>{result.bookmarksAdded} bookmarks added · {result.bookmarksKept} existing bookmarks kept · {result.progressUpdated} reading records updated.</p><Link href="/" className="inline-flex min-h-11 items-center text-primary hover:underline">Return to library</Link></>}
    </div>}
    <section aria-labelledby="backup-file-title" className="space-y-3 rounded-2xl border bg-card p-5">
      <h2 id="backup-file-title" className="font-semibold">JSON backup</h2><p className="text-sm text-muted-foreground">Save a file for safekeeping or import it on another device.</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => run(async () => {
        const backup = await snapshot(), blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
        if (blob.size > MAX_BACKUP_BYTES) throw new Error("Backup is too large (10 MiB maximum).");
        const url = URL.createObjectURL(blob), anchor = document.createElement("a");
        anchor.href = url; anchor.download = `comic-reader-${backup.exportedAt.slice(0, 10)}.json`; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000); setMessage("Backup file exported.");
      })}>Export JSON</button>
      <button type="button" className={button} disabled={busy} onClick={() => file.current?.click()}>Import JSON</button>
      <input ref={file} aria-label="Backup JSON file" type="file" accept=".json,application/json" className="sr-only" disabled={busy} onChange={event => {
        const selected = event.target.files?.[0]; event.target.value = "";
        if (selected) void run(async () => { if (selected.size > MAX_BACKUP_BYTES) throw new Error("Backup is too large (10 MiB maximum)."); await apply(parseBackup(await selected.text())); });
      }} /></div>
    </section>
    <section aria-labelledby="backup-link-title" className="space-y-3 rounded-2xl border bg-card p-5">
      <h2 id="backup-link-title" className="font-semibold">Import link</h2><p className="text-sm text-muted-foreground">Open the link on another device to import automatically. The link contains your settings, bookmarks and progress; anyone with it can read them. Large backups should use a JSON file.</p>
      <button type="button" className={button} disabled={busy} onClick={() => run(async () => { const url = await backupLink(await snapshot(), location.origin); setLink(url); await copy(url); })}>Create import link</button>
      {link && <div className="space-y-2"><label className="block text-sm">Import link<textarea readOnly value={link} rows={3} className={`${field} mt-2 break-all font-mono text-xs`} onFocus={event => event.target.select()} /></label><button type="button" className={button} disabled={busy} onClick={() => copy(link)}>Copy link</button></div>}
    </section>
    <section aria-labelledby="backup-code-title" className="space-y-3 rounded-2xl border bg-card p-5">
      <h2 id="backup-code-title" className="font-semibold">Temporary transfer code <span className="ml-1 text-xs font-normal text-muted-foreground">Experimental</span></h2>
      <p className="text-sm leading-relaxed text-muted-foreground">Store this backup in server memory for up to 10 minutes. On the other device, open Backup & transfer on this same site and enter the code. A server restart or a different Vercel instance can make it unavailable. Use a file or link if that happens.</p>
      <p className="text-xs text-muted-foreground">Anyone with the code can retrieve the backup until it expires.</p>
      <button type="button" className={button} disabled={busy} onClick={() => run(async () => {
        const response = await transfer({ action: "create", payload: await encodeBackup(await snapshot()) });
        setCode({ code: response.code, expiresAt: response.expiresAt }); setMessage("Transfer code ready.");
      })}>Create transfer code</button>
      {code && <div className="space-y-2 rounded-xl bg-secondary p-4"><label className="block text-xs text-muted-foreground">Your transfer code<input aria-label="Your transfer code" className="mt-1 block w-full bg-transparent font-mono text-2xl tracking-widest text-foreground" readOnly value={code.code} onFocus={event => event.target.select()} /></label><p className="text-xs text-muted-foreground">Expires at {new Date(code.expiresAt).toLocaleTimeString()} or sooner if the server restarts.</p><button type="button" className={button} disabled={busy} onClick={() => copy(code.code)}>Copy code</button></div>}
      <form className="flex flex-wrap items-end gap-2 border-t pt-4" onSubmit={event => { event.preventDefault(); void run(async () => {
        const response = await transfer({ action: "read", code: codeInput }); await apply(await decodeBackup(response.payload));
      }); }}><label className="min-w-0 flex-1 text-sm">Code from another device<input autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={32} className={`${field} mt-2 font-mono uppercase`} value={codeInput} onChange={event => setCodeInput(event.target.value)} placeholder="ABCDE-12345" required disabled={busy} /></label><button type="submit" className={button} disabled={busy || !codeInput.trim()}>Import code</button></form>
    </section>
    {busy && <p role="status" className="text-sm text-muted-foreground">Working…</p>}
  </div>;
}
