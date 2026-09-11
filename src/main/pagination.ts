/**
 * Pagination — Thief-style fixed windows over a normalized book string.
 *
 * Normalize whole book first (newlines→spaces, collapse whitespace),
 * then slice with no overlap and no per-page trim.
 *
 * Blank / whitespace-only windows can still appear when paging raw or
 * partially-normalized text (e.g. newline runs between chapters). Callers
 * must skip those for tray display — never Tray.setTitle('').
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

/** Tray would show nothing useful — null, empty, or whitespace/newlines only. */
export function isBlankPage(page: string | null | undefined): boolean {
  if (page == null) return true
  return page.replace(/\s+/g, '').length === 0
}

/**
 * Walk from `from` in `direction` until a non-blank page.
 * If none in that direction, search the opposite way; finally clamp `from`.
 */
export function findNonEmptyPageIndex(
  pages: string[],
  from: number,
  direction: 1 | -1 = 1
): number {
  if (pages.length === 0) return 0
  const clamped = Math.max(0, Math.min(from, pages.length - 1))

  for (let i = clamped; i >= 0 && i < pages.length; i += direction) {
    if (!isBlankPage(pages[i])) return i
  }
  const opposite: 1 | -1 = direction === 1 ? -1 : 1
  for (let i = clamped; i >= 0 && i < pages.length; i += opposite) {
    if (!isBlankPage(pages[i])) return i
  }
  return clamped
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
 * Locate the chapter's first character in the reading string.
 * Prefer a validated startOffset (must point at title); else nth title match.
 */
export function resolveChapterStartOffset(
  text: string,
  chapter: { title: string; startOffset?: number },
  occurrence = 0
): number | null {
  if (!text) return null
  const title = chapter.title?.trim() ?? ''
  const stored = chapter.startOffset

  if (
    title &&
    typeof stored === 'number' &&
    Number.isFinite(stored) &&
    stored >= 0 &&
    stored < text.length &&
    text.startsWith(title, stored)
  ) {
    return stored
  }

  if (!title) {
    if (typeof stored === 'number' && Number.isFinite(stored) && stored >= 0) {
      return Math.min(stored, Math.max(0, text.length - 1))
    }
    return null
  }

  let from = 0
  let idx = -1
  for (let n = 0; n <= occurrence; n++) {
    idx = text.indexOf(title, from)
    if (idx < 0) return null
    from = idx + Math.max(1, title.length)
  }
  return idx
}

/**
 * Resolve a chapter jump to a book-wide page index from the chapter's first char.
 * Prefers validated startOffset; falls back to nth title match in reading text.
 * When `pages` is provided, uses selectPageForOffset + skips leading blank pages.
 * Returns null if the chapter cannot be located.
 */
export function resolveChapterJumpPageIndex(
  text: string,
  chapter: { title: string; startOffset?: number },
  charsPerPage: number,
  occurrence = 0,
  pages?: string[]
): number | null {
  const offset = resolveChapterStartOffset(text, chapter, occurrence)
  if (offset == null) return null

  let pageIndex: number
  if (pages && pages.length > 0) {
    pageIndex = selectPageForOffset(pages, offset).pageIndex
    pageIndex = findNonEmptyPageIndex(pages, pageIndex, 1)
  } else {
    const limit = Math.max(10, charsPerPage)
    pageIndex = Math.floor(offset / limit)
  }
  return pageIndex
}

export const _internals = { DEFAULT_CHARS_PER_PAGE }
