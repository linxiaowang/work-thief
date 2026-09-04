import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { IPC } from '@shared/ipc'
import type { Book, Chapter, Progress, ChapterContent, SearchResult, ImportResult, AppSettings } from '@shared/types'
import { getDb } from './db/client'
import {
  insertBook,
  listBooks,
  getBook,
  deleteBook,
  renameBook,
  touchBookOpened,
  markBookMissing
} from './db/books'
import { listChapters, getChapter } from './db/chapters'
import { getProgress, upsertProgress } from './db/progress'
import { getSettings, updateSettings, resetSettings } from './db/settings'
import { parseTxtFile, coverColorFor } from './parsers/txt'
import { openReader, hideAllWindows } from './windowManager'
import { getWatchedFolder, setWatchedFolder } from './watcher'

/**
 * Wrap ipcMain.handle with request/response logging so we can see
 * exactly which channels the renderer is calling and whether anything
 * throws. Cheap enough in dev to always-on.
 */
function handle<T = any>(channel: string, listener: (event: any, ...args: any[]) => Promise<T> | T) {
  ipcMain.handle(channel, async (event, ...args) => {
    const start = Date.now()
    console.log(`[ipc] → ${channel}`, summarizeArgs(args))
    try {
      const result = await listener(event, ...args)
      console.log(`[ipc] ← ${channel} (${Date.now() - start}ms)`, summarizeResult(result))
      return result
    } catch (err) {
      console.error(`[ipc] ✗ ${channel} (${Date.now() - start}ms)`, err)
      throw err
    }
  })
}

function summarizeArgs(args: any[]): string {
  if (args.length === 0) return ''
  try {
    return JSON.stringify(args).slice(0, 200)
  } catch {
    return '<unserializable>'
  }
}

function summarizeResult(result: any): string {
  if (result == null) return ''
  try {
    const s = JSON.stringify(result)
    return s.length > 200 ? s.slice(0, 200) + '…' : s
  } catch {
    return '<unserializable>'
  }
}

/**
 * Register all IPC handlers. Called once during app startup.
 */
