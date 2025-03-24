import Dexie, { Table } from "dexie";
import { ContentItem, File, Folder } from "./types";

// Define interfaces for database tables
interface ReadComic {
  id: string;
  status: "in_progress" | "completed" | "unread";
  lastPage: number;
  totalPages: number;
}

interface LastRead {
  id: string;
  timestamp: number;
}

interface LastFolder {
  id: string;
  timestamp: number;
}

// Root content container to solve the type error
interface ComicsRoot {
  id: string; // Will always be "root"
  content: ContentItem[];
}

// Define types for downloaded comics
type ComicDownloadStatus = "in_progress" | "completed" | "failed";

interface ComicDownloadMetadata {
  id: string;
  url: string;
  status: ComicDownloadStatus;
  progress: number;
  downloadedAt?: number;
  error?: string;
  data?: Blob; // Store the full comic file directly
  fileSize?: number; // Size of the file in bytes
}

class ComicsDatabase extends Dexie {
  comics!: Table<ComicsRoot>;
  readComics!: Table<ReadComic>;
  lastReadComic!: Table<LastRead>;
  lastFolder!: Table<LastFolder>;
  comicDownloads!: Table<ComicDownloadMetadata>;

  constructor() {
    super("ComicsDatabase");

    // Define tables and their primary keys
    this.version(2).stores({
      comics: "id", // Now we use id as primary key
      readComics: "id",
      lastReadComic: "id",
      lastFolder: "id",
      comicDownloads: "id, status, downloadedAt", // Store full blob in this table
    });
  }

  // Store the entire comics data - fixed type error
  async storeComicsData(data: ContentItem[]): Promise<void> {
    // Clear existing data first
    await this.comics.clear();
    // Store new data with a wrapper object
    await this.comics.put({ id: "root", content: data });
  }

  // Get comics data
  async getComicsData(): Promise<ContentItem[] | undefined> {
    const root = await this.comics.get("root");
    if (!root) return undefined;

    // Get read comics to update the status
    const readComics = await this.getReadComics();
    const statusMap = new Map(
      readComics.map((item) => [
        item.id,
        { status: item.status, lastPage: item.lastPage, totalPages: item.totalPages },
      ])
    );

    // Update status in the data before returning
    this.updateStatusInData(root.content, statusMap);

    return root.content;
  }

  // Get comic status
  async getComicStatus(id: string): Promise<ReadComic | undefined> {
    return await this.readComics.get(id);
  }

  // Mark comic status
  async markComicStatus(
    id: string,
    status: "in_progress" | "completed" | "unread",
    lastPage: number = 0,
    totalPages: number = 0
  ): Promise<void> {
    await this.readComics.put({ id, status, lastPage, totalPages });

    // Also update in the comics data if it's loaded
    const root = await this.comics.get("root");
    if (root) {
      this.updateStatusForId(root.content, id, status, lastPage, totalPages);
      await this.comics.put(root);
    }
  }

  async setTotalPages(id: string, totalPages: number): Promise<void> {
    const comic = await this.readComics.get(id);
    if (comic) {
      // If the comic exists, preserve the existing status and lastPage
      await this.readComics.put({ ...comic, totalPages });
    } else {
      // If the comic doesn't exist yet, create a new record with default values
      await this.readComics.put({ 
        id, 
        status: "unread", 
        lastPage: 0, 
        totalPages 
      });
    }

    // Also update in the comics data if it's loaded (similar to markComicStatus)
    const root = await this.comics.get("root");
    if (root) {
      this.updateStatusForId(root.content, id, comic?.status || "unread", comic?.lastPage || 0, totalPages);
      await this.comics.put(root);
    }
  }

  // Get all read comics
  async getReadComics(): Promise<ReadComic[]> {
    return await this.readComics.toArray();
  }

  // Check if a comic is read (either completed or in-progress)
  async isComicRead(id: string): Promise<boolean> {
    const comic = await this.readComics.get(id);
    return comic?.status === "completed" || comic?.status === "in_progress";
  }

  // Set last read comic
  async setLastReadComic(id: string): Promise<void> {
    // Clear existing entries
    await this.lastReadComic.clear();
    await this.lastReadComic.put({ id, timestamp: Date.now() });
  }

