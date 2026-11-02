"use client"

import React, { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, BookOpen, Check, ChevronRight, Folder } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ContinueCard } from "@/components/continue-card"
import { LibraryHeader } from "@/components/library-header"
import { cn, formatFileSize } from "@/lib/utils"
import { formatFolderTitle, parseComicName } from "@/lib/comic-name"
import { db } from "@/lib/dexieDB"


// Types
interface FileItem {
  id: string
  name: string
  type: "file"
  size?: number
  readStatus?: "completed" | "in_progress" | "unread"
  totalPages?: number
  lastPage?: number
  extension?: string
  link?: string
}

interface FolderItem {
  id: string
  name: string
  type: "folder"
  children: (FileItem | FolderItem)[]
}

type FileSystemItem = FileItem | FolderItem

interface FileManagerProps {
  data: FileSystemItem | FileSystemItem[] | null
  className?: string
  lastFolderId?: string
}

type SortKey = "name" | "size" | "type"
type SortDirection = "asc" | "desc"

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "size", label: "Size" },
  { key: "type", label: "Type" },
]

// Helper function to check if an item is a folder
const isFolder = (item: FileSystemItem): item is FolderItem => {
  return item.type === "folder"
}

// Wraps the catalog in a single root folder; the remote catalog arrives as a bare list of items
const toRootFolder = (data: FileSystemItem | FileSystemItem[]): FolderItem => {
  if (!Array.isArray(data) && isFolder(data)) return data
  return { id: "0", name: "Root", type: "folder", children: Array.isArray(data) ? data : [data] }
}

// Helper function to build path to a folder
const buildPathToFolder = (folder: FolderItem, folderId: string): FolderItem[] | null => {
  if (folder.id === folderId) return [folder]

  for (const child of folder.children) {
    if (isFolder(child)) {
      const path = buildPathToFolder(child, folderId)
      if (path) return [folder, ...path]
    }
  }

  return null
}

// Helper function to find a file and the folders that contain it
const findFileWithAncestors = (
  folder: FolderItem,
  fileId: string
): { file: FileItem; ancestorIds: string[] } | null => {
  for (const child of folder.children) {
    if (isFolder(child)) {
      const found = findFileWithAncestors(child, fileId)
      if (found) return { file: found.file, ancestorIds: [child.id, ...found.ancestorIds] }
    } else if (child.id === fileId) {
      return { file: child, ancestorIds: [] }
    }
  }

  return null
}

// Totals every file below a folder, including nested folders
const getFolderTotals = (folder: FolderItem): { files: number; size: number } => {
  return folder.children.reduce(
    (totals, child) => {
      if (isFolder(child)) {
        const nested = getFolderTotals(child)
        return { files: totals.files + nested.files, size: totals.size + nested.size }
      }
      return { files: totals.files + 1, size: totals.size + (child.size || 0) }
    },
    { files: 0, size: 0 }
  )
}

