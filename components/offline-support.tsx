"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isOfflineReading } from "@/lib/offline";

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
    worker.postMessage({ type: repair ? "OFFLINE_PREPARE" : "OFFLINE_STATUS" }, [channel.port2]);
  });
}
export default function OfflineSupport() {
  useEffect(() => {
    // Next client navigation needs a server response. Use document navigation
    // when disconnected so the worker can open any saved comic through its shell.
    const navigate = (event: MouseEvent) => {
      if (!isOfflineReading() || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname && url.search === location.search) return;
      event.preventDefault(); event.stopPropagation(); location.assign(url.href);
    };
    document.addEventListener("click", navigate, true);
    if (!started) {
      started = true;
      if (!("serviceWorker" in navigator)) publish("unavailable");
      else if (process.env.NODE_ENV !== "production") publish("development");
      else if (document.documentElement.dataset.offlineApp === "true") void check(navigator.serviceWorker.controller).then(ready => publish(ready ? "ready" : "unavailable"));
      else void (async () => {
        try {
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
        } catch { publish("unavailable"); }
      })();
    }
    return () => document.removeEventListener("click", navigate, true);
  }, []);
  return null;
}
export function OfflineStatus() {
  const status = useSyncExternalStore(subscribe, () => state, () => "preparing" as State);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(isOfflineReading());
    update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return <p role="status" className="text-xs leading-relaxed text-muted-foreground" data-offline-status={status}>
    {offline ? "Offline — downloaded comics are available on this device." : status === "ready" ? "Offline reading ready. Download comics before disconnecting." : status === "preparing" ? "Preparing the app for offline reading…" : status === "development" ? "Offline setup is available in the production build." : "Offline setup did not finish. Reopen the app online to try again."}
  </p>;
}
