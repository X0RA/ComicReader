"use client"
import { Button } from "@/components/ui/button"
import { ArrowUp, ArrowDown, Home, X, ArrowLeft, ArrowRight } from "lucide-react"
import Link from "next/link"

interface ComicOverlayProps {
  visible: boolean
  comicName: string
  currentPage: number
  totalPages: number
  onClose: () => void
  onScrollToTop: () => void
  onScrollToBottom: () => void
  nextComic: string | null
  previousComic: string | null
}

export default function ComicOverlay({
  visible,
  comicName,
  currentPage,
  totalPages,
  onClose,
  onScrollToTop,
  onScrollToBottom,
  nextComic,
  previousComic,
}: ComicOverlayProps) {
  if (!visible) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm z-50 transition-all duration-300 ease-in-out"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Close button at top right */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-9 w-9 text-white  hover:bg-white/10 hover:border-white/50 hover:text-white"
        onClick={onClose}
      >
        <X className="h-5 w-5" />
      </Button>

      <div className="max-w-md mx-auto px-2 py-3 pb-5">
        {/* Comic title with navigation arrows */}
        <div className="flex items-center justify-center gap-2 mb-4 mt-2">
          {/* Previous comic */}
          {previousComic ? (
            <Link href={`/read/${previousComic}`}>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 border border-white/30 ghost-white/30 text-white border border-white/30 hover:bg-white/10 hover:border-white/50 hover:text-white"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
          ) : (
            <Button variant="ghost" size="icon" className="h-11 w-11 text-white border border-white/30 opacity-40" disabled>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}

          {/* Comic info */}
          <div className="text-center text-white px-2 ">
            <h3 className="text-sm font-medium truncate max-w-[180px]">{comicName}</h3>
            <p className="text-xs opacity-80">
              Page {currentPage} of {totalPages}
            </p>
          </div>

          {/* Next comic */}
          {nextComic ? (
            <Link href={`/read/${nextComic}`}>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 text-white border border-white/30 hover:bg-white/10 hover:border-white/50 hover:text-white"
              >
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
          ) : (
            <Button variant="ghost" size="icon" className="h-11 w-11 text-white border border-white/30 opacity-40" disabled>
              <ArrowRight className="h-5 w-5" />
            </Button>
          )}
        </div>

        {/* Main controls - centered */}
        <div className="flex justify-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-12 w-12 text-white border border-white/30 hover:bg-white/10 hover:border-white/50 hover:text-white"
            onClick={onScrollToTop}
          >
            <ArrowUp className="h-6 w-6" />
          </Button>

          <Link href="/">
            <Button
              variant="ghost"
              size="icon"
              className="h-12 w-12 text-white border border-white/30 hover:bg-white/10 hover:border-white/50 hover:text-white"
            >
              <Home className="h-6 w-6" />
            </Button>
          </Link>

          <Button
            variant="ghost"
            size="icon"
            className="h-12 w-12 text-white border border-white/30 hover:bg-white/10 hover:border-white/50 hover:text-white"
            onClick={onScrollToBottom}
          >
            <ArrowDown className="h-6 w-6" />
          </Button>
        </div>
      </div>
    </div>
  )
}
