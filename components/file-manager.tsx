"use client"

import React, { useState, useEffect } from "react"
import { File, Folder, ChevronRight, ArrowUpDown, ArrowDown, ArrowUp, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { formatFileSize } from "@/lib/utils"
import { useRouter } from "next/navigation"
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
  data: FileSystemItem | null
  className?: string
  lastFolderId?: string
}

type SortKey = "name" | "size" | "type"
type SortDirection = "asc" | "desc"

// Helper function to check if an item is a folder
const isFolder = (item: FileSystemItem): item is FolderItem => {
  return item.type === "folder"
}

// Helper function to find a folder by ID in a nested structure
const findFolderById = (items: FileSystemItem | FileSystemItem[] | null, id: string): FolderItem | null => {
  if (!items) return null
  
  const itemArray = Array.isArray(items) ? items : [items]
  
  for (const item of itemArray) {
    if (item.id === id && isFolder(item)) {
      return item
    }
    
    if (isFolder(item)) {
      const found = findFolderById(item.children, id)
      if (found) return found
    }
  }
  
  return null
}

// Helper function to build path to a folder
const buildPathToFolder = (
  items: FileSystemItem | FileSystemItem[] | null, 
  folderId: string, 
  currentPath: FolderItem[] = []
): FolderItem[] | null => {
  if (!items) return null
  
  const itemArray = Array.isArray(items) ? items : [items]
  
  for (const item of itemArray) {
    if (item.id === folderId && isFolder(item)) {
      return [...currentPath, item]
    }
    
    if (isFolder(item)) {
      const path = buildPathToFolder(item.children, folderId, [...currentPath, item])
      if (path) return path
    }
  }
  
  return null
}

