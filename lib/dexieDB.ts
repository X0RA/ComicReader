import Dexie, { Table } from "dexie";
import { ContentItem, File, Folder } from "./types";

// Define interfaces for database tables
export interface ReadComic {
  id: string;
  status: "in_progress" | "completed" | "unread";
  lastPage: number;
  totalPages: number;
}

export interface LastRead {
  id: string;
  timestamp: number;
}

export interface LastFolder {
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

export interface ComicDownloadMetadata {
  id: string;
  url: string;
  status: ComicDownloadStatus;
  progress: number;
  downloadedAt?: number;
  error?: string;
  data?: Blob; // Store the full comic file directly
  fileSize?: number; // Size of the file in bytes
}

export interface DownloadRecord {
  id: string; url: string; name?: string; previous?: DownloadRecord;
  status: ComicDownloadStatus; progress: number;
  backend: "idb" | "opfs"; archiveFile?: string; pendingFile?: string; token?: string;
  fileSize?: number; receivedBytes?: number; downloadedAt?: number; lastAccessedAt?: number; error?: string;
}

export interface ComicBookmark {
  comicId: string;
  comicName: string;
  page: number;
  note: string;
  createdAt: number;
  updatedAt: number;
}

class ComicsDatabase extends Dexie {
  bookmarks!: Table<ComicBookmark, [string, number]>;
  downloads!: Table<DownloadRecord>;
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
    this.version(3).stores({ downloads: "id, status, lastAccessedAt" }).upgrade(async tx => {
      const records: DownloadRecord[] = [];
      await tx.table("comicDownloads").each(row => {
        if (row.status === "completed" && row.data) {
          const { data, ...metadata } = row;
          records.push({ ...metadata, backend: "idb", fileSize: data.size, lastAccessedAt: row.downloadedAt });
        }
      });
      await tx.table("downloads").bulkPut(records);
    });
    this.version(4).stores({ bookmarks: "[comicId+page], comicId, updatedAt" });
  }

  // Store the entire comics data - fixed type error
  async storeComicsData(data: ContentItem[]): Promise<void> {
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
