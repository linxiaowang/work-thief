import { BrowserWindow, ipcMain, app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getSettings, updateSettings } from './db/settings'
import { getState, reloadPagination, render } from './menuBar'
import { getBook } from './db/books'
import { applyShortcuts, formatShortcutCopy } from './shortcuts'
import { chooseNovel } from './chooseNovel'
import type { AppSettings, PreferredEncoding } from '@shared/types'

let win: BrowserWindow | null = null
let onSaved: (() => void) | null = null

export function setSettingsSavedHandler(fn: () => void): void {
  onSaved = fn
}

function settingsHtmlPath(): string {
  const candidates = [
    join(process.cwd(), 'resources/settings.html'),
    join(app.getAppPath(), 'resources/settings.html'),
    join(__dirname, '../../resources/settings.html')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return candidates[0]
}

export function openSettingsWindow(): void {
  if (win && !win.isDestroyed()) {
    win.focus()
    void pushSettingsToWindow()
    return
  }

  win = new BrowserWindow({
    width: 420,
    height: 520,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'WorkThief 设置',
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  const html = settingsHtmlPath()
  void win.loadURL(pathToFileURL(html).href)

  win.once('ready-to-show', () => {
    win?.show()
    void pushSettingsToWindow()
  })

  win.on('closed', () => {
    win = null
  })
}

function settingsPayload() {
  const s = getSettings()
  const state = getState()
  const book = state && state.bookId > 0 ? getBook(state.bookId) : null
  return {
    charsPerPage: s.charsPerPage,
    preferredEncoding: s.preferredEncoding,
    moyuText: s.moyuText,
    showPageNumber: s.showPageNumber,
    novelPath: book?.filePath ?? '',
    novelTitle: book?.title ?? '',
    hotkeyNextPage: s.hotkeyNextPage,
    hotkeyPrevPage: s.hotkeyPrevPage,
    hotkeyToggleHidden: s.hotkeyToggleHidden,
    hotkeyCopy: formatShortcutCopy(s)
  }
}

async function pushSettingsToWindow(): Promise<void> {
  if (!win || win.isDestroyed()) return
  win.webContents.send('settings:data', settingsPayload())
}

let ipcWired = false

export function wireSettingsIpc(): void {
  if (ipcWired) return
  ipcWired = true

  ipcMain.handle('settings:pick-novel', async () => {
    const id = await chooseNovel(win)
    if (id != null) {
      await pushSettingsToWindow()
      onSaved?.()
    }
    return id
  })

  ipcMain.handle(
    'settings:save',
    async (
      _e,
      payload: {
        charsPerPage: number
        preferredEncoding: PreferredEncoding
        moyuText: string
        showPageNumber: boolean
      }
    ) => {
      const patch: Partial<AppSettings> = {
        charsPerPage: Number(payload.charsPerPage),
        preferredEncoding: payload.preferredEncoding,
        moyuText: String(payload.moyuText ?? ''),
        showPageNumber: Boolean(payload.showPageNumber)
      }
      updateSettings(patch)
      applyShortcuts()
      await reloadPagination()
      render()
      onSaved?.()
      return getSettings()
    }
  )

  ipcMain.handle('settings:close', () => {
    win?.close()
  })

  ipcMain.handle('settings:get', () => settingsPayload())
}