export function registerIpc(): void {
  // ---- Books ---------------------------------------------------------

  handle(IPC.BOOKS_LIST, (): Book[] => {
    refreshMissingFlags()
    return listBooks()
  })

  handle(IPC.BOOKS_IMPORT, async (): Promise<ImportResult> => {
    // Try to attach dialog to the focused window, fall back to any
    // visible window, then to no parent (which Electron renders as a
    // standalone dialog).
    const win =
      BrowserWindow.getFocusedWindow() ??
      BrowserWindow.getAllWindows().find((w) => w.isVisible() && !w.isDestroyed())
    try {
      const result = await dialog.showOpenDialog(win ?? undefined as any, {
        title: '导入小说',
        filters: [{ name: 'Text', extensions: ['txt'] }],
        properties: ['openFile', 'multiSelections']
      })
      if (result.canceled) return { imported: 0, failed: [] }
      return importPaths(result.filePaths)
    } catch (err) {
      console.error('[ipc] BOOKS_IMPORT failed:', err)
      throw err
    }
  })

  handle(IPC.BOOKS_IMPORT_PATHS, async (_e, paths: string[]): Promise<ImportResult> => {
    return importPaths(paths)
  })

  handle(IPC.BOOKS_DELETE, (_e, id: number): { success: boolean } => {
    deleteBook(id)
    return { success: true }
  })

  handle(IPC.BOOKS_RENAME, (_e, id: number, title: string): { success: boolean } => {
    renameBook(id, title)
    return { success: true }
  })

  handle(IPC.BOOKS_RESOLVE_MISSING, async (_e, id: number): Promise<{ resolved: boolean }> => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: '重新定位文件',
      filters: [{ name: 'Text', extensions: ['txt'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return { resolved: false }
    const newPath = result.filePaths[0]
    const db = getDb()
    db.prepare('UPDATE books SET file_path = ?, missing = 0 WHERE id = ?').run(newPath, id)
    return { resolved: true }
  })

  // ---- Chapters ------------------------------------------------------

  handle(IPC.CHAPTERS_GET, (_e, bookId: number): Chapter[] => {
    return listChapters(bookId)
  })

  handle(IPC.CHAPTER_CONTENT, async (_e, bookId: number, chapterIndex: number): Promise<ChapterContent | null> => {
    const book = getBook(bookId)
    if (!book) return null
    const chapter = getChapter(bookId, chapterIndex)
    if (!chapter) return null
    // Read raw file and slice by stored offsets.
    const { readFile } = await import('node:fs/promises')
    const buf = await readFile(book.filePath)
    const { decodeBuffer } = await import('./parsers/encoding')
    const { text } = decodeBuffer(buf)
    // The startOffset stored at import time was based on the original
    // decoded text. After re-decoding, offsets are still valid since
    // we decode the full buffer to the same text.
    const allChapters = listChapters(bookId)
    const nextChapter = allChapters.find((c) => c.index === chapterIndex + 1)
    const start = chapter.startOffset
    const end = nextChapter ? nextChapter.startOffset : text.length
    const content = text.slice(start, end)
    touchBookOpened(bookId)
    return {
      bookId,
      bookTitle: book.title,
      chapterIndex,
      chapterTitle: chapter.title,
      totalChapters: allChapters.length,
      content,
      charCount: content.length
    }
  })

  // ---- Progress ------------------------------------------------------

  handle(IPC.PROGRESS_GET, (_e, bookId: number): Progress | null => {
    return getProgress(bookId)
  })

  handle(IPC.PROGRESS_UPDATE, (_e, bookId: number, chapterIndex: number, progress: number): { success: boolean } => {
    upsertProgress(bookId, chapterIndex, progress)
    return { success: true }
  })

  // ---- Settings ------------------------------------------------------

  handle(IPC.SETTINGS_GET, (): AppSettings => getSettings())
  handle(IPC.SETTINGS_UPDATE, (_e, patch: any): AppSettings => updateSettings(patch))
  handle(IPC.SETTINGS_RESET, (): AppSettings => resetSettings())

  // ---- Window controls ----------------------------------------------

  handle(IPC.WINDOW_OPEN_READER, (_e, bookId: number) => {
    openReader(bookId)
    return { success: true }
  })

  handle(IPC.WINDOW_HIDE_READER, () => {
    hideAllWindows()
    return { success: true }
  })

  handle(IPC.WINDOW_HIDE_ALL, () => {
    hideAllWindows()
    return { success: true }
  })

  // ---- Watched folder ------------------------------------------------

  handle(IPC.WATCHED_GET_FOLDER, (): string | null => getWatchedFolder())
  handle(IPC.WATCHED_SET_FOLDER, async (_e, folder: string | null) => {
    await setWatchedFolder(folder)
    return { success: true }
  })

  // ---- Search --------------------------------------------------------

  handle(IPC.SEARCH_IN_CHAPTER, async (_e, bookId: number, chapterIndex: number, query: string): Promise<SearchResult> => {
    const ch = getChapter(bookId, chapterIndex)
    if (!ch) return { chapterIndex, chapterTitle: '', matches: [] }
    const { readFile } = await import('node:fs/promises')
    const book = getBook(bookId)
    if (!book) return { chapterIndex, chapterTitle: ch.title, matches: [] }
    const buf = await readFile(book.filePath)
    const { decodeBuffer } = await import('./parsers/encoding')
    const { text } = decodeBuffer(buf)
    const allChapters = listChapters(bookId)
    const nextCh = allChapters.find((c) => c.index === chapterIndex + 1)
    const start = ch.startOffset
    const end = nextCh ? nextCh.startOffset : text.length
    const slice = text.slice(start, end)
    const matches = searchInText(slice, query)
    return { chapterIndex, chapterTitle: ch.title, matches }
  })

  // ---- Misc ----------------------------------------------------------

  handle(IPC.APP_VERSION, () => require('electron').app.getVersion())

  handle(IPC.SHOW_ITEM_IN_FOLDER, (_e, p: string) => {
    shell.showItemInFolder(p)
    return { success: true }
  })

  handle(IPC.OPEN_IN_FINDER, (_e, p: string) => {
    if (existsSync(p)) shell.openPath(p)
    return { success: true }
  })
}

// ---- Helpers --------------------------------------------------------

export async function importPaths(paths: string[]): Promise<ImportResult> {
  const failed: Array<{ path: string; reason: string }> = []
  let imported = 0

  for (const filePath of paths) {
    try {
      if (!filePath.toLowerCase().endsWith('.txt')) {
        failed.push({ path: filePath, reason: '不是 .txt 文件' })
        continue
      }
      // Skip duplicates
      const { getBookByPath } = await import('./db/books')
      if (getBookByPath(filePath)) {
        failed.push({ path: filePath, reason: '已在书架' })
        continue
      }
      const parsed = await parseTxtFile(filePath)
      const inserted = insertBook({
        title: parsed.title || basename(filePath).replace(/\.txt$/i, ''),
        filePath,
        fileSize: 0,
        encoding: parsed.encoding,
        chapterCount: parsed.chapters.length,
        totalChars: parsed.totalChars,
        coverColor: coverColorFor(filePath)
      })
      const { replaceChapters } = await import('./db/chapters')
      replaceChapters(
        inserted.id,
        parsed.chapters.map((c) => ({
          bookId: inserted.id,
          index: c.index,
          title: c.title,
          startOffset: c.startOffset,
          charCount: c.charCount
        }))
      )
      imported++
    } catch (err) {
      failed.push({ path: filePath, reason: (err as Error).message || '解析失败' })
    }
  }

  return { imported, failed }
}

function searchInText(text: string, query: string): SearchResult['matches'] {
  if (!query) return []
  const matches: SearchResult['matches'] = []
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  let idx = 0
  while (idx < lowerText.length) {
    const found = lowerText.indexOf(lowerQuery, idx)
    if (found < 0) break
    const previewStart = Math.max(0, found - 20)
    const previewEnd = Math.min(text.length, found + query.length + 20)
    matches.push({
      offset: found,
      preview: text.slice(previewStart, previewEnd)
    })
    idx = found + query.length
    if (matches.length >= 200) break // safety cap
  }
  return matches
}

function refreshMissingFlags(): void {
  const books = listBooks()
  for (const b of books) {
    const exists = existsSync(b.filePath)
    if (exists && b.missing) markBookMissing(b.id, false)
    if (!exists && !b.missing) markBookMissing(b.id, true)
  }
}
