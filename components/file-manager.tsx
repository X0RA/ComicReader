"use client"

import { useState } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronRight, File, FileText, Folder, FolderPlus, Home, Trash2, Upload } from "lucide-react"
import { cn } from "@/lib/utils"

// Types
type FileType = {
  id: string
  name: string
  size: number
  folderId: string
  createdAt: Date
}

type FolderType = {
  id: string
  name: string
  parentId: string | null
}

// Dummy data
const initialFolders: FolderType[] = [
  { id: "root", name: "Root", parentId: null },
  { id: "f1", name: "Documents", parentId: "root" },
  { id: "f2", name: "Images", parentId: "root" },
  { id: "f3", name: "Work", parentId: "f1" },
  { id: "f4", name: "Personal", parentId: "f1" },
]

const initialFiles: FileType[] = [
  {
    id: "file1",
    name: "report.pdf",
    size: 2500000,
    folderId: "f1",
    createdAt: new Date("2023-01-15"),
  },
  {
    id: "file2",
    name: "presentation.pptx",
    size: 5000000,
    folderId: "f1",
    createdAt: new Date("2023-02-20"),
  },
  {
    id: "file3",
    name: "vacation.jpg",
    size: 3500000,
    folderId: "f2",
    createdAt: new Date("2023-03-10"),
  },
  {
    id: "file4",
    name: "profile.png",
    size: 1200000,
    folderId: "f2",
    createdAt: new Date("2023-04-05"),
  },
  {
    id: "file5",
    name: "budget.xlsx",
    size: 1800000,
    folderId: "f3",
    createdAt: new Date("2023-05-12"),
  },
  {
    id: "file6",
    name: "notes.txt",
    size: 50000,
    folderId: "f4",
    createdAt: new Date("2023-06-18"),
  },
]

// Helper functions
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + " B"
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB"
  else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB"
  else return (bytes / 1073741824).toFixed(1) + " GB"
}

