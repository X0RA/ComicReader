// IndexedDB wrapper for file and folder storage
// import { type } from "os"

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
}

export type FolderType = {
  id: string
  name: string
  parentId: string | null
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
    // Folder operations
    createFolder,
    getAllFolders,
    getSubFolders,
    getFolder,
    deleteFolder,
    moveFolder
  }
})()

export default FileStorage
