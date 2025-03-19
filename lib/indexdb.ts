// IndexedDB wrapper for file and folder storage
// import { type } from "os"
import JSZip from 'jszip'

// TypeScript interfaces
export type FileType = {
  id: string
  name: string
  size: number
  folderId: string
  createdAt: Date
  content?: ArrayBuffer  // The actual file content
  type?: string          // MIME type
  lastModified?: number  // Last modified timestamp
  read?: boolean         // Whether the file has been read
}

export type FolderType = {
  id: string
  name: string
  parentId: string | null
}

// Result type for zip extraction
export type ZipExtractionResult = {
  extractedFiles: FileType[]
  totalFiles: number
  success: boolean
}

// Result type for file download
export type FileDownloadResult = {
  file: FileType | null
  success: boolean
  message: string
}

const FileStorage = (() => {
  const DB_NAME = 'fileStorageDB'
  const DB_VERSION = 1
  const FILE_STORE = 'files'
  const FOLDER_STORE = 'folders'
  const METADATA_STORE = 'metadata'
  let db: IDBDatabase | null = null

  // Initialize the database
  const init = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        // Create file store
        if (!db.objectStoreNames.contains(FILE_STORE)) {
          db.createObjectStore(FILE_STORE, { keyPath: 'id' })
        }
        
        // Create folder store
        if (!db.objectStoreNames.contains(FOLDER_STORE)) {
          const folderStore = db.createObjectStore(FOLDER_STORE, { keyPath: 'id' })
          // Add root folder by default
          folderStore.add({ id: 'root', name: 'Root', parentId: null })
        }
        
        // Create metadata store
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          const metadataStore = db.createObjectStore(METADATA_STORE, { keyPath: 'key' })
          metadataStore.add({ key: 'lastFileId', value: 0 })
          metadataStore.add({ key: 'lastFolderId', value: 0 })
        }
      }
      
      request.onsuccess = (event) => {
        db = (event.target as IDBOpenDBRequest).result
        console.log('IndexedDB initialized successfully')
        resolve(db)
      }
      
      request.onerror = (event) => {
        console.error('IndexedDB initialization error:', (event.target as IDBOpenDBRequest).error)
        reject((event.target as IDBOpenDBRequest).error)
      }
    })
  }

  // Get the next ID (always incrementing)
  const getNextId = (idType: 'lastFileId' | 'lastFolderId'): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'))
        return
      }
      
      const transaction = db.transaction([METADATA_STORE], 'readwrite')
      const store = transaction.objectStore(METADATA_STORE)
      const request = store.get(idType)
      
      request.onsuccess = (event) => {
        const metadata = (event.target as IDBRequest).result
        const newId = metadata.value + 1
        
        // Update the lastId in the database
        store.put({ key: idType, value: newId })
        
        resolve(newId.toString())
      }
      
      request.onerror = (event) => {
        console.error(`Error getting next ${idType}:`, (event.target as IDBRequest).error)
        reject((event.target as IDBRequest).error)
      }
    })
  }

  // Store a file in the database
  const storeFile = (file: File, folderId: string): Promise<FileType> => {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'))
        return
      }
      
      const reader = new FileReader()
      
      reader.onload = async () => {
        try {
          // Get the next file ID
          const fileId = await getNextId('lastFileId')
          
          const fileData: FileType = {
            id: fileId,
            name: file.name,
            size: file.size,
            folderId: folderId,
            createdAt: new Date(),
            content: reader.result as ArrayBuffer,
            type: file.type,
            lastModified: file.lastModified
          }
          
          if (!db) {
            reject(new Error('Database not initialized'))
            return
          }
          
          const transaction = db.transaction([FILE_STORE], 'readwrite')
          const store = transaction.objectStore(FILE_STORE)
          const request = store.add(fileData)
          
          request.onsuccess = () => {
            console.log('File stored successfully:', fileData.name)
            resolve(fileData)
          }
          
          request.onerror = (event) => {
            console.error('Error storing file:', (event.target as IDBRequest).error)
            reject((event.target as IDBRequest).error)
          }
        } catch (error) {
          reject(error)
        }
      }
      
      reader.onerror = (event) => {
        console.error('Error reading file:', reader.error)
        reject(reader.error)
      }
      
      // Read file as ArrayBuffer (works for any file type)
      reader.readAsArrayBuffer(file)
    })
  }

  // Get all files in a folder
  const getFilesInFolder = (folderId: string): Promise<FileType[]> => {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'))
        return
      }
      
      const transaction = db.transaction([FILE_STORE], 'readonly')
      const store = transaction.objectStore(FILE_STORE)
      const request = store.getAll()
      
      request.onsuccess = () => {
        const allFiles = request.result as FileType[]
        const folderFiles = allFiles.filter(file => file.folderId === folderId)
        resolve(folderFiles)
      }
      
      request.onerror = (event) => {
        console.error('Error getting files:', (event.target as IDBRequest).error)
        reject((event.target as IDBRequest).error)
      }
    })
  }

  // Get all files
  const getAllFiles = (): Promise<FileType[]> => {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'))
        return
      }
      
      const transaction = db.transaction([FILE_STORE], 'readonly')
      const store = transaction.objectStore(FILE_STORE)
      const request = store.getAll()
      
      request.onsuccess = () => {
        resolve(request.result as FileType[])
      }
      
      request.onerror = (event) => {
        console.error('Error getting files:', (event.target as IDBRequest).error)
        reject((event.target as IDBRequest).error)
      }
    })
  }

  // Get a specific file by ID
  const getFile = (fileId: string): Promise<FileType> => {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'))
        return
      }
      
      const transaction = db.transaction([FILE_STORE], 'readonly')
      const store = transaction.objectStore(FILE_STORE)
      const request = store.get(fileId)
      
      request.onsuccess = (event) => {
        const fileData = (event.target as IDBRequest).result
        if (fileData) {
          resolve(fileData)
        } else {
          reject(new Error('File not found'))
        }
      }
      
      request.onerror = (event) => {
        console.error('Error getting file:', (event.target as IDBRequest).error)
        reject((event.target as IDBRequest).error)
      }
    })
  }

  // Move a file to another folder
  const moveFile = (fileId: string, newFolderId: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'))
        return
      }
      
      const transaction = db.transaction([FILE_STORE], 'readwrite')
      const store = transaction.objectStore(FILE_STORE)
      const request = store.get(fileId)
      
      request.onsuccess = (event) => {
        const fileData = (event.target as IDBRequest).result
        if (fileData) {
          fileData.folderId = newFolderId
          const updateRequest = store.put(fileData)
          
          updateRequest.onsuccess = () => {
            resolve(true)
          }
          
          updateRequest.onerror = (event) => {
            console.error('Error moving file:', (event.target as IDBRequest).error)
            reject((event.target as IDBRequest).error)
          }
        } else {
          reject(new Error('File not found'))
        }
      }
      
      request.onerror = (event) => {
        console.error('Error getting file for move:', (event.target as IDBRequest).error)
        reject((event.target as IDBRequest).error)
      }
    })
  }

  // Delete a file by ID
  const deleteFile = (fileId: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'))
        return
      }
      
      const transaction = db.transaction([FILE_STORE], 'readwrite')
      const store = transaction.objectStore(FILE_STORE)
      const request = store.delete(fileId)
      
      request.onsuccess = () => {
        console.log('File deleted successfully:', fileId)
        resolve(true)
      }
      
      request.onerror = (event) => {
        console.error('Error deleting file:', (event.target as IDBRequest).error)
        reject((event.target as IDBRequest).error)
      }
    })
  }

  // FOLDER OPERATIONS

  // Create a new folder
  const createFolder = (name: string, parentId: string | null): Promise<FolderType> => {
    return new Promise(async (resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'))
        return
      }
      
      try {
        const folderId = await getNextId('lastFolderId')
        
        const folderData: FolderType = {
          id: folderId,
          name,
          parentId
        }
        
        const transaction = db.transaction([FOLDER_STORE], 'readwrite')
        const store = transaction.objectStore(FOLDER_STORE)
        const request = store.add(folderData)
        
        request.onsuccess = () => {
          console.log('Folder created successfully:', name)
          resolve(folderData)
        }
        
        request.onerror = (event) => {
          console.error('Error creating folder:', (event.target as IDBRequest).error)
          reject((event.target as IDBRequest).error)
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  // Get all folders
  const getAllFolders = (): Promise<FolderType[]> => {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'))
        return
      }
      
      const transaction = db.transaction([FOLDER_STORE], 'readonly')
      const store = transaction.objectStore(FOLDER_STORE)
      const request = store.getAll()
      
      request.onsuccess = () => {
        resolve(request.result as FolderType[])
      }
      
      request.onerror = (event) => {
        console.error('Error getting folders:', (event.target as IDBRequest).error)
        reject((event.target as IDBRequest).error)
      }
    })
  }

  // Get subfolders of a specific folder
  const getSubFolders = (parentId: string): Promise<FolderType[]> => {
    return new Promise((resolve, reject) => {
      getAllFolders()
        .then(folders => {
          const subFolders = folders.filter(folder => folder.parentId === parentId)
          resolve(subFolders)
        })
        .catch(error => reject(error))
    })
  }

  // Get a specific folder by ID
  const getFolder = (folderId: string): Promise<FolderType> => {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'))
        return
      }
      
      const transaction = db.transaction([FOLDER_STORE], 'readonly')
      const store = transaction.objectStore(FOLDER_STORE)
      const request = store.get(folderId)
      
      request.onsuccess = (event) => {
        const folderData = (event.target as IDBRequest).result
        if (folderData) {
          resolve(folderData)
        } else {
          reject(new Error('Folder not found'))
        }
      }
      
      request.onerror = (event) => {
        console.error('Error getting folder:', (event.target as IDBRequest).error)
        reject((event.target as IDBRequest).error)
      }
    })
  }

  // Delete a folder by ID (including all files in that folder)
  const deleteFolder = (folderId: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'))
        return
      }
      
      // First get all subfolders recursively
      const getAllSubFolderIds = async (parentId: string): Promise<string[]> => {
        const subFolders = await getSubFolders(parentId)
        let allFolderIds: string[] = [parentId]
        
        for (const folder of subFolders) {
          const childFolderIds = await getAllSubFolderIds(folder.id)
          allFolderIds = [...allFolderIds, ...childFolderIds]
        }
        
        return allFolderIds
      }
      
      getAllSubFolderIds(folderId)
        .then(folderIds => {
          const folderTx = db!.transaction([FOLDER_STORE], 'readwrite')
          const folderStore = folderTx.objectStore(FOLDER_STORE)
          
          // Delete all folders
          for (const id of folderIds) {
            folderStore.delete(id)
          }
          
          // Delete all files in those folders
          const fileTx = db!.transaction([FILE_STORE], 'readwrite')
          const fileStore = fileTx.objectStore(FILE_STORE)
          
          getAllFiles()
            .then(files => {
              const filesToDelete = files.filter(file => folderIds.includes(file.folderId))
              
              for (const file of filesToDelete) {
                fileStore.delete(file.id)
              }
              
              resolve(true)
            })
            .catch(error => reject(error))
        })
        .catch(error => reject(error))
    })
  }

  // Move a folder to another parent
  const moveFolder = (folderId: string, newParentId: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'))
        return
      }
      
      const transaction = db.transaction([FOLDER_STORE], 'readwrite')
      const store = transaction.objectStore(FOLDER_STORE)
      
      // Check if this would create a circular reference
      const checkCircularReference = async (targetId: string, destinationId: string): Promise<boolean> => {
        if (targetId === destinationId) return true
        
        const destFolder = await getFolder(destinationId)
        if (destFolder.parentId === null) return false
        
        return checkCircularReference(targetId, destFolder.parentId)
      }
      
      checkCircularReference(folderId, newParentId)
        .then(isCircular => {
          if (isCircular) {
            reject(new Error('Cannot move a folder into its own subfolder'))
            return
          }
          
          const request = store.get(folderId)
          
          request.onsuccess = (event) => {
            const folderData = (event.target as IDBRequest).result
            if (folderData) {
              folderData.parentId = newParentId
              const updateRequest = store.put(folderData)
              
              updateRequest.onsuccess = () => {
                resolve(true)
              }
              
              updateRequest.onerror = (event) => {
                console.error('Error moving folder:', (event.target as IDBRequest).error)
                reject((event.target as IDBRequest).error)
              }
            } else {
              reject(new Error('Folder not found'))
            }
          }
          
          request.onerror = (event) => {
            console.error('Error getting folder for move:', (event.target as IDBRequest).error)
            reject((event.target as IDBRequest).error)
          }
        })
        .catch(error => reject(error))
    })
  }

  // Check if a file is a ZIP file based on MIME type or extension
  const isZipFile = (file: FileType): boolean => {
    // Check by MIME type
    if (file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
      return true
    }
    
    // Check by file extension
    const fileName = file.name.toLowerCase()
    return fileName.endsWith('.zip')
  }

  // Extract a ZIP file and store its contents in the database
  const extractZipFile = async (fileId: string): Promise<ZipExtractionResult> => {
    if (!db) {
      throw new Error('Database not initialized')
    }
    
    try {
      // Get the zip file from the database
      const zipFile = await getFile(fileId)
      
      if (!zipFile || !zipFile.content) {
        throw new Error('Zip file not found or has no content')
      }
      
      if (!isZipFile(zipFile)) {
        throw new Error('File is not a zip file')
      }
      
      // Use JSZip to extract the contents
      const zip = new JSZip()
      const loadedZip = await zip.loadAsync(zipFile.content)
      
      const extractedFiles: FileType[] = []
      const extractionPromises: Promise<FileType>[] = []
      
      // Process each file in the zip
      for (const [relativePath, zipEntry] of Object.entries(loadedZip.files)) {
        // Skip directories
        if (zipEntry.dir) {
          continue
        }
        
        // Get the file data as ArrayBuffer
        const fileData = await zipEntry.async('arraybuffer')
        
        // Extract the filename from the path
        const pathParts = relativePath.split('/')
        const fileName = pathParts[pathParts.length - 1]
        
        // Create a file object
        const fileObject = new File([fileData], fileName, {
          type: getMimeType(fileName),
          lastModified: zipEntry.date.getTime()
        })
        
        // Store the file in the same folder as the zip file
        const promise = storeFile(fileObject, zipFile.folderId)
          .then(storedFile => {
            extractedFiles.push(storedFile)
            return storedFile
          })
        
        extractionPromises.push(promise)
      }
      
      // Wait for all files to be stored
      await Promise.all(extractionPromises)
      
      return {
        extractedFiles,
        totalFiles: extractedFiles.length,
        success: true
      }
    } catch (error) {
      console.error('Error extracting zip file:', error)
      return {
        extractedFiles: [],
        totalFiles: 0,
        success: false
      }
    }
  }
  
  // Download a file from a URL and store it in the database
  const downloadFileFromUrl = async (
    url: string, 
    folderId: string,
    progressCallback?: (progress: number, text?: string) => void
  ): Promise<FileDownloadResult> => {
    if (!db) {
      return {
        file: null,
        success: false,
        message: 'Database not initialized'
      }
    }
    
    // For chunked downloading
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
    
    return new Promise((resolve) => {
      // Report initial progress
      progressCallback?.(0, "Starting download...")
      
      // First, make a HEAD request to get file size and other metadata
      fetch(url, { method: 'HEAD' })
        .then(response => {
          // Get content length if available
          const contentLength = response.headers.get('content-length');
          const totalSize = contentLength ? parseInt(contentLength, 10) : null;
          
          // Get content type
          const contentType = response.headers.get('content-type') || '';
          
          // Try to get filename from Content-Disposition header
          const contentDisposition = response.headers.get('content-disposition') || '';
          let fileName = getFileNameFromUrl(url);
          const fileNameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (fileNameMatch && fileNameMatch[1]) {
            fileName = fileNameMatch[1].replace(/['"]/g, '');
          }
          
          // Prepare to download in chunks
          progressCallback?.(0, "Preparing download...");
          
          if (totalSize && totalSize > CHUNK_SIZE) {
            // Use chunked downloading for large files
            return downloadInChunks(url, fileName, contentType, totalSize, progressCallback);
          } else {
            // Use simple downloading for smaller files
            return simpleDownload(url, fileName, contentType, progressCallback);
          }
        })
        .then(async fileBlob => {
          try {
            progressCallback?.(100, "Saving file...");
            
            // Convert Blob to File
            const file = new File([fileBlob], fileBlob.name, {
              type: fileBlob.type,
              lastModified: Date.now()
            });
            
            // Store in IndexedDB
            const storedFile = await storeFile(file, folderId);
            resolve({
              file: storedFile,
              success: true,
              message: 'File downloaded and stored successfully'
            });
          } catch (error) {
            resolve({
              file: null,
              success: false,
              message: error instanceof Error ? `Error storing file: ${error.message}` : 'Unknown error storing file'
            });
          }
        })
        .catch(error => {
          resolve({
            file: null,
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        });
    });
  };
  
  // Helper function for downloading smaller files
  const simpleDownload = (
    url: string,
    fileName: string,
    contentType: string,
    progressCallback?: (progress: number, text?: string) => void
  ): Promise<File> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'blob';
      
      xhr.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          const downloadedSize = formatFileSize(event.loaded);
          const totalSize = formatFileSize(event.total);
          progressCallback?.(
            percentComplete, 
            `Downloaded ${downloadedSize} of ${totalSize} (${percentComplete}%)`
          );
        } else {
          progressCallback?.(
            50, 
            `Downloaded ${formatFileSize(event.loaded)} (size unknown)`
          );
        }
      };
      
      xhr.onload = function() {
        if (this.status === 200) {
          // Create a File object (which is a Blob with a name property)
          const file = new File([xhr.response], fileName, { type: contentType });
          resolve(file);
        } else {
          reject(new Error(`Server returned status ${this.status}`));
        }
      };
      
      xhr.onerror = () => reject(new Error('Network error occurred while downloading'));
      xhr.onabort = () => reject(new Error('Download was aborted'));
      
      xhr.send();
    });
  };
  
  // Helper function for downloading large files in chunks
  const downloadInChunks = (
    url: string,
    fileName: string,
    contentType: string,
    totalSize: number,
    progressCallback?: (progress: number, text?: string) => void
  ): Promise<File> => {
    return new Promise((resolve, reject) => {
      const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
      const chunks: Blob[] = [];
      let loaded = 0;
      
      // Function to download a chunk
      const downloadChunk = (start: number, end: number): Promise<void> => {
        return new Promise((resolveChunk, rejectChunk) => {
          const range = `bytes=${start}-${end-1}`;
          
          fetch(url, {
            headers: { Range: range }
          })
          .then(response => {
            if (response.status === 206) { // Partial content
              return response.blob();
            } else if (response.status === 200) {
              // Server doesn't support range requests, but we'll still process the chunk
              return response.blob();
            } else {
              throw new Error(`Server returned status ${response.status}`);
            }
          })
          .then(blob => {
            chunks.push(blob);
            loaded += blob.size;
            
            // Update progress
            const percentComplete = Math.round((loaded / totalSize) * 100);
            progressCallback?.(
              percentComplete,
              `Downloaded ${formatFileSize(loaded)} of ${formatFileSize(totalSize)} (${percentComplete}%)`
            );
            
            resolveChunk();
          })
          .catch(rejectChunk);
        });
      };
      
      // Sequentially download all chunks to avoid overwhelming the device
      const downloadAllChunks = async () => {
        let start = 0;
        
        while (start < totalSize) {
          const end = Math.min(start + CHUNK_SIZE, totalSize);
          try {
            await downloadChunk(start, end);
            start = end;
          } catch (error) {
            reject(error);
            return;
          }
        }
        
        // Combine all chunks and create a File
        progressCallback?.(100, "Processing downloaded file...");
        const combinedBlob = new Blob(chunks, { type: contentType });
        const file = new File([combinedBlob], fileName, { type: contentType });
        resolve(file);
      };
      
      // Start the chunked download process
      downloadAllChunks();
    });
  };
  
  // Helper function to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B"
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB"
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB"
    else return (bytes / 1073741824).toFixed(1) + " GB"
  }
  
  // Helper function to extract file name from URL
  const getFileNameFromUrl = (url: string): string => {
    try {
      // Try to get the filename from the URL path
      const urlObj = new URL(url)
      const pathname = urlObj.pathname
      const segments = pathname.split('/')
      const lastSegment = segments[segments.length - 1]
      
      // If the last segment is empty or doesn't contain a filename pattern, use a default name
      if (lastSegment && lastSegment.includes('.')) {
        // URL decode the filename in case it has special characters
        return decodeURIComponent(lastSegment)
      }
    } catch (e) {
      console.error('Error parsing URL:', e)
    }
    
    // Default filename if we couldn't extract one from the URL
    return `downloaded_file_${Date.now()}`
  }
  
  // Helper function to determine MIME type from filename
  const getMimeType = (fileName: string): string => {
    const extension = fileName.split('.').pop()?.toLowerCase() || ''
    
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'bmp': 'image/bmp',
      'pdf': 'application/pdf',
      'txt': 'text/plain',
      'html': 'text/html',
      'htm': 'text/html',
      'xml': 'application/xml',
      'json': 'application/json',
      'js': 'application/javascript',
      'css': 'text/css',
      'svg': 'image/svg+xml',
      'mp3': 'audio/mpeg',
      'mp4': 'video/mp4',
      'zip': 'application/zip'
      // Add more as needed
    }
    
    return mimeTypes[extension] || 'application/octet-stream'
  }

  // Mark a file as read or unread
  const markFileAsRead = (fileId: string, isRead: boolean = true): Promise<FileType> => {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'))
        return
      }
      
      const transaction = db.transaction([FILE_STORE], 'readwrite')
      const store = transaction.objectStore(FILE_STORE)
      const request = store.get(fileId)
      
      request.onsuccess = (event) => {
        const fileData = (event.target as IDBRequest).result
        if (fileData) {
          fileData.read = isRead
          const updateRequest = store.put(fileData)
          
          updateRequest.onsuccess = () => {
            resolve(fileData)
          }
          
          updateRequest.onerror = (event) => {
            console.error('Error updating file read status:', (event.target as IDBRequest).error)
            reject((event.target as IDBRequest).error)
          }
        } else {
          reject(new Error('File not found'))
        }
      }
      
      request.onerror = (event) => {
        console.error('Error getting file:', (event.target as IDBRequest).error)
        reject((event.target as IDBRequest).error)
      }
    })
  }

  // Toggle read status of a file
  const toggleFileReadStatus = (fileId: string): Promise<FileType> => {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'))
        return
      }
      
      const transaction = db.transaction([FILE_STORE], 'readwrite')
      const store = transaction.objectStore(FILE_STORE)
      const request = store.get(fileId)
      
      request.onsuccess = (event) => {
        const fileData = (event.target as IDBRequest).result
        if (fileData) {
          fileData.read = !fileData.read
          const updateRequest = store.put(fileData)
          
          updateRequest.onsuccess = () => {
            resolve(fileData)
          }
          
          updateRequest.onerror = (event) => {
            console.error('Error toggling file read status:', (event.target as IDBRequest).error)
            reject((event.target as IDBRequest).error)
          }
        } else {
          reject(new Error('File not found'))
        }
      }
      
      request.onerror = (event) => {
        console.error('Error getting file:', (event.target as IDBRequest).error)
        reject((event.target as IDBRequest).error)
      }
    })
  }

  // Mark multiple files as read or unread
  const markMultipleFilesAsRead = (fileIds: string[], isRead: boolean = true): Promise<boolean> => {
    return new Promise(async (resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'))
        return
      }
      
      try {
        const transaction = db.transaction([FILE_STORE], 'readwrite')
        const store = transaction.objectStore(FILE_STORE)
        
        for (const fileId of fileIds) {
          const request = store.get(fileId)
          await new Promise<void>((resolve, reject) => {
            request.onsuccess = (event) => {
              const fileData = (event.target as IDBRequest).result
              if (fileData) {
                fileData.read = isRead
                store.put(fileData)
                resolve()
              } else {
                resolve() // Skip if file not found
              }
            }
            
            request.onerror = () => {
              console.error('Error getting file:', request.error)
              resolve() // Continue with other files
            }
          })
        }
        
        resolve(true)
      } catch (error) {
        console.error('Error marking files as read:', error)
        reject(error)
      }
    })
  }

  // Set the last opened comic file
  const setLastOpenedComic = (fileId: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'))
        return
      }
      
      const transaction = db.transaction([METADATA_STORE], 'readwrite')
      const store = transaction.objectStore(METADATA_STORE)
      
      // Update or add the lastOpenedComic entry
      const request = store.put({ key: 'lastOpenedComic', value: fileId })
      
      request.onsuccess = () => {
        resolve(true)
      }
      
      request.onerror = (event) => {
        console.error('Error setting last opened comic:', (event.target as IDBRequest).error)
        reject((event.target as IDBRequest).error)
      }
    })
  }

  // Get the last opened comic file ID
  const getLastOpenedComic = (): Promise<string | null> => {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'))
        return
      }
      
      const transaction = db.transaction([METADATA_STORE], 'readonly')
      const store = transaction.objectStore(METADATA_STORE)
      const request = store.get('lastOpenedComic')
      
      request.onsuccess = (event) => {
        const result = (event.target as IDBRequest).result
        if (result) {
          resolve(result.value)
        } else {
          resolve(null) // No last opened comic found
        }
      }
      
      request.onerror = (event) => {
        console.error('Error getting last opened comic:', (event.target as IDBRequest).error)
        reject((event.target as IDBRequest).error)
      }
    })
  }

  // Return public methods
  return {
    init,
    // File operations
    storeFile,
    getAllFiles,
    getFilesInFolder,
    getFile,
    moveFile,
    deleteFile,
    // Read status operations
    markFileAsRead,
    toggleFileReadStatus,
    markMultipleFilesAsRead,
    // Folder operations
    createFolder,
    getAllFolders,
    getSubFolders,
    getFolder,
    deleteFolder,
    moveFolder,
    // Zip operations
    isZipFile,
    extractZipFile,
    // URL download
    downloadFileFromUrl,
    // Last opened comic operations
    setLastOpenedComic,
    getLastOpenedComic,
  }
})()

export default FileStorage
