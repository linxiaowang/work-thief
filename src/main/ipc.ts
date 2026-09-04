import { basename } from 'node:path'
import { existsSync } from 'node:fs'
import type { ImportResult } from '@shared/types'
import { insertBook, getBookByPath, listBooks, markBookMissing } from './db/books'
import { parseTxtFile, coverColorFor } from './parsers/txt'
import { getSettings } from './db/settings'

/**
 * Import helpers used by the folder watcher.
 * No renderer IPC — the app is menu-bar only.
 */

export async function importPaths(paths: string[]): Promise<ImportResult> {
  const failed: Array<{ path: string; reason: string }> = []
  let imported = 0

  for (const filePath of paths) {
    try {
      if (!filePath.toLowerCase().endsWith('.txt')) {
        failed.push({ path: filePath, reason: '不是 .txt 文件' })
        continue
      }
      if (getBookByPath(filePath)) {
        failed.push({ path: filePath, reason: '已在书架' })
        continue
      }
      const parsed = await parseTxtFile(filePath, undefined, getSettings().preferredEncoding)
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

/** Refresh missing flags for books whose files disappeared. */
export function refreshMissingFlags(): void {
  for (const b of listBooks()) {
    const exists = existsSync(b.filePath)
    if (exists && b.missing) markBookMissing(b.id, false)
    if (!exists && !b.missing) markBookMissing(b.id, true)
  }
}
