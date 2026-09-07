import { getDb } from './client'
import type { Book } from '@shared/types'

interface BookRow {
  id: number
  title: string
  file_path: string
  file_size: number
  encoding: string
  chapter_count: number
  total_chars: number
  imported_at: number
  last_opened_at: number | null
  cover_color: string
  missing: number
}

function rowToBook(r: BookRow): Book {
  return {
    id: r.id,
    title: r.title,
    filePath: r.file_path,
    fileSize: r.file_size,
    encoding: r.encoding,
    chapterCount: r.chapter_count,
    totalChars: r.total_chars,
    importedAt: r.imported_at,
    lastOpenedAt: r.last_opened_at,
    coverColor: r.cover_color,
    missing: r.missing === 1
  }
}

export function listBooks(): Book[] {
  const d = getDb()
  const rows = d
    .prepare(
      `SELECT * FROM books ORDER BY
         CASE WHEN last_opened_at IS NULL THEN 1 ELSE 0 END,
         last_opened_at DESC,
         imported_at DESC`
    )
    .all() as BookRow[]
  return rows.map(rowToBook)
}

export function getBook(id: number): Book | null {
  const d = getDb()
  const row = d.prepare('SELECT * FROM books WHERE id = ?').get(id) as BookRow | undefined
  return row ? rowToBook(row) : null
}

export function getBookByPath(filePath: string): Book | null {
  const d = getDb()
  const row = d.prepare('SELECT * FROM books WHERE file_path = ?').get(filePath) as
    | BookRow
    | undefined
  return row ? rowToBook(row) : null
}

export interface InsertBookInput {
  title: string
  filePath: string
  fileSize: number
  encoding: string
  chapterCount: number
  totalChars: number
  coverColor: string
}

export function insertBook(input: InsertBookInput): Book {
  const d = getDb()
  const stmt = d.prepare(
    `INSERT INTO books
      (title, file_path, file_size, encoding, chapter_count, total_chars, imported_at, cover_color, missing)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`
  )
  const result = stmt.run(
    input.title,
    input.filePath,
    input.fileSize,
    input.encoding,
    input.chapterCount,
    input.totalChars,
    Date.now(),
    input.coverColor
  )
  return getBook(Number(result.lastInsertRowid))!
}

export function touchBookOpened(id: number): void {
  const d = getDb()
  d.prepare('UPDATE books SET last_opened_at = ? WHERE id = ?').run(Date.now(), id)
}

export function deleteBook(id: number): void {
  const d = getDb()
  d.prepare('DELETE FROM books WHERE id = ?').run(id)
}

export function renameBook(id: number, title: string): void {
  const d = getDb()
  d.prepare('UPDATE books SET title = ? WHERE id = ?').run(title.trim(), id)
}

export function markBookMissing(id: number, missing: boolean): void {
  const d = getDb()
  d.prepare('UPDATE books SET missing = ? WHERE id = ?').run(missing ? 1 : 0, id)
}


export function updateBookParseMeta(
  id: number,
  meta: { encoding: string; chapterCount: number; totalChars: number }
): void {
  const d = getDb()
  d.prepare(
    `UPDATE books SET encoding = ?, chapter_count = ?, total_chars = ? WHERE id = ?`
  ).run(meta.encoding, meta.chapterCount, meta.totalChars, id)
}

export { _setDbForTesting } from './client'
