/**
 * Shared novel-text normalization for chapter offsets and reading.
 *
 * Line endings must be unified before chapter detection (needs newlines).
 * Reading / paging uses Thief-style collapse so fixed windows stay continuous.
 */

/** Unify CRLF / CR → LF only (keeps newlines for chapter regexes). */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/**
 * Reading / paging normalization (Thief-style):
 * newlines → spaces, collapse whitespace, trim once on the whole book.
 * loadBookPages and import offsets must share this string.
 */
export function normalizeNovelText(text: string): string {
  return normalizeLineEndings(text)
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
