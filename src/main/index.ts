import { app, Menu, shell, nativeImage } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { getDb, closeDb } from './db/client'
import { listBooks, getBook } from './db/books'
import { listChapters } from './db/chapters'
import { applyShortcuts, unregisterAllShortcuts } from './shortcuts'
import { resumeWatching, ensureWatchedFolder } from './watcher'
import {
  initTray,
  setState,
  switchToBook,
  jumpToChapter,
  toggleHidden,
  getState
} from './menuBar'
import { buildContextMenu } from './menuBuilder'

/**
 * WorkThief — menu-bar novel reader.
 *
 * No windows. The novel text is rendered directly in the macOS menu
 * bar via Tray.setTitle(). Right-click for navigation/settings. Global
 * hotkeys for page turning.
 */

// Single-instance lock — clicking the tray icon while the app is
// already running should refocus / refresh, not spawn a duplicate.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

// We have NO windows, so we should not appear in the Dock either.
// (Menu-bar-only apps are invisible in the Dock.)
if (process.platform === 'darwin') {
  app.dock?.hide()
}

app.on('second-instance', () => {
  refreshContextMenu()
})

app.whenReady().then(async () => {
  // Touch DB so migrations run early.
  getDb()

  // Ensure ~/Documents/WorkThief/ exists; auto-watch it for new .txt.
  await ensureWatchedFolder()
  await resumeWatching()

  // Create tray icon.
  initTray()

  // Pick the first book (or the most recently read) and start reading.
  await pickInitialBook()

  // Register global hotkeys (翻页 / 翻章 / 切书 / Boss Key).
  applyShortcuts()

  refreshContextMenu()

  app.on('activate', () => {
    refreshContextMenu()
  })
})

app.on('before-quit', () => {
  unregisterAllShortcuts()
  closeDb()
})

app.on('will-quit', () => {
  unregisterAllShortcuts()
})

async function pickInitialBook(): Promise<void> {
  const books = listBooks()
  if (books.length === 0) {
    // No books yet — show hint in the menu bar.
    setState({ bookId: -1, chapterIndex: 0, pageIndex: 0, hidden: false })
    return
  }
  // Most recently opened first, falling back to the first book.
  const sorted = [...books].sort((a, b) => {
    const ax = a.lastOpenedAt ?? 0
    const bx = b.lastOpenedAt ?? 0
    return bx - ax
  })
  await switchToBook(sorted[0].id)
}

function refreshContextMenu(): void {
  const menu = buildContextMenu({
    onSwitchBook: (id) => {
      void switchToBook(id).then(refreshContextMenu)
    },
    onJumpToChapter: (idx) => {
      void jumpToChapter(idx).then(refreshContextMenu)
    },
    onToggleHidden: () => {
      toggleHidden()
      refreshContextMenu()
    },
    onOpenWatchedFolder: () => {
      const { getSettings } = require('./db/settings')
      const s = getSettings() as { watchedFolder: string | null }
      if (s.watchedFolder) shell.openPath(s.watchedFolder)
    },
    onQuit: () => app.quit()
  })
  Menu.setApplicationMenu(menu)
  // Also pop on tray right-click
  const { getTray } = require('./menuBar')
  const tray = getTray()
  if (tray) tray.setContextMenu(menu)
}