  // Get last read comic
  async getLastReadComic(): Promise<string | undefined> {
    const lastRead = await this.lastReadComic.toArray();
    if (lastRead.length === 0) return undefined;

    // Sort by timestamp to get the most recent
    return lastRead.sort((a, b) => b.timestamp - a.timestamp)[0].id;
  }

  // Set last opened folder
  async setLastFolder(id: string): Promise<void> {
    // Clear existing entries
    await this.lastFolder.clear();
    await this.lastFolder.put({ id, timestamp: Date.now() });
  }

  // Get last opened folder
  async getLastFolder(): Promise<string | undefined> {
    const lastFolder = await this.lastFolder.toArray();
    if (lastFolder.length === 0) return undefined;

    // Sort by timestamp to get the most recent
    return lastFolder.sort((a, b) => b.timestamp - a.timestamp)[0].id;
  }

  // Update comics data from the remote DB
  async updateFromRemoteDB(): Promise<ContentItem[]> {
    try {
      const response = await fetch("https://comic.xora.space/contents.json");
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const rawData = await response.json();

      // Extract data from the response based on its structure
      let data: ContentItem[];

      if (Array.isArray(rawData)) {
        data = rawData as ContentItem[];
      } else if (rawData && typeof rawData === "object") {
        if ("children" in rawData && rawData.type === "folder") {
          // Handle case where API returns a root folder object with children
          data = (rawData as Folder).children;
        } else if ("content" in rawData) {
          // Handle case where API returns {content: [...]} structure
          data = (rawData as { content: ContentItem[] }).content;
        } else {
          console.error("Unexpected data format:", rawData);
          throw new Error("Invalid data format from remote API");
        }
      } else {
        console.error("Unexpected data format:", rawData);
        throw new Error("Invalid data format from remote API");
      }

      // Get comic status
      const readComics = await this.getReadComics();
      const statusMap = new Map(
        readComics.map((item) => [
          item.id,
          { status: item.status, lastPage: item.lastPage, totalPages: item.totalPages },
        ])
      );

      // Update status in the fetched data
      this.updateStatusInData(data, statusMap);

      // Sort folder contents
      this.sortFolderContents(data);

      // Store the updated data
      await this.storeComicsData(data);

      return data;
    } catch (error) {
      console.error("Failed to update from remote DB:", error);

      // Try to return local data if available
      const localData = await this.getComicsData();
      if (localData) return localData;

      throw error; // Re-throw if no local data
    }
  }

