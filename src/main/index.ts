import { app, Menu, Notification } from 'electron'
import { getDb, closeDb } from './db/client'
import { listBooks } from './db/books'
import {
  applyShortcuts,
  unregisterAllShortcuts,
  startHotkeyRecording,
  resetHotkeysToDefaults,
  setHotkeysChangedHandler
} from './shortcuts'
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
  setChooseNovelHandler,
  setRightClickHandler,
  syncChapterIndexForMenu
} from './menuBar'
import { buildContextMenu } from './menuBuilder'
import { chooseNovel } from './chooseNovel'
import { openSettingsWindow, wireSettingsIpc, setSettingsSavedHandler } from './settingsWindow'

/**
 * WorkThief — menu-bar novel reader.
 *
 * Novel text via Tray.setTitle(). Left-click pages; right-click menu.
 * Hotkeys: CommandOrControl+Alt+./, and Boss M (customizable). First-run: choose TXT.
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

/** Kept for popUpContextMenu — never tray.setContextMenu (steals left-click). */
let trayMenu: Menu | null = null

app.whenReady().then(async () => {
  try {
    wireSettingsIpc()
    setSettingsSavedHandler(() => refreshContextMenu())
    setHotkeysChangedHandler(() => refreshContextMenu())
    setChooseNovelHandler(() => {
      settleMenu(chooseNovel(), 'chooseNovel')
    })

    // Tray first so a native crash / throw in db or watcher still leaves a menu-bar item.
    initTray()
    setRightClickHandler(() => {
      const tray = getTray()
      if (!tray) return
      refreshContextMenu()
      if (trayMenu) tray.popUpContextMenu(trayMenu)
    })
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
      notifyDbOrStartupFailure(err)
      refreshContextMenu()
    }

    app.on('activate', () => {
      refreshContextMenu()
    })
  } catch (err) {
    console.error('[WorkThief] whenReady bootstrap failed:', err)
    notifyDbOrStartupFailure(err)
    try {
      refreshContextMenu()
    } catch (menuErr) {
      console.error('[WorkThief] refreshContextMenu after bootstrap error:', menuErr)
    }
  }
}).catch((err) => {
  console.error('[WorkThief] app.whenReady rejected:', err)
})

// Tray-only app: closing BrowserWindows (hotkey capture / settings) must NEVER quit.
// Without this listener Electron quits when the last window closes — Esc cancel
// closes the invisible capture window and would kill the whole app.
app.on('window-all-closed', () => {
  // Intentionally empty — user quits only via tray 「退出」 → app.quit().
})

app.on('before-quit', () => {
  unregisterAllShortcuts()
  closeDb()
})

app.on('will-quit', () => {
  unregisterAllShortcuts()
})


function notifyDbOrStartupFailure(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  const arch = /incompatible architecture|x86_64|arm64|better-sqlite3|native/i.test(msg)
  console.error(
    '[WorkThief] SQLite unavailable — tray stays up (degraded).' +
      (arch
        ? ' Likely native arch mismatch (x86_64 vs arm64). See README Native modules section.'
        : ' See console / README.')
  )
  if (!Notification.isSupported()) return
  try {
    new Notification({
      title: 'WorkThief: 数据库加载失败',
      body: arch
        ? 'Native DB module arch mismatch. Tray still running; fix via README (setup / rebuild).'
        : 'DB failed at startup; tray still running. See console.'
    }).show()
  } catch (notifyErr) {
    console.error('[WorkThief] failure Notification failed:', notifyErr)
  }
}

function notifyStarted(): void {
  if (!Notification.isSupported()) {
    console.log('[WorkThief] Notification API not supported; skipping startup banner')
    return
  }
  try {
    const n = new Notification({
      title: 'WorkThief 已在菜单栏',
      body: app.isPackaged
        ? '托盘已启动。左键翻页；右键菜单。无书时点标题选 TXT。'
        : '开发模式：Dock 可见；左键翻页；右键菜单。无书 → 点标题选 TXT。'
    })
    n.show()
    console.log('[WorkThief] startup Notification shown')
  } catch (err) {
    console.error('[WorkThief] startup Notification failed:', err)
  }
}

