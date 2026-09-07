import { describe, expect, it, beforeEach, vi } from 'vitest'

// Mock the electron module so db/client.ts can be imported in a pure
// Node test environment. We point getPath('userData') at a temp dir.
vi.mock('electron', () => ({
  app: {
    isReady: () => true,
    getPath: (key: string) => {
      if (key === 'userData') return process.cwd() + '/.test-userdata'
      return process.cwd()
    }
  }
}))

// Probe whether better-sqlite3's native binary is actually loadable.
// We do this by writing a tiny CommonJS script and running it as a
// child process — that way, if loading crashes (as it does in sandboxes
// that block the .node file), the test process stays alive.
let nativeAvailable = false
try {
  const { execSync } = await import('node:child_process')
  const result = execSync(
    `node -e "try { const D = require('better-sqlite3'); const db = new D(':memory:'); db.close(); console.log('OK'); } catch (e) { console.log('FAIL:' + e.message); }"`,
    { encoding: 'utf-8', cwd: process.cwd() }
  ).toString()
  nativeAvailable = result.trim().startsWith('OK')
  if (!nativeAvailable) {
    console.warn(
      '[db.test] better-sqlite3 native binding not loadable, skipping DB tests.\n' +
        '         Reason: ' +
        result.trim()
    )
  }
} catch (err) {
  console.warn('[db.test] probe failed: ' + (err as Error).message)
}

// Now mock the module BEFORE importing any code that depends on it,
// so transitive imports don't crash the worker.
if (!nativeAvailable) {
  vi.mock('better-sqlite3', () => ({
    default: class FakeDb {
      prepare() {
        return {
          run: () => ({ lastInsertRowid: 0, changes: 0 }),
          get: () => undefined,
          all: () => []
        }
      }
      exec() {}
      pragma() {}
      transaction(fn: () => void) {
        return () => fn()
      }
      close() {}
    }
  }))
}

const Database = nativeAvailable
  ? (await import('better-sqlite3')).default
  : null
const { _setDbForTesting } = await import('./books')
const { insertBook, listBooks, getBookByPath, deleteBook, renameBook } = await import('./books')
const { replaceChapters, listChapters, getChapter } = await import('./chapters')
const { upsertProgress, getProgress, listAllProgress } = await import('./progress')
const { getSettings, updateSettings, resetSettings } = await import('./settings')
const { getDb } = await import('./client')

