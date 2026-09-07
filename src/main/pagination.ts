/**
 * Pagination — Thief-style fixed windows over a normalized book string.
 *
 * Normalize whole book first (newlines→spaces, collapse whitespace),
 * then slice with no overlap and no per-page trim.
 */

import { normalizeNovelText } from './parsers/normalize'

const DEFAULT_CHARS_PER_PAGE = 40

export function paginate(text: string, maxChars: number = DEFAULT_CHARS_PER_PAGE): string[] {
  const limit = Math.max(10, maxChars)
  const normalized = normalizeNovelText(text)

  if (!normalized) return []

  const pages: string[] = []
  for (let i = 0; i < normalized.length; i += limit) {
    // Fixed window: no overlap, never trim individual pages.
    pages.push(normalized.slice(i, i + limit))
  }
  return pages
}

/** The normalized reading string that paginate slices (pages.join('') === this). */
export function readingTextOf(text: string): string {
  return normalizeNovelText(text)
}

/** Pick the page whose start is nearest to approxOffset (char offset in reading text). */
export function selectPageForOffset(
  pages: string[],
  approxOffset: number
): { pageIndex: number; page: string } {
  if (pages.length === 0) return { pageIndex: 0, page: '' }
  if (pages.length === 1) return { pageIndex: 0, page: pages[0] }

  let cursor = 0
  for (let i = 0; i < pages.length; i++) {
    const next = cursor + pages[i].length
    if (approxOffset < next || i === pages.length - 1) {
      return { pageIndex: i, page: pages[i] }
    }
    cursor = next
  }
  return { pageIndex: pages.length - 1, page: pages[pages.length - 1] }
}

/**
 * Resolve a chapter jump to a book-wide page index.
 * Prefer normalized startOffset; if that misses the title in body, locate by title.
 * Returns null when neither offset nor title can be resolved.
 */
export function resolveChapterJumpPageIndex(
  pages: string[],
  text: string,
  chapter: { startOffset: number; title: string }
): number | null {
  if (pages.length === 0 || !text) return null

  const title = chapter.title?.trim() ?? ''
  const titleAt = title ? text.indexOf(title) : -1

  let offset: number | null = null
  if (chapter.startOffset >= 0 && chapter.startOffset <= text.length) {
    offset = chapter.startOffset
    // If title exists in body but not near this offset, prefer title location
    // (covers legacy imports where offsets were computed on differently normalized text).
    if (titleAt >= 0) {
      const around = text.slice(
        Math.max(0, offset - 2),
        Math.min(text.length, offset + title.length + 8)
      )
      if (!around.includes(title)) {
        offset = titleAt
      }
    }
  } else if (titleAt >= 0) {
    offset = titleAt
  }

  if (offset == null) return null
  return selectPageForOffset(pages, offset).pageIndex
}
