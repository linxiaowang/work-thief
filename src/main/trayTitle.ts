/** Hard cap so title stays visible under the notch / crowded status items. */
export const MENU_BAR_TITLE_MAX = 28
export const MENU_BAR_TITLE_RETRY = 16

/**
 * Flatten + hard-cap for menu bar. Default max 28 so page body stays visible.
 */
export function truncateForMenuBar(text: string, maxChars: number = MENU_BAR_TITLE_MAX): string {
  const oneLine = text.replace(/\s*\n\s*/g, ' ').replace(/　+/g, ' ').trim()
  if (oneLine.length <= maxChars) return oneLine
  if (maxChars <= 1) return oneLine.slice(0, maxChars)
  return oneLine.slice(0, Math.max(0, maxChars - 1)) + '…'
}
