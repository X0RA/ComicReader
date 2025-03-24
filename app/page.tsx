'use client'
import { useEffect, useState } from "react";
import { db } from "@/lib/dexieDB";
import { FileManager } from "@/components/file-manager";
import { Loader2 } from "lucide-react";
import { ContentItem } from "@/lib/types";

export default function Home() {
  const [comicsData, setComicsData] = useState<ContentItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastFolderId, setLastFolderId] = useState<string>("0"); // Default to "0" if no last folder

  useEffect(() => {
    // Load the last folder ID
    db.getLastFolder().then((id) => {
      if (id) {
        setLastFolderId(id);
      }
    });

    // First load from local IndexedDB for faster initial render
    db.getComicsData().then((localData) => {
      if (localData) {
        setComicsData(localData);
        setIsLoading(false);
      }
      
      // Then fetch fresh data from remote in the background
      db.updateFromRemoteDB().then((freshData) => {
        setComicsData(freshData);
        setIsLoading(false);
      }).catch((error) => {
        console.error("Failed to fetch remote data:", error);
        // If we already have local data, we can continue with that
        if (localData) setIsLoading(false);
      });
    }).catch((error) => {
      console.error("Failed to load data:", error);
      setIsLoading(false);
    });
  }, []);


  return (
    <div>
      {isLoading ? (
        <div className="flex justify-center items-center h-screen">
          <Loader2 className="w-10 h-10 animate-spin" />
        </div>
      ) : (
        // @ts-ignore
        <FileManager data={comicsData} lastFolderId={lastFolderId} />
      )}
    </div> 
  );
}
