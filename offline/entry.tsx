import { Suspense, useSyncExternalStore, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { ThemeControls } from "../components/theme-controls";
import { Toaster } from "../components/ui/sonner";
import OfflineSupport from "../components/offline-support";
import Home from "../app/page";
import { ReaderFullscreenProvider } from "../app/read/[id]/_fullscreen";
import Reader from "../app/read/[id]/page";
import Bookmarks from "../app/bookmarks/page";
import Downloaded from "../app/downloaded/page";
import Backup from "../components/backup-page";
import Import from "../app/import/page";

function route() {
  const path = location.pathname.replace(/\/$/, "") || "/";
  let page;
  try {
    if (path.startsWith("/read/")) {
      const id = decodeURIComponent(path.slice(6));
      const query = new URLSearchParams(location.search);
      page = <Reader params={Promise.resolve({ id })} searchParams={Promise.resolve({ page: query.get("page") ?? undefined })} />;
    } else if (path === "/bookmarks") page = <Bookmarks />;
    else if (path === "/downloaded") page = <Downloaded />;
    else if (path === "/backup") page = <Backup />;
    else if (path === "/import") page = <Import />;
    else if (path.startsWith("/import/")) page = <Backup token={decodeURIComponent(path.slice(8))} />;
    else page = <Home />;
  } catch { page = <p>That address could not be opened. <a href="/">Return to library</a></p>; }
  return page;
}
function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener("offline-navigation", listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener("offline-navigation", listener);
  };
}
function App() {
  const locationKey = useSyncExternalStore(subscribe, () => location.pathname + location.search);
  const page = useMemo(route, [locationKey]);
  const content = <Suspense key={locationKey} fallback={<p role="status">Opening your library…</p>}>{page}</Suspense>;
  return location.pathname.startsWith("/read/") ? <ReaderFullscreenProvider>{content}</ReaderFullscreenProvider> : content;
}
createRoot(document.getElementById("offline-root")!).render(<ThemeControls><OfflineSupport /><App /><Toaster /></ThemeControls>);
