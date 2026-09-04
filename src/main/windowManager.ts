import { BrowserWindow, app, screen } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/ipc'

/**
 * Window lifecycle management for the popover (bookshelf) and reader.
 *
 * The popover is a real BrowserWindow positioned under the tray icon.
 * The reader is a borderless frameless window that can be freely moved.
 *
 * Both windows share a single hide-on-blur policy: when focus leaves
 * the app (e.g. user alt-tabs), we hide them so they don't appear in
 * screenshots or mission control.
 */

let popoverWindow: BrowserWindow | null = null
let readerWindow: BrowserWindow | null = null
let readerBookId: number | null = null
let readerIsVisible = false

const isDev = !app.isPackaged

/**
 * Attach diagnostics to a freshly-created window's webContents. In dev
 * mode this auto-opens DevTools and forwards all renderer logs/errors
 * to the main process terminal so we can see what's breaking without
 * needing the user to manually inspect.
 */
function attachDiagnostics(w: BrowserWindow, label: string): void {
  const wc = w.webContents

  wc.on('console-message', (_e, level, message, line, sourceId) => {
    const tag = ['DEBUG', 'INFO', 'WARN', 'ERROR'][level] || `L${level}`
    console.log(`[${label}:${tag}] ${message} (${sourceId}:${line})`)
  })

  wc.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[${label}] did-fail-load code=${code} ${desc} url=${url}`)
  })

  wc.on('render-process-gone', (_e, details) => {
    console.error(`[${label}] render-process-gone`, details)
  })

  wc.on('preload-error', (_e, preloadPath, error) => {
    console.error(`[${label}] preload-error ${preloadPath}:`, error)
  })

  if (isDev) {
    wc.openDevTools({ mode: 'detach' })
  }
}

export function getPopoverWindow(): BrowserWindow | null {
  return popoverWindow
}

export function getReaderWindow(): BrowserWindow | null {
  return readerWindow
}

export function showPopover(): void {
  if (!popoverWindow) {
    createPopoverWindow()
    return
  }
  if (popoverWindow.isDestroyed()) {
    createPopoverWindow()
    return
  }
  // On macOS, when the popover is shown via tray click, focus stays on
  // the previous app. We force focus so that clicks land on the popover
  // and keyboard events (Esc, Tab, etc.) are routed correctly.
  popoverWindow.show()
  popoverWindow.focus()
  // Belt-and-suspenders: also steal app-level focus.
  if (typeof app.focus === 'function') {
    try {
      app.focus({ steal: true })
    } catch {
      /* old API; ignore */
    }
  }
}

export function hidePopover(): void {
  popoverWindow?.hide()
}

export function togglePopover(): void {
  if (!popoverWindow || popoverWindow.isDestroyed()) {
    showPopover()
    return
  }
  if (popoverWindow.isVisible()) {
    hidePopover()
  } else {
    showPopover()
  }
}

export function openReader(bookId: number): void {
  if (readerWindow && !readerWindow.isDestroyed()) {
    readerBookId = bookId
    readerWindow.webContents.send('reader:load-book', bookId)
    showReader()
    return
  }
  readerBookId = bookId
  createReaderWindow(bookId)
}

export function showReader(): void {
  if (!readerWindow || readerWindow.isDestroyed()) return
  readerWindow.show()
  readerWindow.focus()
  readerIsVisible = true
}

export function hideReader(): void {
  readerWindow?.hide()
  readerIsVisible = false
}

export function hideAllWindows(): void {
  hidePopover()
  hideReader()
}

/** True if any of our windows is currently visible. */
export function hasVisibleWindow(): boolean {
  return Boolean(
    (popoverWindow?.isVisible() ?? false) || (readerIsVisible && readerWindow?.isVisible())
  )
}

export function getCurrentReaderBookId(): number | null {
  return readerBookId
}

export function setCurrentReaderBookId(id: number | null): void {
  readerBookId = id
}

function createPopoverWindow(): void {
  const display = screen.getPrimaryDisplay()
  const workArea = display.workArea
  // Default size; renderer CSS controls max-width within.
  const width = 360
  const height = 520

  popoverWindow = new BrowserWindow({
    width,
    height,
    x: Math.round(workArea.x + workArea.width - width - 12),
    y: Math.round(workArea.y + 4),
    show: false,
    frame: false,
    fullscreenable: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: '#1c1c1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  popoverWindow.setMenuBarVisibility(false)

  popoverWindow.on('ready-to-show', () => {
    popoverWindow?.show()
  })

  // Auto-hide on blur, with a small grace period so the click that
  // triggered the focus shift can register first. Without this delay,
  // macOS's focus bookkeeping can fire blur mid-click and hide the
  // popover before @click handlers ever run.
  let blurTimer: NodeJS.Timeout | null = null
  popoverWindow.on('blur', () => {
    if (blurTimer) clearTimeout(blurTimer)
    blurTimer = setTimeout(() => {
      blurTimer = null
      hidePopover()
    }, 150)
  })
  popoverWindow.on('focus', () => {
    if (blurTimer) {
      clearTimeout(blurTimer)
      blurTimer = null
    }
  })

  popoverWindow.on('closed', () => {
    popoverWindow = null
  })

  // Block navigation outside our app (defense in depth).
  popoverWindow.webContents.on('will-navigate', (e) => e.preventDefault())
  popoverWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  attachDiagnostics(popoverWindow, 'popover')

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    popoverWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/popover.html`)
  } else {
    popoverWindow.loadFile(join(__dirname, '../renderer/popover.html'))
  }
}

function createReaderWindow(bookId: number): void {
  const display = screen.getPrimaryDisplay()
  const workArea = display.workArea

  const defaultWidth = 720
  const defaultHeight = Math.min(820, Math.round(workArea.height * 0.78))
  const x = Math.round(workArea.x + (workArea.width - defaultWidth) / 2)
  const y = Math.round(workArea.y + (workArea.height - defaultHeight) / 2)

  readerWindow = new BrowserWindow({
    width: defaultWidth,
    height: defaultHeight,
    x,
    y,
    show: false,
    frame: false,
    fullscreenable: true,
    resizable: true,
    maximizable: true,
    minimizable: true,
    skipTaskbar: true,
    alwaysOnTop: false,
    backgroundColor: '#1c1c1e',
    minWidth: 480,
    minHeight: 360,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 14 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  readerWindow.setMenuBarVisibility(false)

  readerWindow.once('ready-to-show', () => {
    readerWindow?.show()
    readerIsVisible = true
  })

  // Save last position/size for restoration.
  const saveBounds = () => {
    if (!readerWindow) return
    const bounds = readerWindow.getBounds()
    try {
      const { writeFileSync, mkdirSync } = require('node:fs')
      const dir = join(app.getPath('userData'))
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'reader-bounds.json'), JSON.stringify(bounds))
    } catch {
      /* ignore */
    }
  }
  readerWindow.on('moved', saveBounds)
  readerWindow.on('resized', saveBounds)
  readerWindow.on('close', saveBounds)

  readerWindow.on('closed', () => {
    readerWindow = null
    readerIsVisible = false
    readerBookId = null
  })

  readerWindow.webContents.on('will-navigate', (e) => e.preventDefault())
  readerWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  attachDiagnostics(readerWindow, 'reader')

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    readerWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/reader.html`)
  } else {
    readerWindow.loadFile(join(__dirname, '../renderer/reader.html'))
  }

  // Send the book id once the renderer is ready.
  readerWindow.webContents.once('did-finish-load', () => {
    readerWindow?.webContents.send('reader:load-book', bookId)
  })
}

export const _testInternals = { IPC }
