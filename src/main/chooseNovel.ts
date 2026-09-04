import { dialog, BrowserWindow } from 'electron'
import { basename } from 'node:path'
import { importPaths } from './ipc'
import { getBookByPath, touchBookOpened } from './db/books'
import { switchToBook, getState } from './menuBar'

/**
 * Native file picker to select a TXT novel (first-run / Choose novel).
 * Imports if needed, then switches the tray reader to that book.
 */
export async function chooseNovel(parent?: BrowserWindow | null): Promise<number | null> {
  const opts: Electron.OpenDialogOptions = {
    title: 'Select TXT',
    properties: ['openFile'],
    filters: [{ name: 'TXT', extensions: ['txt'] }]
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, opts)
    : await dialog.showOpenDialog(opts)
  if (result.canceled || result.filePaths.length === 0) return null

  const filePath = result.filePaths[0]
  let book = getBookByPath(filePath)
  if (!book) {
    const imported = await importPaths([filePath])
    if (imported.imported === 0) {
      const reason = imported.failed[0]?.reason ?? 'import failed'
      dialog.showErrorBox('Cannot open novel', basename(filePath) + '\n' + reason)
      return null
    }
    book = getBookByPath(filePath)
  }
  if (!book) return null

  touchBookOpened(book.id)
  await switchToBook(book.id)
  return book.id
}

/** If no book is loaded, open the picker; otherwise no-op. */
export async function chooseNovelIfEmpty(): Promise<void> {
  const state = getState()
  if (!state || state.bookId < 0) {
    await chooseNovel()
  }
}
