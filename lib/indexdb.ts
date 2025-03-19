// IndexedDB wrapper for file storage
const FileStorage = (() => {
    const DB_NAME = 'fileStorageDB';
    const DB_VERSION = 1;
    const FILE_STORE = 'files';
    const METADATA_STORE = 'metadata';
    let db;

    // Initialize the database
    const init = () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(FILE_STORE)) {
                    db.createObjectStore(FILE_STORE, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(METADATA_STORE)) {
                    const metadataStore = db.createObjectStore(METADATA_STORE, { keyPath: 'key' });
                    metadataStore.add({ key: 'lastFileId', value: 0 });
                }
            };
            
            request.onsuccess = (event) => {
                db = event.target.result;
                console.log('IndexedDB initialized successfully');
                resolve(db);
            };
            
            request.onerror = (event) => {
                console.error('IndexedDB initialization error:', event.target.error);
                reject(event.target.error);
            };
        });
    };

    // Get the next file ID (always incrementing)
    const getNextFileId = () => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([METADATA_STORE], 'readwrite');
            const store = transaction.objectStore(METADATA_STORE);
            const request = store.get('lastFileId');
            
            request.onsuccess = (event) => {
                const metadata = event.target.result;
                const newId = metadata.value + 1;
                
                // Update the lastFileId in the database
                store.put({ key: 'lastFileId', value: newId });
                
                resolve(newId.toString());
            };
            
            request.onerror = (event) => {
                console.error('Error getting next file ID:', event.target.error);
                reject(event.target.error);
            };
        });
    };

    // Store a file in the database
    const storeFile = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async () => {
                try {
                    // Get the next file ID (always incrementing)
                    const fileId = await getNextFileId();
                    
                    const fileData = {
                        id: fileId,  // Use our auto-incrementing ID
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        lastModified: file.lastModified,
                        content: reader.result,
                        dateAdded: new Date()
                    };
                    
                    const transaction = db.transaction([FILE_STORE], 'readwrite');
                    const store = transaction.objectStore(FILE_STORE);
                    const request = store.add(fileData);
                    
                    request.onsuccess = () => {
                        console.log('File stored successfully:', fileData.name);
                        resolve(fileData);
                    };
                    
                    request.onerror = (event) => {
                        console.error('Error storing file:', event.target.error);
                        reject(event.target.error);
                    };
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = (event) => {
                console.error('Error reading file:', event.target.error);
                reject(event.target.error);
            };
            
            // Read file as ArrayBuffer (works for any file type)
            reader.readAsArrayBuffer(file);
        });
    };

    // Get all stored files
    const getAllFiles = () => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([FILE_STORE], 'readonly');
            const store = transaction.objectStore(FILE_STORE);
            const request = store.getAll();
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = (event) => {
                console.error('Error getting files:', event.target.error);
                reject(event.target.error);
            };
        });
    };

    // Get a specific file by ID
    const getFile = (fileId) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([FILE_STORE], 'readonly');
            const store = transaction.objectStore(FILE_STORE);
            // Ensure consistent ID type - we store IDs as strings in the database
            const request = store.get(fileId.toString());
            
            request.onsuccess = (event) => {
                const fileData = event.target.result;
                if (fileData) {
                    resolve(fileData);
                } else {
                    reject(new Error('File not found'));
                }
            };
            
            request.onerror = (event) => {
                console.error('Error getting file:', event.target.error);
                reject(event.target.error);
            };
        });
    };

    // Delete a file by ID
    const deleteFile = (fileId) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([FILE_STORE], 'readwrite');
            const store = transaction.objectStore(FILE_STORE);
            const request = store.delete(fileId);
            
            request.onsuccess = () => {
                console.log('File deleted successfully:', fileId);
                resolve(true);
            };
            
            request.onerror = (event) => {
                console.error('Error deleting file:', event.target.error);
                reject(event.target.error);
            };
        });
    };

    // Return public methods
    return {
        init,
        storeFile,
        getAllFiles,
        getFile,
        deleteFile
    };
})();
