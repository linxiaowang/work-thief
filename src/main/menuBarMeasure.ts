import { screen, type Tray } from 'electron'
import { worstMenuBarSuffixForPaging } from './trayTitle'

/** Fallback when screen / probe unavailable (tests, non-macOS). */
export const MENU_BAR_DISPLAY_FALLBACK = 56

/** macOS rejects extremely long NSStatusItem titles; pagination stays below CAP. */
export const MENU_BAR_DISPLAY_MIN = 36
export const MENU_BAR_DISPLAY_CAP = 56

/**
 * Estimate tray-label width from primary display.
 * workAreaSize.width is already in logical pixels — do not divide by scaleFactor.
 */
export function estimateMenuBarDisplayUnits(): number {
  try {
    const primary = screen.getPrimaryDisplay()
    const w = primary.workAreaSize.width
    const pxBudget = Math.min(420, Math.max(200, Math.floor(w * 0.28)))
    const units = Math.floor(pxBudget / 6)
    return Math.max(MENU_BAR_DISPLAY_MIN, Math.min(MENU_BAR_DISPLAY_CAP, units))
  } catch {
    return MENU_BAR_DISPLAY_FALLBACK
  }
}

/**
 * @deprecated Live tray probing — getTitle() on macOS is unreliable (false positives / blanks).
 * Kept for tests; production uses estimate only.
 */
export function probeTrayDisplayUnits(tray: Tray, suffixSample: string): number {
  void tray
  void suffixSample
  return estimateMenuBarDisplayUnits()
}

export function resolveMenuBarDisplayUnits(
  _tray: Tray | null,
  _suffixSample: string
): number {
  return estimateMenuBarDisplayUnits()
}

/** Bucket display units so minor probe jitter does not rebuild pages every render. */
export function displayUnitsCacheKey(units: number): number {
  return Math.round(units / 4) * 4
}

export function suffixSampleForPaging(showPageNumber: boolean): string {
  return worstMenuBarSuffixForPaging(9999, showPageNumber)
}
