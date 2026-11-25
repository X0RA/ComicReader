"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { BookOpen, Play } from "lucide-react"
import { getComicDownloadStatus } from "@/lib/downloads"
import { parseComicName } from "@/lib/comic-name"

function useCachedCover(comicId: string) {
  const [cover, setCover] = useState<{ id: string; url?: string }>()
  useEffect(() => {
    let active = true
    void getComicDownloadStatus(comicId).then(row => {
      if (active) setCover({ id: comicId, url: row?.status === "completed" ? row.coverThumbnail : undefined })
    }).catch(console.warn)
    return () => { active = false }
  }, [comicId])
  return cover?.id === comicId ? cover.url : undefined
}

interface ContinueCardProps {
  comic: {
    id: string
    name: string
    extension?: string
    lastPage?: number
    totalPages?: number
  }
}

export function ContinueCard({ comic }: ContinueCardProps) {
  const coverUrl = useCachedCover(comic.id)
  const [brokenCoverUrl, setBrokenCoverUrl] = useState<string | null>(null)
  const { title } = parseComicName(comic.name, comic.extension)
  const page = comic.lastPage ?? 0
  const total = comic.totalPages ?? 0
  const percent = total > 0 ? Math.min(100, (page / total) * 100) : 0
  const showCover = coverUrl && coverUrl !== brokenCoverUrl

  const progressLabel = total > 0 ? `${page} / ${total}` : page > 0 ? `Page ${page}` : "Not started"
  const spokenProgress = total > 0 ? `page ${page} of ${total}` : page > 0 ? `page ${page}` : "not started"

  return (
    <Link
      href={`/read/${encodeURIComponent(comic.id)}`}
      prefetch={false}
      title={comic.name}
      aria-label={`Continue reading ${title}, ${spokenProgress}`}
      className="flex items-center gap-3.5 rounded-2xl border bg-card p-3 text-card-foreground outline-none transition-colors hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:gap-5 sm:p-4"
    >
      <div className="flex h-[68px] w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground sm:h-[92px] sm:w-16">
        {showCover ? (
          // eslint-disable-next-line @next/next/no-img-element -- local thumbnail from the downloaded comic
          <img
            src={coverUrl}
            alt=""
            onError={() => setBrokenCoverUrl(coverUrl)}
            className="size-full object-cover"
          />
        ) : (
          <BookOpen aria-hidden="true" className="size-5 sm:size-6" strokeWidth={1.8} />
        )}
      </div>

      <div className="flex min-w-0 flex-auto flex-col gap-2 sm:gap-2.5">
        <div className="text-[11px] font-medium tracking-[0.08em] text-primary uppercase sm:text-xs">Continue</div>
        <div className="truncate text-base font-semibold sm:text-xl sm:tracking-[-0.01em]">{title}</div>
        <div className="flex items-center gap-2.5 sm:gap-3">
          {total > 0 && (
            <div className="h-[3px] flex-auto overflow-hidden rounded-full bg-muted sm:max-w-[280px]">
              <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
          )}
          <span className="font-mono text-[11px] whitespace-nowrap text-muted-foreground sm:text-xs">
            {progressLabel}
          </span>
        </div>
      </div>

      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground sm:size-12"
      >
        <Play className="size-4 fill-current sm:size-[18px]" strokeWidth={0} />
      </span>
    </Link>
  )
}
