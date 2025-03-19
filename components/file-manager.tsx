"use client"

import { useState, useEffect } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronRight, File, FileText, Folder, FolderPlus, Home, Trash2, Upload, Archive, Download, CheckSquare, Square } from "lucide-react"
import { cn } from "@/lib/utils"
import FileStorage, { FileType, FolderType, ZipExtractionResult, FileDownloadResult } from "@/lib/indexdb"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"

// Helper functions
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + " B"
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB"
  else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB"
  else return (bytes / 1073741824).toFixed(1) + " GB"
}

export default function FileManager() {
  const router = useRouter()
  const [files, setFiles] = useState<FileType[]>([])
  const [folders, setFolders] = useState<FolderType[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string>("root")
  const [newFolderName, setNewFolderName] = useState<string>("")
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState<boolean>(false)
  const [isMoveFileDialogOpen, setIsMoveFileDialogOpen] = useState<boolean>(false)
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [targetFolderId, setTargetFolderId] = useState<string>("root")
  const [breadcrumbs, setBreadcrumbs] = useState<FolderType[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [sortField, setSortField] = useState<'name' | 'size' | 'createdAt'>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [isExtracting, setIsExtracting] = useState<boolean>(false)
  const [isDownloadUrlDialogOpen, setIsDownloadUrlDialogOpen] = useState<boolean>(false)
  const [downloadUrl, setDownloadUrl] = useState<string>("")
  const [isDownloading, setIsDownloading] = useState<boolean>(false)
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([])
  const [isBulkMoveDialogOpen, setIsBulkMoveDialogOpen] = useState<boolean>(false)

  // Initialize the database and load data
  useEffect(() => {
    const initializeDb = async () => {
      try {
        await FileStorage.init()
        
        // Load folders and files
        const allFolders = await FileStorage.getAllFolders()
        setFolders(allFolders)
        
        const allFiles = await FileStorage.getAllFiles()
        setFiles(allFiles)
        
        // Set initial breadcrumbs
        const rootFolder = allFolders.find(folder => folder.id === 'root')
        if (rootFolder) {
          setBreadcrumbs([rootFolder])
        }
        
        setIsLoading(false)
      } catch (error) {
        console.error('Error initializing database:', error)
        setIsLoading(false)
      }
    }
    
    initializeDb()
  }, [])

  // Get current folder
  const currentFolder = folders.find((folder) => folder.id === currentFolderId) || 
    { id: 'root', name: 'Root', parentId: null }

  // Get subfolders of current folder
  const subFolders = folders.filter((folder) => folder.parentId === currentFolderId)

  // Get files in current folder
  const folderFiles = files.filter((file) => file.folderId === currentFolderId)

  // Check if all files in the current folder are selected
  const allFilesSelected = folderFiles.length > 0 && selectedFileIds.length === folderFiles.length &&
    folderFiles.every(file => selectedFileIds.includes(file.id))

  // Sort the files based on current sort settings
  const sortedFiles = [...folderFiles].sort((a, b) => {
    if (sortField === 'name') {
      return sortDirection === 'asc' 
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name)
    } else if (sortField === 'size') {
      return sortDirection === 'asc' 
        ? a.size - b.size
        : b.size - a.size
    } else {
      // Sort by createdAt
      return sortDirection === 'asc' 
        ? a.createdAt.getTime() - b.createdAt.getTime()
        : b.createdAt.getTime() - a.createdAt.getTime()
    }
  })

  // Dropzone setup
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: async (acceptedFiles) => {
      try {
        for (const file of acceptedFiles) {
          const storedFile = await FileStorage.storeFile(file, currentFolderId)
          setFiles(prevFiles => [...prevFiles, storedFile])
        }
      } catch (error) {
        console.error('Error uploading files:', error)
      }
    },
  })

  // Handle folder navigation
  const navigateToFolder = async (folderId: string) => {
    setCurrentFolderId(folderId)
    // Clear selected files when changing folders
    setSelectedFileIds([])

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
  const createNewFolder = async () => {
    if (newFolderName.trim() === "") return

    try {
      const newFolder = await FileStorage.createFolder(newFolderName, currentFolderId)
      setFolders([...folders, newFolder])
      setNewFolderName("")
      setIsNewFolderDialogOpen(false)
    } catch (error) {
      console.error('Error creating folder:', error)
    }
  }

  // Delete file
  const deleteFile = async (fileId: string) => {
    try {
      await FileStorage.deleteFile(fileId)
      setFiles(files.filter((file) => file.id !== fileId))
      // Remove from selected files if it was selected
      setSelectedFileIds(prev => prev.filter(id => id !== fileId))
    } catch (error) {
      console.error('Error deleting file:', error)
    }
  }

  // Bulk delete files
  const bulkDeleteFiles = async () => {
    if (selectedFileIds.length === 0) return
    
    try {
      for (const fileId of selectedFileIds) {
        await FileStorage.deleteFile(fileId)
      }
      
      setFiles(files.filter((file) => !selectedFileIds.includes(file.id)))
      setSelectedFileIds([])
      
      toast.success("Delete Successful", {
        description: `Successfully deleted ${selectedFileIds.length} files`,
      })
    } catch (error) {
      console.error('Error deleting files:', error)
      toast.error("Delete Failed", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
      })
    }
  }

  // Move file to another folder
  const moveFile = async () => {
    if (!selectedFileId) return

    try {
      await FileStorage.moveFile(selectedFileId, targetFolderId)
      
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
    } catch (error) {
      console.error('Error moving file:', error)
    }
  }

  // Bulk move files to another folder
  const bulkMoveFiles = async () => {
    if (selectedFileIds.length === 0) return
    
    try {
      for (const fileId of selectedFileIds) {
        await FileStorage.moveFile(fileId, targetFolderId)
      }
      
      setFiles(
        files.map((file) => {
          if (selectedFileIds.includes(file.id)) {
            return { ...file, folderId: targetFolderId }
          }
          return file
        }),
      )
      
      setIsBulkMoveDialogOpen(false)
      setSelectedFileIds([])
      
      toast.success("Move Successful", {
        description: `Successfully moved ${selectedFileIds.length} files`,
      })
    } catch (error) {
      console.error('Error moving files:', error)
      toast.error("Move Failed", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
      })
    }
  }

  // Toggle file selection
  const toggleFileSelection = (fileId: string, event?: React.MouseEvent<HTMLInputElement>) => {
    if (event) {
      event.stopPropagation()
    }
    
    setSelectedFileIds(prev => {
      if (prev.includes(fileId)) {
        return prev.filter(id => id !== fileId)
      } else {
        return [...prev, fileId]
      }
    })
  }

  // Toggle select all files
  const toggleSelectAllFiles = () => {
    if (allFilesSelected) {
      setSelectedFileIds([])
    } else {
      setSelectedFileIds(folderFiles.map(file => file.id))
    }
  }

  // Read file
  const readFile = async (fileId: string) => {
    // Navigate to the read page with the file ID
    router.push(`/read/${fileId}`)
  }

  // Delete folder
  const deleteFolder = async (folderId: string) => {
    if (folderId === "root") {
      return // Prevent deleting root folder
    }
    
    try {
      await FileStorage.deleteFolder(folderId)
      setFolders(folders.filter((folder) => folder.id !== folderId))
      
      // If we're currently in the deleted folder, navigate to parent
      if (currentFolderId === folderId) {
        const folderToDelete = folders.find(f => f.id === folderId)
        if (folderToDelete && folderToDelete.parentId) {
          navigateToFolder(folderToDelete.parentId)
        } else {
          navigateToFolder("root")
        }
      }
    } catch (error) {
      console.error('Error deleting folder:', error)
    }
  }

  // Add this function to handle sorting
  const toggleSort = (field: 'name' | 'size' | 'createdAt') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Extract zip file
  const extractZipFile = async (fileId: string) => {
    try {
      setIsExtracting(true)
      const result: ZipExtractionResult = await FileStorage.extractZipFile(fileId)
      
      if (result.success) {
        // Update the files state with the newly extracted files
        setFiles(prevFiles => [...prevFiles, ...result.extractedFiles])
        toast.success("Extraction Successful", {
          description: `Extracted ${result.totalFiles} files from the zip archive.`,
        })
      } else {
        toast.error("Extraction Failed", {
          description: "Failed to extract files from the zip archive.",
        })
      }
    } catch (error) {
      console.error('Error extracting zip file:', error)
      toast.error("Extraction Failed", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
      })
    } finally {
      setIsExtracting(false)
    }
  }

  // Check if a file is a zip file
  const isZipFile = (file: FileType): boolean => {
    return FileStorage.isZipFile(file)
  }

  // Download file from URL
  const downloadFileFromUrl = async () => {
    if (!downloadUrl.trim()) {
      toast.error("Please enter a valid URL")
      return
    }

    try {
      setIsDownloading(true)
      const result: FileDownloadResult = await FileStorage.downloadFileFromUrl(downloadUrl, currentFolderId)
      
      if (result.success && result.file) {
        setFiles(prevFiles => [...prevFiles, result.file!])
        toast.success("Download Successful", {
          description: `Successfully downloaded and saved: ${result.file.name}`,
        })
        setDownloadUrl("")
        setIsDownloadUrlDialogOpen(false)
      } else {
        toast.error("Download Failed", {
          description: result.message || "Failed to download file from URL",
        })
      }
    } catch (error) {
      console.error('Error downloading file from URL:', error)
      toast.error("Download Failed", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
      })
    } finally {
      setIsDownloading(false)
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

          <Dialog open={isDownloadUrlDialogOpen} onOpenChange={setIsDownloadUrlDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1">
                <Download className="h-4 w-4" />
                Download URL
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Download File from URL</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Input
                  placeholder="Enter file URL"
                  value={downloadUrl}
                  onChange={(e) => setDownloadUrl(e.target.value)}
                />
                <Button 
                  onClick={downloadFileFromUrl} 
                  disabled={isDownloading}
                >
                  {isDownloading ? "Downloading..." : "Download"}
                </Button>
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
                  className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50 cursor-pointer"
                  onClick={() => navigateToFolder(folder.id)}
                >
                  <div className="flex items-center gap-2">
                    <Folder className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm truncate">{folder.name}</span>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteFolder(folder.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Files */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-muted-foreground">Files</h4>
              {folderFiles.length > 0 && (
                <Checkbox 
                  id="select-all"
                  checked={allFilesSelected}
                  onCheckedChange={toggleSelectAllFiles}
                  aria-label="Select all files"
                />
              )}
            </div>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant={sortField === 'name' ? 'secondary' : 'outline'} 
                onClick={() => toggleSort('name')}
                className="text-xs gap-1"
              >
                Name
                {sortField === 'name' && (
                  sortDirection === 'asc' ? 
                    <ChevronRight className="h-3 w-3 rotate-90" /> : 
                    <ChevronRight className="h-3 w-3 -rotate-90" />
                )}
              </Button>
              <Button 
                size="sm" 
                variant={sortField === 'size' ? 'secondary' : 'outline'} 
                onClick={() => toggleSort('size')}
                className="text-xs gap-1"
              >
                Size
                {sortField === 'size' && (
                  sortDirection === 'asc' ? 
                    <ChevronRight className="h-3 w-3 rotate-90" /> : 
                    <ChevronRight className="h-3 w-3 -rotate-90" />
                )}
              </Button>
              <Button 
                size="sm" 
                variant={sortField === 'createdAt' ? 'secondary' : 'outline'} 
                onClick={() => toggleSort('createdAt')}
                className="text-xs gap-1"
              >
                Date
                {sortField === 'createdAt' && (
                  sortDirection === 'asc' ? 
                    <ChevronRight className="h-3 w-3 rotate-90" /> : 
                    <ChevronRight className="h-3 w-3 -rotate-90" />
                )}
              </Button>
            </div>
          </div>
          
          {/* Bulk actions bar - show when files are selected */}
          {selectedFileIds.length > 0 && (
            <div className="mb-2 p-2 bg-muted/20 border rounded-md flex items-center justify-between">
              <span className="text-sm font-medium">{selectedFileIds.length} files selected</span>
              <div className="flex gap-2">
                <Dialog open={isBulkMoveDialogOpen} onOpenChange={setIsBulkMoveDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      Move Selected
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Move Files</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <p className="text-sm">
                        Select destination folder for {selectedFileIds.length} selected files
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
                      <Button onClick={bulkMoveFiles}>Move Files</Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="text-destructive"
                  onClick={bulkDeleteFiles}
                >
                  Delete Selected
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => setSelectedFileIds([])}
                >
                  Clear Selection
                </Button>
              </div>
            </div>
          )}
          
          {folderFiles.length > 0 ? (
            <div className="border rounded-md overflow-hidden">
              {sortedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedFileIds.includes(file.id)}
                      onCheckedChange={() => toggleFileSelection(file.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${file.name}`}
                    />
                    {isZipFile(file) ? 
                      <Archive className="h-5 w-5 text-muted-foreground" /> : 
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    }
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
                    {isZipFile(file) && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => extractZipFile(file.id)}
                        disabled={isExtracting}
                      >
                        {isExtracting ? "Extracting..." : "Extract"}
                      </Button>
                    )}
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

