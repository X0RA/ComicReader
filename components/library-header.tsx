"use client"

import Link from "next/link"
import { ArrowLeftRight, Bookmark, BookOpen, Database } from "lucide-react"
import { ThemeSwitcher } from "@/components/theme-controls"

interface Crumb {
  id: string
  name: string
}

interface LibraryHeaderProps {
  // Folders from the library root down to the current one; the root is always shown as "Library".
  path?: Crumb[]
  onNavigate?: (folderId: string) => void
}

const crumbTargetClass =
  "flex min-h-11 min-w-0 items-center rounded-lg outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"

export function LibraryHeader({ path = [], onNavigate }: LibraryHeaderProps) {
  const folders = path.slice(1)
  const current = folders[folders.length - 1]
  const hasHiddenCrumbs = folders.length > 2

  return (
    <header className="flex items-center justify-between gap-4">
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 text-[15px] font-medium">
        <ol className="flex min-h-11 min-w-0 items-center gap-2">
          {current ? (
            <li className="-ml-3 shrink-0">
              <button
                type="button"
                aria-label="Library"
                title="Library"
                onClick={() => onNavigate?.(path[0].id)}
                className="flex size-11 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <BookOpen aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
              </button>
            </li>
          ) : (
            <li aria-current="page" className="flex items-center gap-2.5">
              <BookOpen aria-hidden="true" className="size-[18px] text-primary" strokeWidth={1.8} />
              Library
            </li>
          )}

          {/* Phones keep only the parent and current folder; earlier segments collapse to an ellipsis. */}
          {hasHiddenCrumbs && (
            <li aria-hidden="true" className="flex items-center gap-2 text-muted-foreground sm:hidden">
              <span>/</span>
              <span>…</span>
            </li>
          )}

          {folders.map((folder, index) => {
            const isCurrent = index === folders.length - 1
            const collapsesOnPhone = index < folders.length - 2
            return (
              <li
                key={folder.id}
                className={`min-w-0 items-center gap-2 ${collapsesOnPhone ? "hidden sm:flex" : "flex"}`}
              >
                <span aria-hidden="true" className="shrink-0 text-muted-foreground">/</span>
                {isCurrent ? (
                  <span aria-current="page" title={folder.name} className="truncate">
                    {folder.name}
                  </span>
                ) : (
                  <button
                    type="button"
                    title={folder.name}
                    onClick={() => onNavigate?.(folder.id)}
                    className={`${crumbTargetClass} text-muted-foreground`}
                  >
                    <span className="truncate">{folder.name}</span>
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="-mr-2.5 flex shrink-0 gap-1 sm:mr-0">
        <Link href="/bookmarks" aria-label="Bookmarks" title="Bookmarks" className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <Bookmark aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
        </Link>
        <Link
          href="/downloaded"
          aria-label="Storage"
          title="Storage"
          className="flex size-11 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Database aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
        </Link>
        <Link href="/backup" aria-label="Backup & transfer" title="Backup & transfer" className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"><ArrowLeftRight aria-hidden="true" className="size-[18px]" strokeWidth={1.8} /></Link>
        <ThemeSwitcher />
      </div>
    </header>
  )
}
