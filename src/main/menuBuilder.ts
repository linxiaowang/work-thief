import { Menu, MenuItemConstructorOptions } from 'electron'
import { listBooks, getBook, touchBookOpened } from './db/books'
import { listChapters } from './db/chapters'
import { getState, getCurrentPages } from './menuBar'
import {
  friendlyAccel,
  getHotkeyAccelerators,
  type HotkeyBinding
} from './shortcuts'
import { DEFAULT_APP_SETTINGS } from '@shared/types'

export interface ContextMenuCallbacks {
  onOpenSettings: () => void
  onChooseNovel: () => void
  onPrevPage: () => void
  onNextPage: () => void
  onSwitchBook: (id: number) => void
  onJumpToChapter: (idx: number) => void
  onToggleHidden: () => void
  onRebindHotkey: (binding: HotkeyBinding) => void
  onResetHotkeys: () => void
  onQuit: () => void
}

const DEFAULT_HOTKEYS = {
  nextPage: DEFAULT_APP_SETTINGS.hotkeyNextPage,
  prevPage: DEFAULT_APP_SETTINGS.hotkeyPrevPage,
  toggleHidden: DEFAULT_APP_SETTINGS.hotkeyToggleHidden
} as const

/**
 * Minimal tray menu when SQLite / native module is unavailable.
 * Always includes 选择小说… + 退出 so the app stays usable.
 */
function buildDegradedMenu(cb: ContextMenuCallbacks, err?: unknown): Menu {
  const msg = err instanceof Error ? err.message : err != null ? String(err) : ''
  const arch = /incompatible architecture|x86_64|arm64|better-sqlite3|native/i.test(msg)
  const items: MenuItemConstructorOptions[] = [
    {
      label: '选择小说…',
      click: cb.onChooseNovel
    },
    { type: 'separator' },
    {
      label: '数据库不可用（降级菜单）',
      enabled: false
    },
    {
      label: arch
        ? '架构不匹配：见 README · 原生模块'
        : '见 README · 原生模块 / pnpm setup',
      enabled: false
    },
    { type: 'separator' },
    { label: 'WorkThief 0.3', enabled: false },
    { label: '退出', click: cb.onQuit }
  ]
  return Menu.buildFromTemplate(items)
}

function safeHotkeys(): Record<HotkeyBinding, string> {
  try {
    return getHotkeyAccelerators()
  } catch (err) {
    console.error('[WorkThief] getHotkeyAccelerators failed — using defaults', err)
    return { ...DEFAULT_HOTKEYS }
  }
}

/**
 * Tray menu: Settings / Choose novel / Prev·Next / Boss / Hotkeys / Quit.
 * Bookshelf + chapter jump stay as optional extras.
 *
 * All DB access is wrapped: listBooks / getBook / listChapters / getSettings
 * (via getHotkeyAccelerators) must NEVER escape as UnhandledPromiseRejection.
 * On failure → degraded menu (至少 选择小说… / 退出).
 */
export function buildContextMenu(cb: ContextMenuCallbacks): Menu {
  try {
    return buildFullContextMenu(cb)
  } catch (err) {
    console.error(
      '[WorkThief] buildContextMenu failed (DB/native) — serving degraded menu',
      err
    )
    try {
      return buildDegradedMenu(cb, err)
    } catch (degradedErr) {
      console.error('[WorkThief] degraded menu build failed', degradedErr)
      // Absolute last resort — Quit only
      return Menu.buildFromTemplate([{ label: '退出', click: cb.onQuit }])
    }
  }
}

function buildFullContextMenu(cb: ContextMenuCallbacks): Menu {
  const state = getState()
  // Isolate each DB touch so one failure still degrades the whole menu safely
  // (outer try in buildContextMenu is the comprehensive catch).
  const currentBook =
    state && state.bookId > 0 ? getBook(state.bookId) : null
  const allBooks = listBooks()
  const chapters = currentBook ? listChapters(currentBook.id) : []
  const totalPages = getCurrentPages().length
  const pageInfo =
    currentBook && totalPages > 0
      ? ` · ${(state?.pageIndex ?? 0) + 1}/${totalPages}`
      : ''

  const hotkeys = safeHotkeys()

  const items: MenuItemConstructorOptions[] = []

  items.push({
    label: '打开设置…',
    click: cb.onOpenSettings
  })

  items.push({
    label: '选择小说…',
    click: cb.onChooseNovel
  })

  if (allBooks.length > 0) {
    const bookSubmenu: MenuItemConstructorOptions[] = allBooks
      .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
      .slice(0, 30)
      .map((book) => ({
        label: book.missing ? `${book.title} (缺失)` : book.title,
        type: 'checkbox' as const,
        checked: state?.bookId === book.id,
        click: () => {
          try {
            touchBookOpened(book.id)
          } catch (err) {
            console.error('[WorkThief] touchBookOpened failed', err)
          }
          cb.onSwitchBook(book.id)
        }
      }))
    items.push({ label: `书架 (${allBooks.length})`, submenu: bookSubmenu })
  }

  items.push({ type: 'separator' })

  items.push({
    label: `上一页${pageInfo}`,
    enabled: !!currentBook,
    click: cb.onPrevPage
  })
  items.push({
    label: '下一页',
    enabled: !!currentBook,
    click: cb.onNextPage
  })

  if (currentBook && chapters.length > 1) {
    const chapterItem = (c: (typeof chapters)[number]): MenuItemConstructorOptions => ({
      label: `${c.index + 1}. ${c.title}`,
      type: 'checkbox' as const,
      checked: state?.chapterIndex === c.index,
      click: () => cb.onJumpToChapter(c.index)
    })

    let chapterSubmenu: MenuItemConstructorOptions[]
    if (chapters.length > 100) {
      chapterSubmenu = []
      for (let start = 0; start < chapters.length; start += 100) {
        const group = chapters.slice(start, start + 100)
        const from = start + 1
        const to = start + group.length
        chapterSubmenu.push({
          label: `${from}–${to}`,
          submenu: group.map(chapterItem)
        })
      }
    } else {
      chapterSubmenu = chapters.map(chapterItem)
    }

    items.push({
      label: `跳转章节 (共 ${chapters.length} 章)`,
      submenu: chapterSubmenu
    })
  }

  items.push({ type: 'separator' })

  items.push({
    label: state?.hidden ? 'Boss：显示小说' : 'Boss：伪装',
    click: cb.onToggleHidden
  })

  items.push({
    label: '快捷键',
    submenu: [
      {
        label: `上一页　${friendlyAccel(hotkeys.prevPage)}`,
        click: () => cb.onRebindHotkey('prevPage')
      },
      {
        label: `下一页　${friendlyAccel(hotkeys.nextPage)}`,
        click: () => cb.onRebindHotkey('nextPage')
      },
      {
        label: `Boss　${friendlyAccel(hotkeys.toggleHidden)}`,
        click: () => cb.onRebindHotkey('toggleHidden')
      },
      { type: 'separator' },
      {
        label: '恢复默认',
        click: cb.onResetHotkeys
      }
    ]
  })

  items.push({ type: 'separator' })
  items.push({ label: 'WorkThief 0.3', enabled: false })
  items.push({ label: '退出', click: cb.onQuit })

  return Menu.buildFromTemplate(items)
}
