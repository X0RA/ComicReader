'use client';

import { useEffect, useState } from 'react';
import { getDownloadedComics, deleteDownloadedComic, clearDownloads, hardReset, storageInfo } from '@/lib/downloads';
import { maintainArchives } from '@/lib/archiveMaintenance';
import Link from 'next/link';

interface CachedComic {
  id: string;
  name: string;
  totalSize: number;
  accessTime: number;
}

export default function DownloadedPage() {
  const [comics, setComics] = useState<CachedComic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [hardResetConfirm, setHardResetConfirm] = useState(false);

  const [storage, setStorage] = useState<Awaited<ReturnType<typeof storageInfo>> | null>(null);
  // Load cached comics on component mount
  useEffect(() => {
    void loadCachedComics();
    void maintainArchives().then(loadCachedComics).catch(err => setError(String(err)));
  }, []);

  async function loadCachedComics() {
    try {
      setLoading(true);
      setError(null);
      
      // Get comics from Dexie DB
      const downloads = await getDownloadedComics();
      
      // Transform to the expected format
      const comicsList: CachedComic[] = downloads.map(download => ({
        id: download.id,
        name: download.name || download.id, // Extract filename from ID
        totalSize: download.fileSize || 0,
        accessTime: download.lastAccessedAt || download.downloadedAt || 0
      }));
      
      // Sort by most recently accessed
      comicsList.sort((a, b) => b.accessTime - a.accessTime);
      
      setComics(comicsList);
      setStorage(await storageInfo());
    } catch (err) {
      setError(`Failed to load cached comics: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  async function deleteComic(id: string) {
    try {
      await deleteDownloadedComic(id);
      
      // Refresh the comics list
      await loadCachedComics();
      setDeleteConfirm(null);
    } catch (err) {
      setError(`Failed to delete comic: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function clearAllComics() {
    try {
      await clearDownloads();
      setStorage(await storageInfo());
      // Refresh the comics list
      setComics([]);
      setClearAllConfirm(false);
    } catch (err) {
      setError(`Failed to clear database: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function hardResetIndexedDB() {
    setHardResetConfirm(false);
    try {
      await hardReset();
    } catch (err) {
      setError(`Failed to reset IndexedDB: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function formatSize(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Downloaded Comics</h1>
      
      {storage && <div className="mb-6 space-y-2">
        <p>Browser storage: {formatSize(storage.usage ?? 0)} used. Comic cache budget: {formatSize(storage.budget)}.</p>
        <p>Older cached comics are removed when space is needed. Reading progress is kept.</p>
        <button className="underline" onClick={async () => {
          try { await navigator.storage.persist(); setStorage(await storageInfo()); }
          catch (err) { setError(String(err)); }
        }}>{storage.persistent ? 'Persistent storage enabled' : 'Request persistent storage'}</button>
        <p className="text-sm">Clearing site data still removes comics and reading progress. Cached comics alone do not guarantee the app opens offline.</p>
      </div>}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {loading ? (
        <div className="flex justify-center py-8">
          <p>Loading...</p>
        </div>
      ) : (
        <>
          <div className="mb-6 flex justify-between items-center">
            <p>{comics.length} comics stored locally</p>
            <div className="space-x-2 flex">
              <button 
                className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded"
                onClick={() => setHardResetConfirm(true)}
              >
                Hard Reset
              </button>
              <button 
                className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
                onClick={() => setClearAllConfirm(true)}
              >
                Clear All
              </button>
            </div>
          </div>
          
          {comics.length === 0 ? (
            <div className="bg-gray-100 p-6 rounded text-center">
              <p className="mb-4">No comics downloaded yet.</p>
              <Link href="/" className="text-blue-500 hover:underline">
                Browse Comics
              </Link>
            </div>
          ) : (
            <div className="bg-white shadow rounded-lg">
              {comics.map(comic => (
                <div key={comic.id} className="border-b border-gray-200 p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold text-lg">{comic.name}</h3>
                      <div className="text-sm text-gray-500 space-y-1">
                        <p>Size: {formatSize(comic.totalSize)}</p>
                        <p>Last opened: {formatDate(comic.accessTime)}</p>
                      </div>
                    </div>
                    <button
                      className="text-red-500 hover:text-red-700"
                      onClick={() => setDeleteConfirm(comic.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Delete confirmation modal */}
          {deleteConfirm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg p-6 max-w-md w-full">
                <h2 className="text-xl font-bold mb-4">Confirm deletion</h2>
                <p className="mb-6">Are you sure you want to delete this comic?</p>
                <div className="flex justify-end space-x-2">
                  <button 
                    className="bg-gray-300 hover:bg-gray-400 text-black font-bold py-2 px-4 rounded"
                    onClick={() => setDeleteConfirm(null)}
                  >
                    Cancel
                  </button>
                  <button 
                    className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
                    onClick={() => deleteComic(deleteConfirm)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Clear all confirmation modal */}
          {clearAllConfirm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg p-6 max-w-md w-full">
                <h2 className="text-xl font-bold mb-4">Clear all downloads</h2>
                <p className="mb-6">Are you sure you want to delete all downloaded comics? This action cannot be undone.</p>
                <div className="flex justify-end space-x-2">
                  <button 
                    className="bg-gray-300 hover:bg-gray-400 text-black font-bold py-2 px-4 rounded"
                    onClick={() => setClearAllConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
                    onClick={clearAllComics}
                  >
                    Clear All
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Hard reset confirmation modal */}
          {hardResetConfirm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg p-6 max-w-md w-full">
                <h2 className="text-xl font-bold mb-4">Reset Comic Reader storage</h2>
                <p className="mb-6">Delete all cached comics, the catalogue, and reading progress for this app? This cannot be undone.</p>
                <div className="flex justify-end space-x-2">
                  <button 
                    className="bg-gray-300 hover:bg-gray-400 text-black font-bold py-2 px-4 rounded"
                    onClick={() => setHardResetConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
                    onClick={hardResetIndexedDB}
                  >
                    Hard Reset
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
