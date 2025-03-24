"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"

interface ComicViewProps {
  images: string[]
  onPageChange?: (pageNumber: number) => void
  onClick?: () => void
  initialPage?: number
}

export default function ComicView({ 
  images, 
  onPageChange, 
  onClick, 
  initialPage = 1 
}: ComicViewProps) {
  const [currentPage, setCurrentPage] = useState(initialPage || 1)
  const [loadedImages, setLoadedImages] = useState<boolean[]>([])
  const observerRefs = useRef<(HTMLDivElement | null)[]>([])
  const visibilityMap = useRef<Map<number, number>>(new Map())
  const hasScrolledToInitial = useRef(false)

  // Initialize loaded images state
  useEffect(() => {
    // Determine which images to preload initially
    const initialLoaded = images.map((_, i) => {
      // Load first 3 images plus the initial page and a couple pages around it
      return i < 3 || 
        (initialPage && (i === initialPage - 1 || 
                         i === initialPage || 
                         i === initialPage - 2))
    })
    // @ts-ignore
    setLoadedImages(initialLoaded)
  }, [images, initialPage])

  // Scroll to initial page on first load
  useEffect(() => {
    if (!images.length || !initialPage || initialPage <= 1 || hasScrolledToInitial.current) return

    // Wait for images to be available in the DOM
    const timer = setTimeout(() => {
      const targetElement = observerRefs.current[initialPage - 1]
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'auto', block: 'start' })
        hasScrolledToInitial.current = true
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [images.length, initialPage, observerRefs.current])

  // Set up intersection observer to track which page is most visible
  useEffect(() => {
    if (!images.length) return

    const options = {
      root: null, // viewport
      rootMargin: "100px", // Load images a bit before they enter viewport
      threshold: Array.from({ length: 21 }, (_, i) => i * 0.05), // More granular thresholds (0, 0.05, 0.1, ..., 1)
    }

    const observer = new IntersectionObserver((entries) => {
      // Update visibility ratios for entries
      entries.forEach((entry) => {
        const index = Number(entry.target.getAttribute("data-index"))
        if (!isNaN(index)) {
          visibilityMap.current.set(index, entry.intersectionRatio)
          
          // Mark image as should load when it's near or in the viewport
          if (entry.isIntersecting) {
            setLoadedImages(prev => {
              const newLoaded = [...prev]
              newLoaded[index] = true
              return newLoaded
            })
          }
        }
      })

      // Find the most visible page
      let maxVisibility = 0
      let mostVisibleIndex = -1

      visibilityMap.current.forEach((ratio, index) => {
        if (ratio > maxVisibility) {
          maxVisibility = ratio
          mostVisibleIndex = index
        }
      })

      // Update current page if we found a valid most visible page
      if (mostVisibleIndex !== -1) {
        const newPage = mostVisibleIndex + 1
        if (newPage !== currentPage) {
          setCurrentPage(newPage)
          if (onPageChange) onPageChange(newPage)
        }
      }
    }, options)

    // Clear previous visibility data
    visibilityMap.current.clear()

    // Observe all page elements
    observerRefs.current.forEach((ref, index) => {
      if (ref) {
        observer.observe(ref)
        // Initialize with zero visibility
        visibilityMap.current.set(index, 0)
      }
    })

    return () => {
      observer.disconnect()
    }
  }, [images.length, onPageChange, currentPage])

  // Handle empty state
  if (!images.length) {
    return (
      <div className="p-8 text-center">
        <p>No images found in this comic.</p>
      </div>
    )
  }

  return (
    <div className="comic-container w-full overflow-y-auto h-full" onClick={onClick}>
      <div className="comic-pages flex flex-col items-center w-full">
        {images.map((image, index) => (
          <div
            key={index}
            className="comic-page w-full"
            style={{ marginBottom: 0, minHeight: "100px" }}
            // @ts-ignore
            ref={(el) => (observerRefs.current[index] = el)}
            data-index={index}
          >
            {loadedImages[index] ? (
              <div className="w-full relative">
                {/* Use unoptimized for blob images */}
                <Image
                  src={image || "/placeholder.svg"}
                  alt={`Page ${index + 1}`}
                  className="w-full h-auto object-contain"
                  width={0}
                  height={0}
                  sizes="100vw"
                  priority={index < 3 || index === initialPage - 1}
                  unoptimized={true}
                  style={{ width: '100%', height: 'auto' }}
                />
              </div>
            ) : (
              <div className="w-full flex justify-center items-center py-8">
                <div className="animate-pulse bg-gray-200 w-full h-60 rounded" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
