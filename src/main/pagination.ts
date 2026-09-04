/**
 * Pagination — split long chapter text into "pages" that fit in the
 * macOS menu bar.
 *
 * macOS menu bar height is ~22pt; at 13pt font that fits about 30-50
 * Chinese characters per line, depending on punctuation width. We aim
 * for ~50 chars per page, but prefer to break on sentence boundaries
 * (。！？) or paragraph breaks (\n\n) so we never split a sentence
 * mid-character.
 */

const MAX_CHARS_PER_PAGE = 50

/**
 * Split a chunk of text into roughly-equal pages, preferring to break
 * at sentence or paragraph boundaries.
 */
export function paginate(text: string, maxChars: number = MAX_CHARS_PER_PAGE): string[] {
  // Normalize whitespace: collapse runs of \n into paragraph breaks.
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!normalized) return []
  if (normalized.length <= maxChars) return [normalized]

  const pages: string[] = []
  let cursor = 0

  while (cursor < normalized.length) {
    const remaining = normalized.slice(cursor)
    if (remaining.length <= maxChars) {
      pages.push(remaining)
      break
    }

    // Look for the best break point within the page window.
    const window = remaining.slice(0, maxChars)

    // 1. Try paragraph break (\n\n) — preferred.
    let breakAt = window.lastIndexOf('\n\n')
    // 2. Try sentence-ending punctuation (Chinese or English).
    if (breakAt < 0) breakAt = findLastSentenceEnd(window)
    // 3. Try single newline.
    if (breakAt < 0) breakAt = window.lastIndexOf('\n')
    // 4. Try any whitespace.
    if (breakAt < 0) breakAt = findLastWhitespace(window)
    // 5. Hard cut at maxChars.
    if (breakAt <= 0) breakAt = maxChars

    const page = normalized.slice(cursor, cursor + breakAt).trim()
    if (page) pages.push(page)
    // Skip the break chars themselves.
    cursor += breakAt
    while (normalized[cursor] === '\n' || normalized[cursor] === ' ') cursor++
  }

  return pages
}

function findLastSentenceEnd(window: string): number {
  // Look for the last occurrence of 。 ！ ？ .  !  ?
  let best = -1
  for (const ch of ['。', '！', '？', '. ', '! ', '? ']) {
    const idx = window.lastIndexOf(ch)
    if (idx > best) best = idx + ch.length
  }
  return best
}

function findLastWhitespace(window: string): number {
  for (let i = window.length - 1; i >= 0; i--) {
    if (/\s/.test(window[i])) return i
  }
  return -1
}

/**
 * Build a short preview string for the menu bar given a list of page
 * candidates. Picks the page starting near `approxStart` (character
 * offset within the chapter).
 */
export function selectPageForOffset(
  pages: string[],
  approxOffset: number
): { pageIndex: number; page: string } {
  if (pages.length === 0) return { pageIndex: 0, page: '' }
  if (pages.length === 1) return { pageIndex: 0, page: pages[0] }

  // Approximate: each page is ~maxChars long, so divide.
  const idx = Math.min(pages.length - 1, Math.floor(approxOffset / MAX_CHARS_PER_PAGE))
  return { pageIndex: idx, page: pages[idx] }
}
