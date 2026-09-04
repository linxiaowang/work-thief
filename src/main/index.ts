import { app, Menu, Notification, shell } from 'electron'
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
console.log(
  `[WorkThief] startup pid=${process.pid} gotLock=${gotLock} isPackaged=${app.isPackaged}`
)

if (!gotLock) {
  console.error(
    '[WorkThief] FATAL: another WorkThief / Electron instance already holds the single-instance lock. ' +
      'This process will exit. Kill the old one first, e.g. `pkill -f WorkThief` or quit the other Electron, then relaunch.'
  )
  console.error(`[WorkThief] FATAL details: pid=${process.pid} gotLock=false — exiting now.`)
  app.quit()
  process.exit(1)
}

if (process.platform === 'darwin') {
  // Dev: show Dock so Shawn can click the icon to confirm the process is alive / refresh.
  // Packaged builds stay menu-bar-only (Dock hidden).
  if (!app.isPackaged) {
    app.dock?.show()
  } else {
    app.dock?.hide()
  }
}

app.on('second-instance', () => {
  refreshContextMenu()
})

app.whenReady().then(async () => {
  // Tray first so a native crash / throw in db or watcher still leaves a menu-bar item.
  initTray()
  notifyStarted()

  try {
    getDb()
    await ensureWatchedFolder()
    await resumeWatching()
    await pickInitialBook()
    applyShortcuts()
    refreshContextMenu()
  } catch (err) {
    console.error('[WorkThief] startup after tray failed:', err)
    // Tray already exists with empty-shelf hint; still wire a minimal quit menu.
    try {
      refreshContextMenu()
    } catch (menuErr) {
      console.error('[WorkThief] refreshContextMenu after startup error:', menuErr)
    }
  }

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

/** Confirm the process is alive — especially useful when the tray icon is hard to spot. */
function notifyStarted(): void {
  if (!Notification.isSupported()) {
    console.log('[WorkThief] Notification API not supported; skipping startup banner')
    return
  }
  try {
    const n = new Notification({
      title: 'WorkThief 已在菜单栏',
      body: app.isPackaged
        ? '托盘已启动。若看不到图标，请看菜单栏标题「WorkThief · 放 txt」。'
        : '开发模式：Dock 图标可见；菜单栏应有青绿书标 +「WorkThief · 放 txt」。'
    })
    n.show()
    console.log('[WorkThief] startup Notification shown')
  } catch (err) {
    console.error('[WorkThief] startup Notification failed:', err)
  }
}

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
