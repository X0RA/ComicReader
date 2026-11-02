"use client";

import { useCallback, useEffect, useState } from "react";
import { defaultReaderSettings, parseReaderSettings, READER_SETTINGS_KEY, type ReaderSettings } from "@/lib/reader-settings";

export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(defaultReaderSettings(false));
  const [ready, setReady] = useState(false);
  const [viewport, setViewport] = useState({ width: 1280, height: 900, phone: false });
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    // Short edge recognises a phone even after rotating to landscape.
    const measure = () => setViewport({ width: window.innerWidth, height: window.innerHeight, phone: Math.min(window.innerWidth, window.innerHeight) < 640 });
    measure();
    const phone = Math.min(window.innerWidth, window.innerHeight) < 640;
    try { setSettings(parseReaderSettings(localStorage.getItem(READER_SETTINGS_KEY), phone)); }
    catch { setSettings(defaultReaderSettings(phone)); setStorageError(true); }
    setReady(true);
    window.addEventListener("resize", measure);
    const sync = (event: StorageEvent) => {
      if (event.key === READER_SETTINGS_KEY || event.key === null) setSettings(parseReaderSettings(event.newValue, Math.min(innerWidth, innerHeight) < 640));
    };
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("storage", sync); };
  }, []);
  const change = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings(previous => {
      const next = { ...previous, ...patch };
      if (next.layout === "webtoon" && next.fit === "height") next.fit = "width";
      try { localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(next)); setStorageError(false); }
      catch { setStorageError(true); }
      return next;
    });
  }, []);
  const reset = useCallback(() => change(defaultReaderSettings(viewport.phone)), [change, viewport.phone]);
  return { settings, change, reset, ready, viewport, storageError };
}

export function useReaderWakeLock(enabled: boolean) {
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!enabled) { setStatus(""); return; }
    if (!("wakeLock" in navigator)) { setStatus("Screen wake lock is not supported in this browser."); return; }
    let active = true;
    let lock: WakeLockSentinel | undefined;
    let pending = false;
    async function acquire() {
      if (!active || document.visibilityState !== "visible" || lock || pending) return;
      pending = true;
      try {
        const result = await navigator.wakeLock.request("screen");
        if (!active) { await result.release(); return; }
        lock = result;
        setStatus("");
        result.addEventListener("release", () => { lock = undefined; });
      } catch { if (active) setStatus("Screen wake lock is unavailable. Your device may still sleep."); }
      finally { pending = false; }
    }
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => { active = false; document.removeEventListener("visibilitychange", acquire); void lock?.release().catch(() => {}); };
  }, [enabled]);
  return status;
}