async function pickInitialBook(): Promise<void> {
  let books
  try {
    books = listBooks()
  } catch (err) {
    console.error('[WorkThief] pickInitialBook listBooks failed:', err)
    setState({ bookId: -1, chapterIndex: 0, pageIndex: 0, hidden: false })
    throw err
  }
  if (books.length === 0) {
    setState({ bookId: -1, chapterIndex: 0, pageIndex: 0, hidden: false })
    return
  }
  const sorted = [...books].sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
  await switchToBook(sorted[0].id)
}

/** Catch async failures so menu/DB errors never become UnhandledPromiseRejection. */
function settleMenu(task: Promise<unknown>, label: string): void {
  void task.then(refreshContextMenu).catch((err) => {
    console.error(`[WorkThief] ${label} failed:`, err)
    try {
      refreshContextMenu()
    } catch (menuErr) {
      console.error('[WorkThief] refreshContextMenu after', label, 'error:', menuErr)
    }
  })
}

/**
 * Rebuild tray/app menu. Never throws to callers — DB failures yield a degraded
 * menu from buildContextMenu (选择小说… / 退出) instead of UnhandledPromiseRejection.
 */
function refreshContextMenu(): void {
  try {
    try {
      syncChapterIndexForMenu()
    } catch (err) {
      console.error('[WorkThief] syncChapterIndexForMenu failed (DB?):', err)
    }
    const menu = buildContextMenu({
      onOpenSettings: () => {
        try {
          openSettingsWindow()
        } catch (err) {
          console.error('[WorkThief] openSettingsWindow failed:', err)
        }
      },
      onChooseNovel: () => {
        settleMenu(chooseNovel(), 'chooseNovel')
      },
      onPrevPage: () => {
        settleMenu(prevPage(), 'prevPage')
      },
      onNextPage: () => {
        settleMenu(nextPage(), 'nextPage')
      },
      onSwitchBook: (id) => {
        settleMenu(switchToBook(id), `switchToBook(${id})`)
      },
      onJumpToChapter: (idx) => {
        settleMenu(jumpToChapter(idx), `jumpToChapter(${idx})`)
      },
      onToggleHidden: () => {
        try {
          toggleHidden()
        } catch (err) {
          console.error('[WorkThief] toggleHidden failed:', err)
        }
        refreshContextMenu()
      },
      onRebindHotkey: (binding) => {
        try {
          startHotkeyRecording(binding)
        } catch (err) {
          console.error('[WorkThief] startHotkeyRecording failed:', err)
        }
      },
      onResetHotkeys: () => {
        try {
          resetHotkeysToDefaults()
        } catch (err) {
          console.error('[WorkThief] resetHotkeysToDefaults failed:', err)
        }
        refreshContextMenu()
      },
      onQuit: () => app.quit()
    })
    trayMenu = menu
    Menu.setApplicationMenu(menu)
    // Intentionally NOT tray.setContextMenu(menu) — left click must page like Thief.
  } catch (err) {
    console.error('[WorkThief] refreshContextMenu failed — last-resort Quit/Choose menu:', err)
    try {
      const fallback = Menu.buildFromTemplate([
        {
          label: '选择小说…',
          click: () => settleMenu(chooseNovel(), 'chooseNovel')
        },
        { type: 'separator' },
        { label: '数据库不可用', enabled: false },
        { label: '退出', click: () => app.quit() }
      ])
      trayMenu = fallback
      Menu.setApplicationMenu(fallback)
    } catch (fallbackErr) {
      console.error('[WorkThief] last-resort menu failed:', fallbackErr)
      trayMenu = null
    }
  }
}
