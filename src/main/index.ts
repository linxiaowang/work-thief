import { app, Menu, Notification } from 'electron'
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
  getTray,
  nextPage,
  prevPage,
  setChooseNovelHandler
} from './menuBar'
import { buildContextMenu } from './menuBuilder'
import { chooseNovel } from './chooseNovel'
import { openSettingsWindow, wireSettingsIpc, setSettingsSavedHandler } from './settingsWindow'

/**
 * WorkThief — menu-bar novel reader.
 *
 * Novel text via Tray.setTitle(). Tray menu + hotkeys for nav / Boss Key.
 * First-run: choose TXT via file picker (watcher folder is bonus).
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
  wireSettingsIpc()
  setSettingsSavedHandler(() => refreshContextMenu())
  setChooseNovelHandler(() => {
    void chooseNovel().then(refreshContextMenu)
  })

  // Tray first so a native crash / throw in db or watcher still leaves a menu-bar item.
  initTray()
  refreshContextMenu()
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

function notifyStarted(): void {
  if (!Notification.isSupported()) {
    console.log('[WorkThief] Notification API not supported; skipping startup banner')
    return
  }
  try {
    const n = new Notification({
      title: 'WorkThief 已在菜单栏',
      body: app.isPackaged
        ? '托盘已启动。无书时点菜单「选择小说…」或点标题选 TXT。'
        : '开发模式：Dock 可见；菜单栏应有标题。无书 →「选择小说…」。'
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
    onOpenSettings: () => openSettingsWindow(),
    onChooseNovel: () => {
      void chooseNovel().then(refreshContextMenu)
    },
    onPrevPage: () => {
      void prevPage().then(refreshContextMenu)
    },
    onNextPage: () => {
      void nextPage().then(refreshContextMenu)
    },
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
    onQuit: () => app.quit()
  })
  Menu.setApplicationMenu(menu)
  const tray = getTray()
  if (tray) tray.setContextMenu(menu)
}