function makeDb(): any {
  const d = new (Database as any)(':memory:')
  d.pragma('foreign_keys = ON')
  d.exec(`
    CREATE TABLE books (
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
    CREATE INDEX idx_books_last_opened ON books(last_opened_at DESC);
    CREATE TABLE chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      idx INTEGER NOT NULL,
      title TEXT NOT NULL,
      start_offset INTEGER NOT NULL,
      char_count INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      UNIQUE(book_id, idx)
    );
    CREATE INDEX idx_chapters_book ON chapters(book_id, idx);
    CREATE TABLE progress (
      book_id INTEGER PRIMARY KEY,
      chapter_index INTEGER NOT NULL,
      chapter_progress REAL NOT NULL,
      last_read_at INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
  _setDbForTesting(d)
  return d
}

describe.skipIf(!nativeAvailable)('books repo', () => {
  beforeEach(() => makeDb())

  it('inserts and lists books', () => {
    const b = insertBook({
      title: '三体',
      filePath: '/path/三体.txt',
      fileSize: 1024,
      encoding: 'utf-8',
      chapterCount: 3,
      totalChars: 5000,
      coverColor: '#aaaaaa'
    })
    expect(b.id).toBeGreaterThan(0)
    const all = listBooks()
    expect(all).toHaveLength(1)
    expect(all[0].title).toBe('三体')
  })

  it('enforces unique file path', () => {
    insertBook({
      title: 'A',
      filePath: '/a.txt',
      fileSize: 0,
      encoding: 'utf-8',
      chapterCount: 0,
      totalChars: 0,
      coverColor: '#000'
    })
    expect(() =>
      insertBook({
        title: 'B',
        filePath: '/a.txt',
        fileSize: 0,
        encoding: 'utf-8',
        chapterCount: 0,
        totalChars: 0,
        coverColor: '#000'
      })
    ).toThrow()
  })

  it('deletes books (cascades chapters)', () => {
    const b = insertBook({
      title: 'A',
      filePath: '/a.txt',
      fileSize: 0,
      encoding: 'utf-8',
      chapterCount: 0,
      totalChars: 0,
      coverColor: '#000'
    })
    deleteBook(b.id)
    expect(listBooks()).toHaveLength(0)
  })

  it('renames a book', () => {
    const b = insertBook({
      title: 'A',
      filePath: '/a.txt',
      fileSize: 0,
      encoding: 'utf-8',
      chapterCount: 0,
      totalChars: 0,
      coverColor: '#000'
    })
    renameBook(b.id, '  新名  ')
    expect(listBooks()[0].title).toBe('新名')
  })

  it('looks up by path', () => {
    insertBook({
      title: 'A',
      filePath: '/unique.txt',
      fileSize: 0,
      encoding: 'utf-8',
      chapterCount: 0,
      totalChars: 0,
      coverColor: '#000'
    })
    const found = getBookByPath('/unique.txt')
    expect(found).not.toBeNull()
    expect(getBookByPath('/nope.txt')).toBeNull()
  })
})

describe.skipIf(!nativeAvailable)('chapters repo', () => {
  beforeEach(() => makeDb())

  it('replaces and lists chapters', () => {
    const b = insertBook({
      title: 'A',
      filePath: '/a.txt',
      fileSize: 0,
      encoding: 'utf-8',
      chapterCount: 2,
      totalChars: 100,
      coverColor: '#000'
    })
    replaceChapters(b.id, [
      { bookId: b.id, index: 0, title: '第一章', startOffset: 0, charCount: 50 },
      { bookId: b.id, index: 1, title: '第二章', startOffset: 50, charCount: 50 }
    ])
    const chs = listChapters(b.id)
    expect(chs).toHaveLength(2)
    expect(chs[0].title).toBe('第一章')
    expect(chs[1].title).toBe('第二章')
  })

  it('replace clears old chapters', () => {
    const b = insertBook({
      title: 'A',
      filePath: '/a.txt',
      fileSize: 0,
      encoding: 'utf-8',
      chapterCount: 2,
      totalChars: 100,
      coverColor: '#000'
    })
    replaceChapters(b.id, [
      { bookId: b.id, index: 0, title: '旧', startOffset: 0, charCount: 50 },
      { bookId: b.id, index: 1, title: '旧二', startOffset: 50, charCount: 50 }
    ])
    replaceChapters(b.id, [{ bookId: b.id, index: 0, title: '新', startOffset: 0, charCount: 100 }])
    expect(listChapters(b.id)).toHaveLength(1)
  })

  it('getChapter returns specific chapter', () => {
    const b = insertBook({
      title: 'A',
      filePath: '/a.txt',
      fileSize: 0,
      encoding: 'utf-8',
      chapterCount: 2,
      totalChars: 100,
      coverColor: '#000'
    })
    replaceChapters(b.id, [
      { bookId: b.id, index: 0, title: '第一章', startOffset: 0, charCount: 50 },
      { bookId: b.id, index: 1, title: '第二章', startOffset: 50, charCount: 50 }
    ])
    expect(getChapter(b.id, 1)?.title).toBe('第二章')
    expect(getChapter(b.id, 99)).toBeNull()
  })
})

describe.skipIf(!nativeAvailable)('progress repo', () => {
  beforeEach(() => makeDb())

  it('upserts and reads', () => {
    const b = insertBook({
      title: 'A',
      filePath: '/a.txt',
      fileSize: 0,
      encoding: 'utf-8',
      chapterCount: 0,
      totalChars: 0,
      coverColor: '#000'
    })
    upsertProgress(b.id, 5, 0.5)
    expect(getProgress(b.id)?.chapterIndex).toBe(5)
    upsertProgress(b.id, 6, 0.3)
    expect(getProgress(b.id)?.chapterIndex).toBe(6)
    expect(listAllProgress()).toHaveLength(1)
  })

  it('clamps chapterProgress to 0..1', () => {
    const b = insertBook({
      title: 'A',
      filePath: '/a.txt',
      fileSize: 0,
      encoding: 'utf-8',
      chapterCount: 0,
      totalChars: 0,
      coverColor: '#000'
    })
    upsertProgress(b.id, 0, 5.0)
    expect(getProgress(b.id)?.chapterProgress).toBe(1)
    upsertProgress(b.id, 0, -1)
    expect(getProgress(b.id)?.chapterProgress).toBe(0)
  })
})

describe.skipIf(!nativeAvailable)('settings repo', () => {
  beforeEach(() => makeDb())

  it('returns defaults when no settings exist', () => {
    const s = getSettings()
    expect(s.hotkeyNextPage).toBe('CommandOrControl+Alt+.')
    expect(s.hotkeyPrevPage).toBe('CommandOrControl+Alt+,')
    expect(s.hotkeyToggleHidden).toBe('CommandOrControl+Alt+M')
    expect(s.hotkeyNextChapter).toBe('')
    expect(s.hotkeyPrevChapter).toBe('')
    expect(s.charsPerPage).toBe(20)
    expect(s.watchedFolder).toBeNull()
    expect(s.moyuText).toBe('工作中')
    expect(s.showPageNumber).toBe(true)
    expect(s.preferredEncoding).toBe('auto')
  })

  it('updates and persists settings', () => {
    updateSettings({
      charsPerPage: 50,
      hotkeyNextPage: 'Alt+Cmd+]',
      moyuText: '内存占用正常',
      showPageNumber: false,
      preferredEncoding: 'gbk'
    })
    const s = getSettings()
    expect(s.charsPerPage).toBe(50)
    expect(s.hotkeyNextPage).toBe('Alt+Cmd+]')
    expect(s.hotkeyToggleHidden).toBe('CommandOrControl+Alt+M')
    expect(s.moyuText).toBe('内存占用正常')
    expect(s.showPageNumber).toBe(false)
    expect(s.preferredEncoding).toBe('gbk')
  })

  it('clamps charsPerPage to valid ranges', () => {
    updateSettings({ charsPerPage: 999 })
    expect(getSettings().charsPerPage).toBe(80)
    updateSettings({ charsPerPage: 5 })
    expect(getSettings().charsPerPage).toBe(20)
  })

  it('resets to defaults', () => {
    updateSettings({ charsPerPage: 60, hotkeyToggleHidden: 'X', moyuText: 'x' })
    resetSettings()
    expect(getSettings().charsPerPage).toBe(20)
    expect(getSettings().hotkeyToggleHidden).toBe('CommandOrControl+Alt+M')
    expect(getSettings().hotkeyNextPage).toBe('CommandOrControl+Alt+.')
    expect(getSettings().moyuText).toBe('工作中')
  })

  it('migrates legacy hotkey defaults to Thief-style', () => {
    const d = getDb()
    d.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)`
    ).run(
      'app_settings',
      JSON.stringify({
        hotkeyNextPage: 'Alt+Cmd+Right',
        hotkeyPrevPage: 'Alt+Cmd+Left',
        hotkeyNextChapter: 'Alt+Cmd+Down',
        hotkeyPrevChapter: 'Alt+Cmd+Up',
        hotkeyToggleHidden: 'Ctrl+Alt+Cmd+M',
        charsPerPage: 40,
        moyuText: 'Hello',
        showPageNumber: true,
        preferredEncoding: 'auto',
        watchedFolder: null
      })
    )
    const s = getSettings()
    expect(s.hotkeyNextPage).toBe('CommandOrControl+Alt+.')
    expect(s.hotkeyPrevPage).toBe('CommandOrControl+Alt+,')
    expect(s.hotkeyToggleHidden).toBe('CommandOrControl+Alt+M')
    expect(s.hotkeyNextChapter).toBe('')
    expect(s.hotkeyPrevChapter).toBe('')
  })
})
