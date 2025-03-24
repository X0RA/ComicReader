// Base type for both files and folders
export interface BaseItem {
    id: string;
    name: string;
    type: "folder" | "file";
}

// Folder type extends BaseItem and includes an array of children items
export interface Folder extends BaseItem {
    type: "folder";
    children: ContentItem[];
}

// File type extends BaseItem with file-specific properties
export interface File extends BaseItem {
    type: "file";
    size: number;
    readStatus: "in_progress" | "completed" | "unread";
    lastPage: number;
    totalPages: number;
    extension: string;
    link: string;
}



// A union type representing either a Folder or a File
export type ContentItem = Folder | File;