export default function FileManager() {
  const [files, setFiles] = useState<FileType[]>(initialFiles)
  const [folders, setFolders] = useState<FolderType[]>(initialFolders)
  const [currentFolderId, setCurrentFolderId] = useState<string>("root")
  const [newFolderName, setNewFolderName] = useState<string>("")
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState<boolean>(false)
  const [isMoveFileDialogOpen, setIsMoveFileDialogOpen] = useState<boolean>(false)
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [targetFolderId, setTargetFolderId] = useState<string>("root")
  const [breadcrumbs, setBreadcrumbs] = useState<FolderType[]>([initialFolders[0]])

  // Get current folder
  const currentFolder = folders.find((folder) => folder.id === currentFolderId) || initialFolders[0]

  // Get subfolders of current folder
  const subFolders = folders.filter((folder) => folder.parentId === currentFolderId)

  // Get files in current folder
  const folderFiles = files.filter((file) => file.folderId === currentFolderId)

  // Dropzone setup
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      const newFiles = acceptedFiles.map((file) => ({
        id: `file${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name: file.name,
        size: file.size,
        folderId: currentFolderId,
        createdAt: new Date(),
      }))
      setFiles([...files, ...newFiles])
    },
  })

  // Handle folder navigation
  const navigateToFolder = (folderId: string) => {
    setCurrentFolderId(folderId)

    // Update breadcrumbs
    const newBreadcrumbs: FolderType[] = []
    let currentId: string | null = folderId

    while (currentId) {
      const folder = folders.find((f) => f.id === currentId)
      if (folder) {
        newBreadcrumbs.unshift(folder)
        currentId = folder.parentId
      } else {
        currentId = null
      }
    }

    setBreadcrumbs(newBreadcrumbs)
  }

  // Create new folder
  const createNewFolder = () => {
    if (newFolderName.trim() === "") return

    const newFolder: FolderType = {
      id: `folder-${Date.now()}`,
      name: newFolderName,
      parentId: currentFolderId,
    }

    setFolders([...folders, newFolder])
    setNewFolderName("")
    setIsNewFolderDialogOpen(false)
  }

  // Delete file
  const deleteFile = (fileId: string) => {
    setFiles(files.filter((file) => file.id !== fileId))
  }

  // Move file to another folder
  const moveFile = () => {
    if (!selectedFileId) return

    setFiles(
      files.map((file) => {
        if (file.id === selectedFileId) {
          return { ...file, folderId: targetFolderId }
        }
        return file
      }),
    )

    setIsMoveFileDialogOpen(false)
    setSelectedFileId(null)
  }

  // Read file (in a real app, this would open or download the file)
  const readFile = (fileId: string) => {
    const file = files.find((f) => f.id === fileId)
    if (file) {
      alert(`Reading file: ${file.name}`)
      // In a real app, you would handle file reading/downloading here
    }
  }

  return (
    <div className="border rounded-lg shadow-sm">
      {/* Breadcrumb navigation */}
      <div className="flex items-center p-4 border-b bg-muted/20">
        <Button variant="ghost" size="sm" onClick={() => navigateToFolder("root")} className="h-8 gap-1">
          <Home className="h-4 w-4" />
          Home
        </Button>

        {breadcrumbs.slice(1).map((folder, index) => (
          <div key={folder.id} className="flex items-center">
            <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground" />
            <Button variant="ghost" size="sm" onClick={() => navigateToFolder(folder.id)} className="h-8">
              {folder.name}
            </Button>
          </div>
        ))}
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-md m-4 p-6 text-center cursor-pointer transition-colors",
          isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/20",
        )}
      >
        <input {...getInputProps()} />
        <Upload className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground mb-1">
          {isDragActive ? "Drop the files here..." : "Drag & drop files here, or click to select files"}
        </p>
        <Button size="sm" className="mt-2">
          Select Files
        </Button>
      </div>

      {/* Folder actions */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-b">
        <h3 className="font-medium">{currentFolder.name}</h3>
        <div className="flex gap-2">
          <Dialog open={isNewFolderDialogOpen} onOpenChange={setIsNewFolderDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1">
                <FolderPlus className="h-4 w-4" />
                New Folder
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Folder</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Input
                  placeholder="Folder name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                />
                <Button onClick={createNewFolder}>Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Folders and files list */}
      <div className="p-4">
        {/* Folders */}
        {subFolders.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Folders</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {subFolders.map((folder) => (
                <div
                  key={folder.id}
                  onClick={() => navigateToFolder(folder.id)}
                  className="flex items-center gap-2 p-3 border rounded-md hover:bg-muted/50 cursor-pointer"
                >
                  <Folder className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm truncate">{folder.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Files */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Files</h4>
          {folderFiles.length > 0 ? (
            <div className="border rounded-md overflow-hidden">
              {folderFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)} • {file.createdAt.toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Dialog
                      open={isMoveFileDialogOpen && selectedFileId === file.id}
                      onOpenChange={(open) => {
                        setIsMoveFileDialogOpen(open)
                        if (open) setSelectedFileId(file.id)
                        else setSelectedFileId(null)
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button size="sm" variant="ghost">
                          Move
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Move File</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <p className="text-sm">
                            Select destination folder for <strong>{file.name}</strong>
                          </p>
                          <Select value={targetFolderId} onValueChange={setTargetFolderId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select folder" />
                            </SelectTrigger>
                            <SelectContent>
                              {folders.map((folder) => (
                                <SelectItem key={folder.id} value={folder.id}>
                                  {folder.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button onClick={moveFile}>Move</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button size="sm" variant="ghost" onClick={() => readFile(file.id)}>
                      Read
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteFile(file.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 border rounded-md bg-muted/10">
              <File className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No files in this folder</p>
              <p className="text-xs text-muted-foreground mt-1">Drag and drop files or use the upload button above</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

