/**
 * Shared novel-text normalization for chapter offsets and reading.
 *
 * Only unify line endings. Do NOT collapse newlines to spaces here —
 * offsets from detectChapters must match the string used by loadBookPages.
 * Display-time whitespace collapsing belongs in the tray/render path.
 */
export function normalizeNovelText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}