  /**
   * Downloads a comic in full and stores it in IndexedDB.
   * Simplified version that downloads the entire file at once.
   */
  async downloadComic(comic: {
    id: string;
    url: string;
  }): Promise<ComicDownloadMetadata> {
    // Check if already downloaded
    let meta = await this.comicDownloads.get(comic.id);
    if (meta?.status === "completed" && meta?.data) {
      return meta;
    }

    // Initialize metadata
    meta = {
      id: comic.id,
      url: comic.url,
      status: "in_progress",
      progress: 0,
    };
    await this.comicDownloads.put(meta);

    // Set up AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout

    try {
      // Simple fetch request
      const response = await this.retryFetch(comic.url, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Network response error: ${response.status} ${response.statusText}`);
      }

      clearTimeout(timeoutId);

      // Get total size for progress reporting
      const contentLength = Number(response.headers.get("Content-Length") || "0");
      
      // Update progress to indicate we've started
      meta.progress = 1;
      meta.fileSize = contentLength;
      await this.comicDownloads.put(meta);

      // Get the entire file as a blob
      const data = await response.blob();

      // Mark as completed
      meta.status = "completed";
      meta.progress = 100;
      meta.downloadedAt = Date.now();
      meta.data = data; // Store the entire file
      await this.comicDownloads.put(meta);

      // Enforce storage limits
      await this.enforceComicLimit();

      return meta;
    } catch (error: any) {
      clearTimeout(timeoutId);

      // Handle abort errors specially
      if (error.name === "AbortError") {
        meta.status = "failed";
        meta.error = "Download timed out";
      } else {
        meta.status = "failed";
        meta.error = error.message || "Download failed";
      }

      await this.comicDownloads.put(meta);
      throw error;
    }
  }

  /**
   * Simplified retry mechanism
   */
  private async retryFetch(url: string, options: RequestInit = {}, attempts = 3): Promise<Response> {
    let lastError;

    for (let i = 0; i < attempts; i++) {
      try {
        return await fetch(url, options);
      } catch (err) {
        lastError = err;
        // Wait before retry (exponential backoff)
        if (i < attempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (2 ** i)));
        }
      }
    }

    throw lastError;
  }

  /**
   * Preloads a comic in the background.
   */
  async preloadComic(comic: { id: string; url: string }): Promise<void> {
    this.downloadComic(comic).catch((error) => {
      console.error(`Preload failed for comic ${comic.id}:`, error);
    });
  }

  /**
   * Enforces that no more than 10 comics are stored.
   * Removes the oldest comics if necessary.
   */
  private async enforceComicLimit(): Promise<void> {
    const completed = await this.comicDownloads
      .where("status")
      .equals("completed")
      .toArray();
    
    if (completed.length > 10) {
      // Sort by downloadedAt ascending (oldest first)
      completed.sort(
        (a, b) => (a.downloadedAt || 0) - (b.downloadedAt || 0)
      );
      
      // Delete the oldest comics
      const toDelete = completed.slice(0, completed.length - 10);
      for (const record of toDelete) {
        await this.comicDownloads.delete(record.id);
      }
    }
  }

  /**
   * Gets a downloaded comic as a Blob.
   * Returns null if the comic is not found or not completely downloaded.
   */
  async getDownloadedComic(comicId: string): Promise<Blob | null> {
    const meta = await this.comicDownloads.get(comicId);
    if (!meta || meta.status !== "completed" || !meta.data) {
      return null;
    }
    
    return meta.data;
  }

  /**
   * Gets the download status of a comic.
   */
  async getComicDownloadStatus(comicId: string): Promise<ComicDownloadMetadata | null> {
    const meta = await this.comicDownloads.get(comicId);
    if (!meta) return null;
    
    // Don't include the blob in the status to keep the response size small
    const { data, ...statusInfo } = meta;
    return statusInfo;
  }

  /**
   * Gets a list of all downloaded comics.
   */
  async getDownloadedComics(): Promise<ComicDownloadMetadata[]> {
    const comics = await this.comicDownloads
      .where("status")
      .equals("completed")
      .sortBy("downloadedAt");
    
    // Don't include the blob data in the list
    return comics.map(({ data, ...info }) => info);
  }

  /**
   * Deletes a downloaded comic.
   */
  async deleteDownloadedComic(comicId: string): Promise<void> {
    await this.comicDownloads.delete(comicId);
  }

  // Helper function to update status in the data using a Map for efficiency
  private updateStatusInData(
    data: ContentItem[],
    statusMap: Map<string, { status: string; lastPage: number; totalPages: number }>
  ): void {
    const processItem = (item: ContentItem) => {
      if (item.type === "file") {
        const file = item as File;
        const statusInfo = statusMap.get(item.id);

        if (statusInfo) {
          file.readStatus = statusInfo.status as "in_progress" | "completed" | "unread";
          file.lastPage = statusInfo.lastPage;
          file.totalPages = statusInfo.totalPages;
        } else {
          file.readStatus = "unread";
          file.lastPage = 0;
          file.totalPages = 0;
        }
      } else if (item.type === "folder") {
        const folder = item as Folder;
        folder.children.forEach(processItem);
      }
    };

    data.forEach(processItem);
  }

  // Helper to update status for a specific ID
  private updateStatusForId(
    data: ContentItem[],
    id: string,
    status: "in_progress" | "completed" | "unread",
    lastPage: number,
    totalPages?: number
  ): void {
    const processItem = (item: ContentItem) => {
      if (item.type === "file" && item.id === id) {
        const file = item as File;
        file.readStatus = status;
        file.lastPage = lastPage;
        if (totalPages !== undefined) {
          file.totalPages = totalPages;
        }
        return true; // Found and updated
      } else if (item.type === "folder") {
        const folder = item as Folder;
        for (const child of folder.children) {
          if (processItem(child)) {
            return true; // Propagate found status up
          }
        }
      }
      return false; // Not found in this branch
    };

    data.forEach(processItem);
  }

  // Helper function to sort folder contents
  private sortFolderContents(data: ContentItem[]): void {
    const sortItems = (items: ContentItem[]) => {
      items.sort((a, b) => a.name.localeCompare(b.name));

      // Recursively sort children of folders
      items.forEach((item) => {
        if (item.type === "folder") {
          sortItems((item as Folder).children);
        }
      });
    };

    sortItems(data);
  }
}

// Create and export a singleton instance
export const db = new ComicsDatabase();
