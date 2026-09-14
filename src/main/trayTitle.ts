/** Hard cap so title stays visible under the notch / crowded status items. */
export const MENU_BAR_TITLE_MAX = 28
export const MENU_BAR_TITLE_RETRY = 16
/**
 * macOS status items truncate by pixel width, not char count — CJK ≈ 2× ASCII.
 * Keep page+suffix under this budget so setTitle is not rejected / blanked.
 */
export const MENU_BAR_DISPLAY_MAX = 72

/**
 * macOS NSStatusItem often shows a blank label while getTitle() still returns text.
 * Never setTitle above this width budget; pagination uses the same clamp.
 */
export const SAFE_TRAY_DISPLAY_UNITS = 44

export function safeTrayDisplayUnits(measured: number): number {
  const n = Number.isFinite(measured) ? measured : 56
  return Math.min(SAFE_TRAY_DISPLAY_UNITS, Math.max(28, Math.round(n)))
}

/** Suffix actually drawn in the menu bar title (page# may live in tooltip only). */
export function menuBarTitleSuffix(
  pageIndex: number,
  totalPages: number,
  options: PageSuffixOptions
): string {
  if (options.showPageNumber) {
    if (options.isLast && totalPages > 0) return '·完'
    return ''
  }
  return buildPageSuffix(pageIndex, totalPages, options)
}

/** Longest suffix that can appear in the menu bar for this book — used to size pages. */
export function worstMenuBarSuffixForPaging(
  totalPages: number,
  showPageNumber: boolean
): string {
  if (totalPages <= 0) return ''
  if (showPageNumber) {
    return '·完'
  }
  return buildPageSuffix(totalPages - 1, totalPages, {
    showPageNumber: false,
    isLast: true
  })
}

/** Largest page body (chars) so even all-CJK text + suffix fits display width. */
export function maxBodyCharsForDisplay(
  suffix: string,
  maxUnits: number = MENU_BAR_DISPLAY_MAX,
  charCeiling: number = 120
): number {
  let lo = 10
  let hi = Math.max(10, charCeiling)
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (menuBarDisplayUnits('甲'.repeat(mid) + suffix) <= maxUnits) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Approximate menu-bar width units (CJK / fullwidth ≈ 2, ASCII ≈ 1). */
export function menuBarDisplayUnits(text: string): number {
  let units = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    units += code <= 0xff ? 1 : 2
  }
  return units
}

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
export function bodyMaxForSuffix(
  suffix: string,
  displayMaxUnits: number = MENU_BAR_DISPLAY_MAX,
  charCeiling = 120
): number {
  return maxBodyCharsForDisplay(suffix, displayMaxUnits, charCeiling)
}

/**
 * Trim page body from the end until page+suffix fits MENU_BAR_DISPLAY_MAX.
 * Tooltip can still show the full page; this is for tray setTitle only.
 */
export function slicePageBodyForMenuBarDisplay(
  page: string,
  suffix: string,
  displayMaxUnits: number = MENU_BAR_DISPLAY_MAX
): string {
  if (!page) return page
  let body = page
  while (
    body.length > 1 &&
    menuBarDisplayUnits(body + suffix) > displayMaxUnits
  ) {
    body = body.slice(0, -1)
  }
  return body
}

/** True when page+suffix is safe for macOS tray title width. */
export function readingTitleFitsMenuBar(
  page: string,
  suffix: string,
  displayMaxUnits: number = MENU_BAR_DISPLAY_MAX
): boolean {
  return menuBarDisplayUnits(page + suffix) <= displayMaxUnits
}

/**
 * Effective chars-per-page so every page+suffix fits under MENU_BAR_TITLE_MAX.
 * Uses the longest suffix for the book (last page with ·完) and iterates until
 * page-count digits stabilize.
 */
export function resolveEffectiveCharsPerPage(
  textLength: number,
  settingsChars: number,
  showPageNumber: boolean,
  displayMaxUnits: number = MENU_BAR_DISPLAY_MAX
): number {
  const requested = Math.max(10, settingsChars)
  if (textLength <= 0) return requested

  let chars = requested
  for (let i = 0; i < 8; i++) {
    const totalPages = Math.max(1, Math.ceil(textLength / chars))
    const worstSuffix = worstMenuBarSuffixForPaging(totalPages, showPageNumber)
    const bodyMax = bodyMaxForSuffix(worstSuffix, displayMaxUnits, requested)
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
