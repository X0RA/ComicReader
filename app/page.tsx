'use client'
import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/dexieDB";
import { FileManager } from "@/components/file-manager";
import { LibraryHeader } from "@/components/library-header";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { ContentItem } from "@/lib/types";

// fetch has no timeout of its own, so a stalled catalog request would otherwise spin forever
const LOAD_TIMEOUT_MS = 20000;

export default function Home() {
  const [comicsData, setComicsData] = useState<ContentItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastFolderId, setLastFolderId] = useState<string>("0"); // Default to "0" if no last folder
  const hasData = useRef(false);
  const currentAttempt = useRef(0);
  const loadTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadLibrary = useCallback(() => {
    const attempt = ++currentAttempt.current;
    setIsLoading(true);
    setLoadError(null);

    const showData = (data: ContentItem[]) => {
      if (attempt !== currentAttempt.current) return;
      hasData.current = true;
      clearTimeout(loadTimeout.current);
      setComicsData(data);
      setLoadError(null);
      setIsLoading(false);
    };

    // Only the latest attempt reports failure, and never over a library that is already showing
    const showError = (message: string) => {
      if (attempt !== currentAttempt.current || hasData.current) return;
      clearTimeout(loadTimeout.current);
      setLoadError(message);
      setIsLoading(false);
    };

    clearTimeout(loadTimeout.current);
    loadTimeout.current = setTimeout(() => {
      showError("The catalog is taking too long to respond, and there's no saved copy on this device.");
    }, LOAD_TIMEOUT_MS);

    // Load the last folder ID
    db.getLastFolder().then((id) => {
      if (id) {
        setLastFolderId(id);
      }
    }).catch((error) => {
      console.error("Failed to load last folder:", error);
    });

    // First load from local IndexedDB for faster initial render
    db.getComicsData().then((localData) => {
      if (localData) {
        showData(localData);
      }

      // Then fetch fresh data from remote in the background
      db.updateFromRemoteDB().then((freshData) => {
        showData(freshData);
      }).catch((error) => {
        console.error("Failed to fetch remote data:", error);
        // If we already have local data, we can continue with that
        showError("We couldn't reach the catalog, and there's no saved copy on this device. Check your connection and try again.");
      });
    }).catch((error) => {
      console.error("Failed to load data:", error);
      showError("This browser couldn't open the library's local storage. Reload the page or check its storage settings, then try again.");
    });
  }, []);

  useEffect(() => {
    loadLibrary();
    return () => {
      currentAttempt.current++;
      clearTimeout(loadTimeout.current);
    };
  }, [loadLibrary]);

  if (comicsData) {
    return <FileManager data={comicsData} lastFolderId={lastFolderId} />;
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[880px] flex-col gap-7 px-4 pt-3 pb-6 sm:gap-10 sm:px-6 sm:pt-7 sm:pb-16">
      <LibraryHeader />
      {isLoading || !loadError ? (
        <div role="status" className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-8 animate-spin" />
          <span className="sr-only">Loading your library</span>
        </div>
      ) : (
        <div role="alert" className="flex flex-col items-start gap-4 rounded-2xl border bg-card p-5 text-card-foreground sm:p-6">
          <div className="flex items-start gap-3">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" strokeWidth={1.8} />
            <div className="flex flex-col gap-1.5">
              <h1 className="text-base font-semibold sm:text-lg">Couldn&apos;t load your library</h1>
              <p className="text-sm text-muted-foreground">{loadError}</p>
            </div>
          </div>
          <Button type="button" onClick={loadLibrary} className="h-11 px-5">
            <RotateCw aria-hidden="true" />
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
