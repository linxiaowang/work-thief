/**
 * Pagination — Thief-style fixed windows over a normalized book string.
 *
 * Normalize whole book first (newlines→spaces, collapse whitespace),
 * then slice with no overlap and no per-page trim.
 */

import { normalizeNovelText } from './parsers/normalize'

const DEFAULT_CHARS_PER_PAGE = 20

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
 * Resolve a chapter jump by locating chapter.title in the reading text.
 * Ignores stored startOffset (legacy imports may be misaligned).
 * occurrence = 0-based nth match (for duplicate titles).
 * pageIndex = floor(idx / charsPerPage). Returns null if title not found.
 */
export function resolveChapterJumpPageIndex(
  text: string,
  chapter: { title: string },
  charsPerPage: number,
  occurrence = 0
): number | null {
  const title = chapter.title?.trim() ?? ''
  if (!title || !text) return null

  const limit = Math.max(10, charsPerPage)
  let from = 0
  let idx = -1
  for (let n = 0; n <= occurrence; n++) {
    idx = text.indexOf(title, from)
    if (idx < 0) return null
    from = idx + Math.max(1, title.length)
  }
  return Math.floor(idx / limit)
}

export const _internals = { DEFAULT_CHARS_PER_PAGE }
