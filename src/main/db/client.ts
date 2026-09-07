import { createRequire } from 'node:module'
import type BetterSqlite3 from 'better-sqlite3'
import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

type DatabaseInstance = BetterSqlite3.Database

let db: DatabaseInstance | null = null
const nodeRequire = createRequire(import.meta.url)

function wrapDbLoadError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err)
  const arch = /incompatible architecture|x86_64|arm64/i.test(raw)
  const hint = arch
    ? ' Arch mismatch (x86_64 vs arm64). Rebuild native modules for Electron on Apple Silicon.'
    : ' Rebuild native modules for the installed Electron.'
  return new Error('[WorkThief] DB native load failed: ' + raw + '.' + hint, {
    cause: err
  })
}

function loadBetterSqlite3(): typeof BetterSqlite3 {
  try {
    return nodeRequire('better-sqlite3') as typeof BetterSqlite3
  } catch (err) {
    throw wrapDbLoadError(err)
  }
}

export function getDb(): DatabaseInstance {
  if (db) return db
  const Database = loadBetterSqlite3()
  const dbPath = getDbPath()
  mkdirSync(dirname(dbPath), { recursive: true })
  try {
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    migrate(db)
  } catch (err) {
    db = null
    throw wrapDbLoadError(err)
  }
  return db
}

export function closeDb(): void {
  if (db) {
    try {
      db.close()
    } catch {
      /* ignore */
    }
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

function migrate(d: DatabaseInstance): void {
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
export function _setDbForTesting(customDb: DatabaseInstance | null): void {
  if (db) {
    try {
      db.close()
    } catch {
      /* ignore */
    }
  }
  db = customDb
}

