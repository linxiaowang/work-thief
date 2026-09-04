/**
 * Pagination — split chapter text into menu-bar-sized pages.
 *
 * Default ~40 chars; prefer sentence / paragraph breaks.
 */

const DEFAULT_CHARS_PER_PAGE = 40

export function paginate(text: string, maxChars: number = DEFAULT_CHARS_PER_PAGE): string[] {
  const limit = Math.max(10, maxChars)
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!normalized) return []
  if (normalized.length <= limit) return [normalized]

  const pages: string[] = []
  let cursor = 0

  while (cursor < normalized.length) {
    const remaining = normalized.slice(cursor)
    if (remaining.length <= limit) {
      pages.push(remaining)
      break
    }

    const window = remaining.slice(0, limit)
    let breakAt = window.lastIndexOf('\n\n')
    if (breakAt < 0) breakAt = findLastSentenceEnd(window)
    if (breakAt < 0) breakAt = window.lastIndexOf('\n')
    if (breakAt < 0) breakAt = findLastWhitespace(window)
    if (breakAt <= 0) breakAt = limit

    const page = normalized.slice(cursor, cursor + breakAt).trim()
    if (page) pages.push(page)
    cursor += breakAt
    while (normalized[cursor] === '\n' || normalized[cursor] === ' ') cursor++
  }

  return pages
}

function findLastSentenceEnd(window: string): number {
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

/** Pick the page whose start is nearest to approxOffset (char offset in chapter). */
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
