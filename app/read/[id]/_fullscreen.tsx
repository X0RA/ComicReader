"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize, Minimize } from "lucide-react";
import styles from "./reader.module.css";

export function useReaderFullscreen() {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const owned = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const sync = () => setActive(document.fullscreenElement === document.documentElement);
    setSupported(!!document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === "function");
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => {
      mounted.current = false;
      document.removeEventListener("fullscreenchange", sync);
      if (owned.current && document.fullscreenElement === document.documentElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  const toggle = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setError("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        // Fullscreen the document so portalled menus and dialogs remain visible.
        await document.documentElement.requestFullscreen();
        owned.current = true;
        if (!mounted.current && document.fullscreenElement === document.documentElement) await document.exitFullscreen();
      }
    } catch {
      setError("Fullscreen could not be changed. Your browser may not allow it here.");
    } finally { pending.current = false; }
  }, []);
  return { active, supported, error, toggle };
}

export function ReaderToolbar({ fullscreen, children }: { fullscreen: ReturnType<typeof useReaderFullscreen>; children: ReactNode }) {
  return <div className={`${styles.topControls} ${fullscreen.active ? styles.fullscreenControls : ""}`}>
    {fullscreen.active && <button type="button" className={styles.touchReveal} aria-label="Show reader toolbar" onClick={event => event.currentTarget.parentElement?.querySelector<HTMLElement>("header button")?.focus()} />}
    <header aria-label="Reader toolbar" className={`${styles.readerHeader} flex h-[60px] items-center gap-1 border-b bg-background/90 px-1 backdrop-blur-xl sm:gap-3 sm:px-4`}>
      {children}
      {fullscreen.supported && <button type="button" aria-label={fullscreen.active ? "Exit fullscreen" : "Enter fullscreen"} title={fullscreen.active ? "Exit fullscreen (Esc)" : "Enter fullscreen"} aria-pressed={fullscreen.active}
        onClick={event => { if (event.detail > 0) event.currentTarget.blur(); void fullscreen.toggle(); }}
        className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring">
        {fullscreen.active ? <Minimize size={19} /> : <Maximize size={19} />}
      </button>}
    </header>
  </div>;
}
