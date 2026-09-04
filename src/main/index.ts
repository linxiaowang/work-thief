import { app, Menu, shell } from 'electron'
import { getDb, closeDb } from './db/client'
import { listBooks } from './db/books'
import { applyShortcuts, unregisterAllShortcuts } from './shortcuts'
import { resumeWatching, ensureWatchedFolder } from './watcher'
import {
  initTray,
  setState,
  switchToBook,
  jumpToChapter,
  toggleHidden,
  getTray
} from './menuBar'
import { buildContextMenu } from './menuBuilder'
import { getSettings } from './db/settings'

/**
 * WorkThief — menu-bar novel reader.
 *
 * No windows. Novel text via Tray.setTitle(). Right-click for nav.
 * Global hotkeys for paging / Boss Key.
 */

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

if (process.platform === 'darwin') {
  app.dock?.hide()
}

app.on('second-instance', () => {
  refreshContextMenu()
})

app.whenReady().then(async () => {
  getDb()
  await ensureWatchedFolder()
  await resumeWatching()
  initTray()
  await pickInitialBook()
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
    setState({ bookId: -1, chapterIndex: 0, pageIndex: 0, hidden: false })
    return
  }
  const sorted = [...books].sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
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
      const s = getSettings()
      if (s.watchedFolder) void shell.openPath(s.watchedFolder)
    },
    onQuit: () => app.quit()
  })
  Menu.setApplicationMenu(menu)
  const tray = getTray()
  if (tray) tray.setContextMenu(menu)
}
