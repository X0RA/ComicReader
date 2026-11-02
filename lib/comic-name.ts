export interface ParsedComicName {
  title: string
  number: string | null
  metadata: string
  format: string | null
}

const KNOWN_EXTENSION = /\.(cbz|cbr|cb7|cbt|zip|rar|7z|tar|pdf|epub)$/i
const BRACKETED_GROUP = /\(([^()]*)\)|\[([^[\]]*)\]|\{([^{}]*)\}/g
const LABELLED_NUMBER = /(?:^|[\s-])(?:v|vol|volume|c|ch|chap|chapter|ep|episode)\.?\s*(\d+(?:\.\d+)?)(?=$|[^a-z0-9]|c\d)|#(\d+(?:\.\d+)?)(?=$|[^a-z0-9])/i
const BARE_NUMBER = /(?:^|\s)(\d+(?:\.\d+)?)(?=\s|$)/g
const YEAR_LIKE = /^(?:19|20)\d{2}$/

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim()

// Treats "_" as a space, and "." too when the name has no spaces (Fire.Punch.v01), keeping decimals like 1.5.
function normalizeSeparators(value: string) {
  const spaced = value.replace(/_+/g, " ")
  if (/\s/.test(spaced)) return spaced
  return spaced.replace(/\./g, (dot, index: number, whole: string) =>
    /\d/.test(whole[index - 1] ?? "") && /\d/.test(whole[index + 1] ?? "") ? dot : " "
  )
}

function parseNumber(title: string): string | null {
  const labelled = title.match(LABELLED_NUMBER)
  if (labelled) return labelled[1] ?? labelled[2]

  // Text after " - " is usually an author or subtitle, so prefer a number before it.
  const beforeSubtitle = title.split(/\s[-–—]\s/)[0]
  for (const candidate of [beforeSubtitle, title]) {
    const numbers = [...candidate.matchAll(BARE_NUMBER)]
      .filter((match) => {
        const isLeading = match.index === 0 && match[1].length !== candidate.length
        return !isLeading && !YEAR_LIKE.test(match[1])
      })
      .map((match) => match[1])
    if (numbers.length > 0) return numbers[numbers.length - 1]
  }
  return null
}

/**
 * Splits a comic filename into display parts, e.g.
 * "Fire Punch v01 (2018) (Digital) (Shizu).cbz" gives title "Fire Punch v01",
 * number "01", metadata "2018 · Digital · Shizu · CBZ" and format "CBZ".
 * Falls back to the raw filename when nothing usable is left for the title.
 */
export function parseComicName(rawName: string, extension?: string): ParsedComicName {
  const raw = String(rawName ?? "").trim()

  let stem = raw
  let ext = extension?.replace(/^\./, "") || null
  const knownExtension = raw.match(KNOWN_EXTENSION)
  if (knownExtension) {
    stem = raw.slice(0, knownExtension.index)
    ext = knownExtension[1]
  } else if (ext && raw.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) {
    stem = raw.slice(0, -(ext.length + 1))
  }
  const format = ext ? ext.toUpperCase() : null

  const tags = [...stem.matchAll(BRACKETED_GROUP)]
    .map((match) => collapseWhitespace(normalizeSeparators(match[1] ?? match[2] ?? match[3] ?? "")))
    .filter(Boolean)

  const cleaned = collapseWhitespace(normalizeSeparators(stem.replace(BRACKETED_GROUP, " ")))
    .replace(/^[\s\-–—_]+|[\s\-–—_]+$/g, "")

  return {
    title: cleaned || stem.trim() || raw,
    number: cleaned ? parseNumber(cleaned) : null,
    metadata: (format ? [...tags, format] : tags).join(" · "),
    format,
  }
}

// "fire_punch" -> "Fire Punch". Names that already have capitals are only de-underscored.
export function formatFolderTitle(name: string): string {
  const spaced = collapseWhitespace(name.replace(/_+/g, " "))
  if (!spaced) return name
  if (spaced !== spaced.toLowerCase()) return spaced
  return spaced.replace(/(^|\s)(\S)/g, (_, gap: string, letter: string) => gap + letter.toUpperCase())
}
