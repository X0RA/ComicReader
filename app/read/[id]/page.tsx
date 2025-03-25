'use client'
import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ChevronLeft, ChevronRight, Home } from "lucide-react"
import { useRouter } from "next/navigation"
import { db } from "@/lib/dexieDB"
import JSZip from "jszip"
import { Progress } from "@/components/ui/progress" // Assuming you have a Progress component from shadcn/ui
import ComicOverlay from "./_comicOverlay"
import ComicView from "./_comicView"


export default function ReadFilePage({
    params,
  }: {
    params: Promise<{ id: string }>
  }) {
    const router = useRouter();
    // @ts-ignore
    const { id } = React.use(params);
    const [loading, setLoading] = useState(true);
    const [downloadStatus, setDownloadStatus] = useState<{
        isDownloading: boolean;
        progress: number;
    }>({ isDownloading: false, progress: 0 });
    const [comicName, setComicName] = useState<string>('Loading...');
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState<number | null>(null);
    const [showOverlay, setShowOverlay] = useState(false);
    const [images, setImages] = useState<string[]>([]);
    const [nextComic, setNextComic] = useState<string | null>(null);
    const [previousComic, setPreviousComic] = useState<string | null>(null);
    const [initialPage, setInitialPage] = useState<number | null>(null);
    const [lastScrollY, setLastScrollY] = useState<number>(0);
    const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null);
    const scrollThreshold = 30; // Minimum scroll amount to trigger the overlay

    // Find the comic in the database and load it
    useEffect(() => {
        async function loadComic() {
            try {
                // First, find the comic URL in the database
                const comicsData = await db.getComicsData()
                if (!comicsData) {
                    setError("Comics data not available")
                    setLoading(false)
                    return
                }

                // Helper function to find a file by ID
                const findFileById = (items: any[], id: string): any => {
                    for (const item of items) {
                        if (item.id === id && item.type === 'file') {
                            return item
                        }
                        if (item.type === 'folder' && item.children) {
                            const found = findFileById(item.children, id)
                            if (found) return found
                        }
                    }
                    return null
                }

                // Find the comic in the data
                const comic = findFileById(comicsData, id)
                if (!comic) {
                    setError("Comic not found")
                    setLoading(false)
                    return
                }

                setComicName(comic.name)





                // Find and set adjacent comics right away
                const findAdjacentComics = (items: any[], currentId: string) => {
                    // Flatten the comics structure
                    const flattenItems = (items: any[]): any[] => {
                        return items.reduce((acc, item) => {
                            if (item.type === 'file') {
                                acc.push(item)
                            } else if (item.type === 'folder' && item.children) {
                                acc = [...acc, ...flattenItems(item.children)]
                            }
                            return acc
                        }, [])
                    }

                    const allFiles = flattenItems(items).filter(i => i.type === 'file')
                    const currentIndex = allFiles.findIndex(f => f.id === currentId)

                    const prevComic = currentIndex > 0 ? allFiles[currentIndex - 1] : null
                    const nextComic = currentIndex >= 0 && currentIndex < allFiles.length - 1 ?
                        allFiles[currentIndex + 1] : null

                    return { prevComic, nextComic }
                }

                // Set previous and next comics immediately
                const { prevComic, nextComic } = findAdjacentComics(comicsData, id)
                if (prevComic) {
                    setPreviousComic(prevComic.id)
                }
                if (nextComic) {
                    setNextComic(nextComic.id)
                }

                // Save as last read comic
                await db.setLastReadComic(id)

                // Check if the comic is already downloaded
                let comicBlob = await db.getDownloadedComic(id)

                // If not downloaded, download it
                if (!comicBlob) {
                    setDownloadStatus({ isDownloading: true, progress: 0 })

                    try {
                        // Download the comic and track progress
                        const downloadTracker = setInterval(async () => {
                            const status = await db.getComicDownloadStatus(id)
                            if (status) {
                                setDownloadStatus({
                                    isDownloading: status.status === 'in_progress',
                                    progress: status.progress
                                })
                            }
                        }, 300)

                        // Start download
                        await db.downloadComic({ id, url: comic.link })
                        clearInterval(downloadTracker)

                        // Get the downloaded blob
                        comicBlob = await db.getDownloadedComic(id)
                        if (!comicBlob) {
                            throw new Error("Download completed but comic not found")
                        }
                    } catch (err) {
                        console.error("Error downloading comic:", err)
                        setError("Failed to download comic")
                        setLoading(false)
                        return
                    }
                }

                // Process the comic archive
                try {
                    // Unzip the comic file
                    const zipFile = await JSZip.loadAsync(comicBlob)
                    const imageFiles: string[] = []
                    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

                    // Get all files and sort them to ensure correct page order
                    const fileNames = Object.keys(zipFile.files).sort()

                    // Process each file in the zip
                    for (const fileName of fileNames) {
                        // Skip directories and hidden files
                        if (zipFile.files[fileName].dir ||
                            fileName.startsWith('__MACOSX') ||
                            fileName.startsWith('.')) {
                            continue
                        }

                        // Check if it's an image file
                        const isImage = imageExtensions.some(ext =>
                            fileName.toLowerCase().endsWith(ext)
                        )

                        if (isImage) {
                            try {
                                // Get the blob for this file
                                const content = await zipFile.files[fileName].async('blob')
                                // Create a URL for the blob
                                const objectURL = URL.createObjectURL(content)
                                imageFiles.push(objectURL)
                            } catch (error) {
                                console.error(`Error extracting file ${fileName}:`, error)
                            }
                        }
                    }

                    // Free up memory - remove reference to the original blob
                    comicBlob = null

                    // Explicitly tell JSZip to release any internal references (if possible)
                    // This helps the garbage collector identify it as available for collection
                    for (const key in zipFile.files) {
                        // @ts-ignore
                        // Attempt to release the file but does give a type error
                        zipFile.files[key] = null
                    }

                    if (imageFiles.length === 0) {
                        setError("No image files found in the comic archive")
                    } else {
                        setImages(imageFiles)
                    }

                    // Preload next comic if possible
                    preloadNextComic()
                } catch (err) {
                    console.error("Error processing comic archive:", err)
                    setError("Failed to process comic file")
                }

                setLoading(false)
            } catch (err) {
                console.error("Error loading comic:", err)
                setError("Failed to load comic")
                setLoading(false)
            }
        }

        async function loadComicStatus() {
            const comicStatus = await db.getComicStatus(id)
            if (comicStatus && comicStatus.lastPage) {
                setCurrentPage(comicStatus.lastPage)
                setInitialPage(comicStatus.lastPage)
            }
        }

        loadComicStatus().then(() => {
            loadComic()
        })

        // Cleanup function to release object URLs when component unmounts
        return () => {
            // Clean up all created object URLs
            images.forEach(url => URL.revokeObjectURL(url))
        }
    }, [id])

    // Function to preload the next comic
    async function preloadNextComic() {
        try {
            // Get all comics data
            const comicsData = await db.getComicsData()
            if (!comicsData) return

            // Helper function to find a file by ID and return the next file
            const findAdjacentComics = (items: any[], currentId: string) => {
                // Flatten the comics structure
                const flattenItems = (items: any[]): any[] => {
                    return items.reduce((acc, item) => {
                        if (item.type === 'file') {
                            acc.push(item)
                        } else if (item.type === 'folder' && item.children) {
                            acc = [...acc, ...flattenItems(item.children)]
                        }
                        return acc
                    }, [])
                }

                const allFiles = flattenItems(items).filter(i => i.type === 'file')

                // Find the current index
                const currentIndex = allFiles.findIndex(f => f.id === currentId)

                // Find previous and next comics
                const prevComic = currentIndex > 0 ? allFiles[currentIndex - 1] : null
                const nextComic = currentIndex >= 0 && currentIndex < allFiles.length - 1 ?
                    allFiles[currentIndex + 1] : null

                return { prevComic, nextComic }
            }

            // Find adjacent comics
            const { prevComic, nextComic } = findAdjacentComics(comicsData, id)

            // Set state for previous and next comics
            if (prevComic) {
                setPreviousComic(prevComic.id)
            }

            if (nextComic) {
                setNextComic(nextComic.id)
                // Preload it in the background
                db.preloadComic({ id: nextComic.id, url: nextComic.link })
            }
        } catch (error) {
            console.error("Error preloading next comic:", error)
            // Don't show this error to user - preloading is a background operation
        }
    }

    // Navigation functions
    const handleHome = () => {
        router.push('/');
    };

    useEffect(() => {
        if (currentPage) {
            // if we are on the last page or the page before it log this comic as complete
            if (currentPage === images.length || currentPage === images.length - 1) {
                db.markComicStatus(id, "completed", currentPage)
            } else {
                db.markComicStatus(id, "in_progress", currentPage)
            }
            db.setTotalPages(id, images.length)
        }

    }, [currentPage, images.length])

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    };

    const scrollToBottom = () => {
        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
        });
    };

    const toggleOverlay = () => {
        setShowOverlay(prev => !prev);
    };

    // Add scroll listener to detect direction
    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            
            if (currentScrollY < lastScrollY - scrollThreshold) {
                // Scrolling up
                setScrollDirection('up');
                if (!showOverlay) {
                    setShowOverlay(true);
                }
            } else if (currentScrollY > lastScrollY + scrollThreshold) {
                // Scrolling down
                setScrollDirection('down');
            }
            
            setLastScrollY(currentScrollY);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        
        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, [lastScrollY, showOverlay]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4">
                <h2 className="text-xl mb-4">Loading Comic...</h2>
                {downloadStatus.isDownloading && (
                    <div className="w-full max-w-md">
                        <Progress value={downloadStatus.progress} className="h-2" />
                        <p className="text-center mt-2">{Math.round(downloadStatus.progress)}%</p>
                    </div>
                )}
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4">
                <h2 className="text-xl text-red-500 mb-4">{error}</h2>
                <Button onClick={handleHome} className="touch-manipulation hover:bg-blue-400">
                    <ArrowLeft className="mr-2" size={16} />
                    Back
                </Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col min-h-screen">
            {/* Header */}
            <div className="bg-background px-2 py-3 sm:p-4 flex items-center justify-between shadow-md top-0 z-10">
                <div className="flex items-center flex-1 min-w-0">
                    <Button variant="outline" size="icon" onClick={handleHome} className="touch-manipulation shrink-0 ">
                        <Home size={18} />
                    </Button>
                    <h1 className="ml-2 sm:ml-4 text-base sm:text-xl font-semibold truncate">
                        {comicName}
                    </h1>
                </div>
                <div className="text-xs sm:text-sm ml-2 shrink-0">
                    {currentPage}/{images.length}
                </div>
            </div>

            {/* Overlay */}
            <ComicOverlay
                visible={showOverlay}
                comicName={comicName}
                currentPage={currentPage ?? 1}
                totalPages={images.length}
                onClose={toggleOverlay}
                onScrollToTop={scrollToTop}
                onScrollToBottom={scrollToBottom}
                nextComic={nextComic}
                previousComic={previousComic}
            />

            {/* Comic View */}
            <ComicView
                images={images}
                onPageChange={setCurrentPage}
                onClick={toggleOverlay}
                initialPage={initialPage ?? 1}
            />


        </div>
    )
}