export function FileManager({ data, className, lastFolderId = "0" }: FileManagerProps) {
  const [currentFolder, setCurrentFolder] = useState<FolderItem | null>(null)
  const [path, setPath] = useState<FolderItem[]>([])
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")
  const [lastReadComic, setLastReadComic] = useState<FileItem | null>(null)
  const router = useRouter()

  // Initialize when data becomes available
  useEffect(() => {
    if (!data) return
    
    const rootData = Array.isArray(data) ? data : data

    // If we have a root folder
    if (isFolder(rootData)) {
      const rootFolder = rootData as FolderItem
      
      // If lastFolderId is the root ID or "0", just set the root folder
      if (lastFolderId === rootFolder.id || lastFolderId === "0") {
        setCurrentFolder(rootFolder)
        setPath([rootFolder])
        return
      }
      
      // Try to find the last folder and navigate to it
      const lastFolder = findFolderById(rootData, lastFolderId)
      if (lastFolder) {
        const folderPath = buildPathToFolder(rootData, lastFolderId)
        if (folderPath) {
          setCurrentFolder(lastFolder)
          setPath(folderPath)
          return
        }
      }
      
      // Fallback to root if we couldn't find the last folder
      setCurrentFolder(rootFolder)
      setPath([rootFolder])
    }
    // If we have an array (multiple root items)
    else if (Array.isArray(rootData)) {
      // Create a virtual root folder
      const virtualRoot: FolderItem = {
        id: "0",
        name: "Root",
        type: "folder",
        children: rootData
      }
      
      // If lastFolderId is "0", just set the virtual root
      if (lastFolderId === "0") {
        setCurrentFolder(virtualRoot)
        setPath([virtualRoot])
        return
      }
      
      // Try to find the last folder
      const lastFolder = findFolderById(rootData, lastFolderId)
      if (lastFolder) {
        // Build path to the folder
        const pathToFolder = buildPathToFolder(virtualRoot, lastFolderId)
        if (pathToFolder) {
          setCurrentFolder(lastFolder)
          setPath(pathToFolder)
          return
        }
      }
      
      // Fallback to virtual root
      setCurrentFolder(virtualRoot)
      setPath([virtualRoot])
    }
  }, [data, lastFolderId])

  // Load last read comic when data is available
  useEffect(() => {
    if (!data) return
    
    // Get the last read comic ID
    db.getLastReadComic().then(comicId => {
      if (!comicId) return
      
      // Find the comic in our data structure
      const findComic = (items: FileSystemItem | FileSystemItem[] | null): FileItem | null => {
        if (!items) return null
        
        const itemArray = Array.isArray(items) ? items : [items]
        
        for (const item of itemArray) {
          if (item.id === comicId && item.type === "file") {
            return item as FileItem
          }
          
          if (isFolder(item)) {
            const found = findComic(item.children)
            if (found) return found
          }
        }
        
        return null
      }
      
      const comic = findComic(data)
      if (comic) {
        setLastReadComic(comic)
      }
    }).catch(error => {
      console.error("Failed to get last read comic:", error)
    })
  }, [data])

  // Function to navigate to a folder
  const navigateToFolder = (folder: FolderItem) => {
    setCurrentFolder(folder)
    
    // Find the index of the folder in the path
    const folderIndex = path.findIndex((p) => p.id === folder.id)
    
    // If found, slice the path up to that index + 1
    if (folderIndex >= 0) {
      setPath(path.slice(0, folderIndex + 1))
    } else {
      // If not found (shouldn't happen), just add it to the path
      setPath([...path, folder])
    }
    
    // Update last folder in DB
    db.setLastFolder(folder.id)
  }

  // Function to navigate to a specific path index
  const navigateToPathIndex = (index: number) => {
    const folder = path[index]
    setCurrentFolder(folder)
    setPath(path.slice(0, index + 1))
    
    // Update last folder in DB
    db.setLastFolder(folder.id)
  }

  const handleFileClick = (file: FileItem) => {
    // Use markComicStatus instead of the non-existent markComicAsRead

    const file_status = file.readStatus? file.readStatus : "in_progress"
    const last_page = file.lastPage? file.lastPage : 0
    db.markComicStatus(file.id, file_status, last_page)

    // Set as last read comic
    db.setLastReadComic(file.id)
    
    // Navigate to reader page
    router.push(`/read/${file.id}`)
  }

  // Function to navigate to parent folder
  const navigateToParent = () => {
    if (path.length > 1) {
      const parentIndex = path.length - 2
      const parentFolder = path[parentIndex]
      setCurrentFolder(parentFolder)
      setPath(path.slice(0, parentIndex + 1))
      
      // Update last folder in DB
      db.setLastFolder(parentFolder.id)
    }
  }

  // Function to handle folder click
  const handleFolderClick = (folder: FolderItem) => {
    setCurrentFolder(folder)
    setPath([...path, folder])
    
    // Update last folder in DB
    db.setLastFolder(folder.id)
  }

  // Function to sort items
  const sortItems = (items: (FileItem | FolderItem)[]) => {
    // First separate folders and files
    const folders = items.filter((item) => item.type === "folder") as FolderItem[]
    const files = items.filter((item) => item.type === "file") as FileItem[]

    // Sort folders
    const sortedFolders = [...folders].sort((a, b) => {
      if (sortKey === "name") {
        return sortDirection === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      }
      // Folders don't have size, so just sort by name for other keys
      return sortDirection === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
    })

    // Sort files
    const sortedFiles = [...files].sort((a, b) => {
      if (sortKey === "name") {
        return sortDirection === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      } else if (sortKey === "size") {
        const sizeA = a.size || 0
        const sizeB = b.size || 0
        return sortDirection === "asc" ? sizeA - sizeB : sizeB - sizeA
      } else if (sortKey === "type") {
        const extA = a.extension || ""
        const extB = b.extension || ""
        return sortDirection === "asc" ? extA.localeCompare(extB) : extB.localeCompare(extA)
      }
      return 0
    })

    // Return folders first, then files
    return [...sortedFolders, ...sortedFiles]
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

  // Get sort icon based on current sort state
  const getSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="h-4 w-4" />
    return sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
  }

  // Early return if no data available
  if (!data || !currentFolder) {
    return (
      <Card className={`w-full ${className}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-bold">File Manager</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">Loading files...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center w-full">
          <CardTitle className="text-xl font-bold">Comic Reader</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => router.push('/downloaded')} className="text-sm bg-red-200">
            Manage Storage
          </Button>
        </div>
        {/* Breadcrumb navigation */}
        <Breadcrumb className="mt-2">
          <BreadcrumbList>
            {path.map((folder, index) => (
              <React.Fragment key={folder.id}>
                <BreadcrumbItem>
                  {index === 0 ? (
                    <BreadcrumbLink onClick={() => navigateToPathIndex(0)} className="flex items-center cursor-pointer">
                      <Home className="h-4 w-4 mr-1" />
                      {folder.name}
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbLink onClick={() => navigateToPathIndex(index)} className="cursor-pointer">
                      {folder.name}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {index < path.length - 1 && <BreadcrumbSeparator />}
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        
        {/* Last Read Comic Section */}
        {lastReadComic && (
          <div className="mt-4 p-2 bg-blue-800/10 rounded-md flex justify-between items-center">
            <div className="flex items-center">
              <File className="h-4 w-4 mr-2 text-blue-500" />
              <span className="text-sm font-medium">Last Read: {lastReadComic.name}</span>
              {lastReadComic.readStatus === "in_progress" && (
                <span className="ml-2 text-xs text-muted-foreground">
                  Page {lastReadComic.lastPage} of {lastReadComic.totalPages}
                </span>
              )}
            </div>
            <Button 
              size="sm" 
              onClick={() => router.push(`/read/${lastReadComic.id}`)}
              className="text-xs bg-blue-400"
            >
              Continue Reading
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {/* Sorting controls */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={() => handleSort("name")} className="flex items-center gap-1">
            Name {getSortIcon("name")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleSort("size")} className="flex items-center gap-1">
            Size {getSortIcon("size")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleSort("type")} className="flex items-center gap-1">
            Type {getSortIcon("type")}
          </Button>
        </div>

        {/* File and folder list */}
        <div className="grid gap-2">
          {/* Parent directory button (if not at root) */}
          {path.length > 1 && (
            <div className="flex items-center p-3 rounded-md hover:bg-muted cursor-pointer" onClick={navigateToParent}>
              <Folder className="h-5 w-5 mr-2 text-blue-500" />
              <span>..</span>
            </div>
          )}

          {/* Current folder contents */}
          {isFolder(currentFolder) &&
            sortItems(currentFolder.children).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-md hover:bg-muted cursor-pointer"
                onClick={() => (isFolder(item) ? handleFolderClick(item) : handleFileClick(item))}
              >
                <div className="flex items-center">
                  {item.type === "folder" ? (
                    <Folder className="h-5 w-5 mr-2 text-blue-500" />
                  ) : (
                    <File className="h-5 w-5 mr-2 text-gray-500" />
                  )}
                  <span className="flex items-center">
                    {item.name} 
                    {item.type === "file" && (item as FileItem).readStatus === "completed" && (
                      <span className="ml-2 px-1.5 py-0.5 text-xs bg-green-100 text-green-800 rounded">Read</span>
                    )}
                    {item.type === "file" && (item as FileItem).readStatus === "in_progress" && (
                      <span className="ml-2 px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded">In Progress: Page {item.lastPage} of {item.totalPages}</span>
                    )}
                    {item.type === "file" && (item as FileItem).readStatus === "unread" && (
                      <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-100 text-red-800 rounded">Unread</span>
                    )}
                  </span>
                </div>

                <div className="flex items-center text-sm text-muted-foreground">
                  {item.type === "file" && (
                    <>
                      <span className="hidden sm:inline mr-4">{item.extension?.toUpperCase()}</span>
                      <span>{item.size ? formatFileSize(item.size) : "—"}</span>
                    </>
                  )}
                  {item.type === "folder" && <ChevronRight className="h-4 w-4 ml-1" />}
                </div>
              </div>
            ))}

          {/* Empty folder message */}
          {isFolder(currentFolder) && currentFolder.children.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">This folder is empty</div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
