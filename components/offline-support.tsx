"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isOfflineReading } from "@/lib/offline";

import { navigateOffline } from "@/offline/navigation";

type State = "preparing" | "ready" | "unavailable" | "development";
let state: State = "preparing", started = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function publish(next: State) { state = next; listeners.forEach(listener => listener()); }
async function check(worker: ServiceWorker | null, repair = false) {
  if (!worker) return false;
  return new Promise<boolean>(resolve => {
    const channel = new MessageChannel();
    const finish = (ready: boolean) => { clearTimeout(timer); channel.port1.close(); resolve(ready); };
    const timer = setTimeout(() => finish(false), repair ? 30000 : 5000);
    channel.port1.onmessage = event => finish(event.data?.ready === true);
    try { worker.postMessage({ type: repair ? "OFFLINE_PREPARE" : "OFFLINE_STATUS" }, [channel.port2]); } catch { channel.port2.close(); finish(false); }
  });
}
export default function OfflineSupport() {
  useEffect(() => {
    // Next client navigation needs a server response. Use document navigation
    // once controlled so the worker can recover even when onLine is inaccurate.
    const navigate = (event: MouseEvent) => {
      if ((!navigator.serviceWorker?.controller && !isOfflineReading()) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname && url.search === location.search) return;
      if (!/^\/(?:$|read\/|(?:downloaded|bookmarks|backup|import)(?:\/|$))/.test(url.pathname)) return;
      event.preventDefault(); event.stopPropagation();
      if (document.documentElement.dataset.offlineApp) navigateOffline(url.href);
      else location.assign(url.href);
    };
    document.addEventListener("click", navigate, true);
    if (!started) {
      started = true;
      if (!("serviceWorker" in navigator)) publish("unavailable");
      else if (process.env.NODE_ENV !== "production") publish("development");
      else void (async () => {
        try {
          const current = navigator.serviceWorker.controller;
          if (current && await check(current)) publish("ready");
          navigator.serviceWorker.addEventListener("controllerchange", async () => {
            publish(await check(navigator.serviceWorker.controller, true) ? "ready" : "unavailable");
          });
          const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
          const watchInstall = () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (worker.state === "redundant" && !registration.active) publish("unavailable");
            });
          };
          registration.addEventListener("updatefound", watchInstall);
          watchInstall();
          const active = registration.active;
          if (active && await check(active, true)) publish("ready");
          const ready = await navigator.serviceWorker.ready;
          publish(await check(ready.active) ? "ready" : "unavailable");
        } catch { if (state !== "ready") publish("unavailable"); }
      })();
    }
    return () => document.removeEventListener("click", navigate, true);
  }, []);
  return null;
}
export function OfflineStatus() {
  const status = useSyncExternalStore(subscribe, () => state, () => "preparing" as State);
  const [{ offline, online }, setNetwork] = useState({ offline: false, online: false });
  useEffect(() => {
    const update = () => setNetwork({ offline: isOfflineReading(), online: navigator.onLine });
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return <p role="status" className="text-xs leading-relaxed text-muted-foreground" data-offline-status={status}>
    {offline ? "Offline — downloaded comics are available on this device." : status === "ready" ? "Offline reading ready. Download comics before disconnecting." : status === "preparing" ? "Preparing the app for offline reading…" : status === "development" ? "Offline setup is available in the production build." : "Offline setup did not finish. Reopen the app online to try again."}
    {offline && document.documentElement.dataset.offlineApp && online && <button type="button" className="ml-2 underline" onClick={() => location.reload()}>Retry online</button>}
  </p>;
}
