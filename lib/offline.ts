export function isOfflineReading(): boolean {
  return typeof navigator !== "undefined" && (navigator.onLine === false ||
    (typeof document !== "undefined" && document.documentElement.dataset.offlineApp === "true"));
}
