import Database from 'better-sqlite3'
import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  const dbPath = getDbPath()
  mkdirSync(dirname(dbPath), { recursive: true })
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

function getDbPath(): string {
  // app.getPath('userData') is the canonical macOS app data location.
  // During dev (before app is ready), fall back to a temp dir so that
  // scripts / tests can still create a DB.
  const userData = app.isReady() ? app.getPath('userData') : join(process.cwd(), '.tmp-userdata')
  return join(userData, 'library.db')
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      file_path TEXT NOT NULL UNIQUE,
      file_size INTEGER NOT NULL DEFAULT 0,
      encoding TEXT NOT NULL DEFAULT 'utf-8',
      chapter_count INTEGER NOT NULL DEFAULT 0,
      total_chars INTEGER NOT NULL DEFAULT 0,
      imported_at INTEGER NOT NULL,
      last_opened_at INTEGER,
      cover_color TEXT NOT NULL,
      missing INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_books_last_opened ON books(last_opened_at DESC);

    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      idx INTEGER NOT NULL,
      title TEXT NOT NULL,
      start_offset INTEGER NOT NULL,
      char_count INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      UNIQUE(book_id, idx)
    );

    CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id, idx);

    CREATE TABLE IF NOT EXISTS progress (
      book_id INTEGER PRIMARY KEY,
      chapter_index INTEGER NOT NULL,
      chapter_progress REAL NOT NULL,
      last_read_at INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}

/** Test seam: swap the singleton DB (e.g. :memory:). */
export function _setDbForTesting(customDb: Database.Database | null): void {
  if (db) {
    try {
      db.close()
    } catch {
      /* ignore */
    }
  }
  db = customDb
}

