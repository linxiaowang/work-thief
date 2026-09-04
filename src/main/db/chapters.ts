import { getDb } from './client'
import type { Chapter } from '@shared/types'

interface ChapterRow {
  id: number
  book_id: number
  idx: number
  title: string
  start_offset: number
  char_count: number
}

function rowToChapter(r: ChapterRow): Chapter {
  return {
    id: r.id,
    bookId: r.book_id,
    index: r.idx,
    title: r.title,
    startOffset: r.start_offset,
    charCount: r.char_count
  }
}

export function listChapters(bookId: number): Chapter[] {
  const d = getDb()
  const rows = d
    .prepare('SELECT * FROM chapters WHERE book_id = ? ORDER BY idx ASC')
    .all(bookId) as ChapterRow[]
  return rows.map(rowToChapter)
}

export function getChapter(bookId: number, index: number): Chapter | null {
  const d = getDb()
  const row = d
    .prepare('SELECT * FROM chapters WHERE book_id = ? AND idx = ?')
    .get(bookId, index) as ChapterRow | undefined
  return row ? rowToChapter(row) : null
}

export interface InsertChapterInput {
  bookId: number
  index: number
  title: string
  startOffset: number
  charCount: number
}

/**
 * Replace all chapters for a book in a single transaction. Used when
 * re-importing a file (e.g. user renamed, content changed).
 */
export function replaceChapters(bookId: number, chapters: InsertChapterInput[]): void {
  const d = getDb()
  const tx = d.transaction(() => {
    d.prepare('DELETE FROM chapters WHERE book_id = ?').run(bookId)
    const stmt = d.prepare(
      'INSERT INTO chapters (book_id, idx, title, start_offset, char_count) VALUES (?, ?, ?, ?, ?)'
    )
    for (const c of chapters) {
      stmt.run(c.bookId, c.index, c.title, c.startOffset, c.charCount)
    }
  })
  tx()
}

export function countChapters(bookId: number): number {
  const d = getDb()
  const row = d
    .prepare('SELECT COUNT(*) as cnt FROM chapters WHERE book_id = ?')
    .get(bookId) as { cnt: number }
  return row.cnt
}
