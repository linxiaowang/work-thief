/** Hard cap so title stays visible under the notch / crowded status items. */
export const MENU_BAR_TITLE_MAX = 28
export const MENU_BAR_TITLE_RETRY = 16

/**
 * Flatten + hard-cap for menu bar. Default max 28 so page body stays visible.
 * Use only for non-reading titles (hints, errors, disguise). Reading titles
 * must be composed via buildPageSuffix + bodyMax so the page is never trimmed.
 */
export function truncateForMenuBar(text: string, maxChars: number = MENU_BAR_TITLE_MAX): string {
  const oneLine = text.replace(/\s*\n\s*/g, ' ').replace(/　+/g, ' ').trim()
  if (oneLine.length <= maxChars) return oneLine
  if (maxChars <= 1) return oneLine.slice(0, maxChars)
  return oneLine.slice(0, Math.max(0, maxChars - 1)) + '…'
}

export interface PageSuffixOptions {
  showPageNumber: boolean
  /** Last page — append 「·完」. */
  isLast: boolean
}

/**
 * Compute the page# / ·完 suffix BEFORE sizing the body.
 * Callers must slice the page to fit MENU_BAR_TITLE_MAX - suffix.length.
 */
export function buildPageSuffix(
  pageIndex: number,
  totalPages: number,
  options: PageSuffixOptions
): string {
  let suffix = ''
  if (options.showPageNumber && totalPages > 0) {
    suffix = `·${pageIndex + 1}/${totalPages}`
  }
  if (options.isLast && totalPages > 0) {
    suffix = `${suffix}·完`
  }
  return suffix
}

/** Body room left under the hard cap after reserving suffix (at least 10). */
export function bodyMaxForSuffix(suffix: string): number {
  return Math.max(10, MENU_BAR_TITLE_MAX - suffix.length)
}

/**
 * Effective chars-per-page so every page+suffix fits under MENU_BAR_TITLE_MAX.
 * Uses the longest suffix for the book (last page with ·完) and iterates until
 * page-count digits stabilize.
 */
export function resolveEffectiveCharsPerPage(
  textLength: number,
  settingsChars: number,
  showPageNumber: boolean
): number {
  const requested = Math.max(10, settingsChars)
  if (textLength <= 0) return requested

  let chars = requested
  for (let i = 0; i < 8; i++) {
    const totalPages = Math.max(1, Math.ceil(textLength / chars))
    const worstSuffix = buildPageSuffix(totalPages - 1, totalPages, {
      showPageNumber,
      isLast: true
    })
    const bodyMax = bodyMaxForSuffix(worstSuffix)
    const next = Math.max(10, Math.min(requested, bodyMax))
    if (next === chars) return chars
    chars = next
  }
  return chars
}

/**
 * Compose reading title: page body + precomputed suffix.
 * NEVER trims the page — caller must have sliced to bodyMax.
 */
export function composeReadingTitle(page: string, suffix: string): string {
  return `${page}${suffix}`
}
