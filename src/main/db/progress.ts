import { getDb } from './client'
import type { Progress } from '@shared/types'

interface ProgressRow {
  book_id: number
  chapter_index: number
  chapter_progress: number
  last_read_at: number
}

function rowToProgress(r: ProgressRow): Progress {
  return {
    bookId: r.book_id,
    chapterIndex: r.chapter_index,
    chapterProgress: r.chapter_progress,
    lastReadAt: r.last_read_at
  }
}

export function getProgress(bookId: number): Progress | null {
  const d = getDb()
  const row = d.prepare('SELECT * FROM progress WHERE book_id = ?').get(bookId) as
    | ProgressRow
    | undefined
  return row ? rowToProgress(row) : null
}

/** Get all progress entries — used for the bookshelf "currently reading" badges. */
export function listAllProgress(): Progress[] {
  const d = getDb()
  const rows = d.prepare('SELECT * FROM progress').all() as ProgressRow[]
  return rows.map(rowToProgress)
}

export function upsertProgress(bookId: number, chapterIndex: number, chapterProgress: number): void {
  const d = getDb()
  d.prepare(
    `INSERT INTO progress (book_id, chapter_index, chapter_progress, last_read_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(book_id) DO UPDATE SET
       chapter_index = excluded.chapter_index,
       chapter_progress = excluded.chapter_progress,
       last_read_at = excluded.last_read_at`
  ).run(bookId, chapterIndex, clamp(chapterProgress, 0, 1), Date.now())
}

export function deleteProgress(bookId: number): void {
  const d = getDb()
  d.prepare('DELETE FROM progress WHERE book_id = ?').run(bookId)
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