const pluralize = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`

const compareNames = (a: FileSystemItem, b: FileSystemItem) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })

// Sorts folders first, then files. Folders have no type, so they stay in name order for that key.
const sortItems = (items: FileSystemItem[], sortKey: SortKey, sortDirection: SortDirection) => {
  const direction = sortDirection === "asc" ? 1 : -1
  const folderSizes = new Map(
    items.filter(isFolder).map((folder) => [folder.id, getFolderTotals(folder).size])
  )

  const compare = (a: FileSystemItem, b: FileSystemItem) => {
    if (isFolder(a) !== isFolder(b)) return isFolder(a) ? -1 : 1

    if (sortKey === "size") {
      const sizeA = isFolder(a) ? folderSizes.get(a.id) || 0 : a.size || 0
      const sizeB = isFolder(b) ? folderSizes.get(b.id) || 0 : b.size || 0
      if (sizeA !== sizeB) return (sizeA - sizeB) * direction
    } else if (sortKey === "type" && !isFolder(a) && !isFolder(b)) {
      const byType = (a.extension || "").localeCompare(b.extension || "")
      if (byType !== 0) return byType * direction
    }
    return compareNames(a, b) * direction
  }

  return [...items].sort(compare)
}

function SortArrow({ direction }: { direction: SortDirection }) {
  const Icon = direction === "asc" ? ArrowUp : ArrowDown
  return <Icon aria-hidden="true" className="size-3" strokeWidth={2.2} />
}

interface SortControlProps {
  sortKey: SortKey
  sortDirection: SortDirection
  onSort: (key: SortKey) => void
}

function SortControl({ sortKey, sortDirection, onSort }: SortControlProps) {
  const directionLabel = sortDirection === "asc" ? "ascending" : "descending"
  const activeLabel = SORT_OPTIONS.find((option) => option.key === sortKey)?.label

  return (
    <>
      {/* Tablet and desktop: segmented control */}
      <div role="group" aria-label="Sort" className="hidden rounded-[10px] border bg-card p-[3px] sm:flex">
        {SORT_OPTIONS.map(({ key, label }) => {
          const isActive = key === sortKey
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isActive}
              aria-label={isActive ? `Sort by ${label}, ${directionLabel}` : `Sort by ${label}`}
              onClick={() => onSort(key)}
              className={cn(
                "flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[7px] px-3 text-[13px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
              {isActive && <SortArrow direction={sortDirection} />}
            </button>
          )
        })}
      </div>

      {/* Phone: compact menu. Choosing the active option again reverses it, like the segmented control. */}
      <div className="sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Sort by ${activeLabel}, ${directionLabel}. Change sort`}
            className="flex min-h-11 items-center gap-1.5 rounded-[9px] border bg-card px-3 text-[13px] text-card-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {activeLabel}
            <SortArrow direction={sortDirection} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={sortKey} onValueChange={(value) => onSort(value as SortKey)}>
              {SORT_OPTIONS.map(({ key, label }) => (
                <DropdownMenuRadioItem key={key} value={key} className="min-h-11 gap-3">
                  {label}
                  {key === sortKey && <SortArrow direction={sortDirection} />}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  )
}

function ReadStateIndicator({ file }: { file: FileItem }) {
  if (file.readStatus === "completed") {
    return (
      <span role="img" aria-label="Read" title="Read" className="flex w-4 shrink-0 justify-center text-muted-foreground">
        <Check aria-hidden="true" className="size-4" strokeWidth={2} />
      </span>
    )
  }
  if (file.readStatus === "in_progress") {
    return (
      <span role="img" aria-label="In progress" title="In progress" className="flex w-4 shrink-0 justify-center text-primary">
        <BookOpen aria-hidden="true" className="size-4" strokeWidth={1.8} />
      </span>
    )
  }
  return (
    <span className="flex w-4 shrink-0 justify-center">
      <span role="img" aria-label="Unread" title="Unread" className="size-2 rounded-full bg-primary" />
    </span>
  )
}

function FileRow({ file, onOpen }: { file: FileItem; onOpen: (file: FileItem) => void }) {
  const { title, number, metadata } = parseComicName(file.name, file.extension)
  const showPages = file.readStatus === "in_progress" && !!file.lastPage

  return (
    <Link
      href={`/read/${file.id}`}
      prefetch={false}
      title={file.name}
      onClick={() => onOpen(file)}
      className="flex min-h-16 items-center gap-3 px-1 py-2 outline-none transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 sm:gap-5 sm:px-3"
    >
      <span className="min-w-7 shrink-0 font-mono text-sm text-muted-foreground">{number}</span>
      <span className="flex min-w-0 flex-auto flex-col gap-[3px]">
        <span className="truncate text-[15px] font-medium sm:text-base">{title}</span>
        <span className="truncate text-[13px] text-muted-foreground">
          {showPages && (
            <span className="font-mono text-foreground">
              <span className="sr-only">Page {file.lastPage}{file.totalPages ? ` of ${file.totalPages}` : ""}</span>
              <span aria-hidden="true">{file.lastPage}{file.totalPages ? ` / ${file.totalPages}` : ""}</span>
              {metadata && " · "}
            </span>
          )}
          {metadata}
        </span>
      </span>
      <span className="font-mono text-xs whitespace-nowrap text-muted-foreground sm:text-[13px]">
        {file.size ? formatFileSize(file.size) : "—"}
      </span>
      <ReadStateIndicator file={file} />
    </Link>
  )
}

function FolderRow({
  folder,
  holdsLastRead,
  onOpen,
}: {
  folder: FolderItem
  holdsLastRead: boolean
  onOpen: (folder: FolderItem) => void
}) {
  return (
    <button
      type="button"
      title={folder.name}
      onClick={() => onOpen(folder)}
      className="flex min-h-14 w-full items-center gap-3.5 px-1 text-left outline-none transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 sm:min-h-[60px] sm:gap-4 sm:px-3"
    >
      <Folder
        aria-hidden="true"
        className={cn("size-5 shrink-0", holdsLastRead ? "text-primary" : "text-muted-foreground")}
        strokeWidth={1.7}
      />
      <span className="min-w-0 flex-auto truncate text-[15px] font-medium sm:text-base">{folder.name}</span>
      {holdsLastRead && <span className="sr-only">Contains your last-read comic</span>}
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
    </button>
  )
}

export function FileManager({ data, className, lastFolderId = "0" }: FileManagerProps) {
  const [currentFolderId, setCurrentFolderId] = useState(lastFolderId)
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")
  const [lastReadId, setLastReadId] = useState<string | null>(null)

  // Restore the remembered folder once it has loaded
  useEffect(() => {
    setCurrentFolderId(lastFolderId)
  }, [lastFolderId])

  // Load last read comic when data is available
  useEffect(() => {
    if (!data) return

    db.getLastReadComic().then(comicId => {
      setLastReadId(comicId ?? null)
    }).catch(error => {
      console.error("Failed to get last read comic:", error)
    })
  }, [data])

  const root = useMemo(() => (data ? toRootFolder(data) : null), [data])

  // The path is looked up by ID so a background catalog refresh keeps the open folder.
  // A remembered folder that no longer exists falls back to the root.
  const path = useMemo(() => {
    if (!root) return []
    return buildPathToFolder(root, currentFolderId) ?? [root]
  }, [root, currentFolderId])
  const currentFolder = path[path.length - 1]

  const lastRead = useMemo(
    () => (root && lastReadId ? findFileWithAncestors(root, lastReadId) : null),
    [root, lastReadId]
  )

  const sortedItems = useMemo(
    () => (currentFolder ? sortItems(currentFolder.children, sortKey, sortDirection) : []),
    [currentFolder, sortKey, sortDirection]
  )

  const totals = useMemo(() => (currentFolder ? getFolderTotals(currentFolder) : null), [currentFolder])

  if (!root || !currentFolder || !totals) return null

  // Function to navigate to a folder
  const navigateToFolder = (folderId: string) => {
    setCurrentFolderId(folderId)
    window.scrollTo({ top: 0 })

    // Update last folder in DB
    db.setLastFolder(folderId)
  }

  const handleFileClick = (file: FileItem) => {
    // Use markComicStatus instead of the non-existent markComicAsRead

    const file_status = file.readStatus? file.readStatus : "in_progress"
    const last_page = file.lastPage? file.lastPage : 0
    db.markComicStatus(file.id, file_status, last_page, file.totalPages ?? 0)

    // Set as last read comic
    db.setLastReadComic(file.id)
  }

  // Toggle sort direction or change sort key
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDirection("asc")
    }
  }

  const isRoot = path.length === 1
  const folderCount = currentFolder.children.filter(isFolder).length
  const directFileCount = currentFolder.children.length - folderCount
  const rootCounts = [
    pluralize(folderCount, "folder"),
    ...(directFileCount > 0 ? [pluralize(directFileCount, "file")] : []),
  ].join(" · ")
  const folderSummary = [
    ...(folderCount > 0 ? [pluralize(folderCount, "folder")] : []),
    pluralize(totals.files, "file"),
    formatFileSize(totals.size),
  ].join(" · ")

  const sortControl = <SortControl sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[880px] flex-col px-4 pt-3 pb-6 sm:px-6 sm:pt-7 sm:pb-16",
        isRoot ? "gap-7 sm:gap-10" : "gap-7 sm:gap-9",
        className
      )}
    >
      <LibraryHeader path={path} onNavigate={navigateToFolder} />

      {isRoot && <h1 className="sr-only">Library</h1>}
      {isRoot && lastRead && <ContinueCard comic={lastRead.file} />}

      <section className="flex flex-col">
        {isRoot ? (
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3 sm:pb-4">
            <h2 className="text-[13px] font-medium text-muted-foreground">{rootCounts}</h2>
            {sortControl}
          </div>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-4 pb-4 sm:pb-5">
            <div className="flex min-w-0 flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] break-words sm:text-[32px] sm:leading-tight">
                {formatFolderTitle(currentFolder.name)}
              </h1>
              <div className="font-mono text-xs text-muted-foreground">{folderSummary}</div>
            </div>
            {sortControl}
          </div>
        )}

        {sortedItems.length > 0 ? (
          <ul className="divide-y border-y">
            {sortedItems.map((item) => (
              <li key={item.id}>
                {isFolder(item) ? (
                  <FolderRow
                    folder={item}
                    holdsLastRead={!!lastRead?.ancestorIds.includes(item.id)}
                    onOpen={(folder) => navigateToFolder(folder.id)}
                  />
                ) : (
                  <FileRow file={item} onOpen={handleFileClick} />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-y py-12 text-center text-sm text-muted-foreground">
            {isRoot ? "Your library is empty" : "This folder is empty"}
          </p>
        )}
      </section>
    </div>
  )
}
