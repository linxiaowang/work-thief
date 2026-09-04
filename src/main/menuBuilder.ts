import { Menu, MenuItemConstructorOptions } from 'electron'
import { listBooks, getBook, touchBookOpened } from './db/books'
import { listChapters } from './db/chapters'
import { getSettings, updateSettings } from './db/settings'
import { getState, getCurrentPages, reloadPagination } from './menuBar'

export interface ContextMenuCallbacks {
  onSwitchBook: (id: number) => void
  onJumpToChapter: (idx: number) => void
  onToggleHidden: () => void
  onOpenWatchedFolder: () => void
  onQuit: () => void
}

/**
 * Right-click tray menu: bookshelf / chapters / Boss Key / folder / quit.
 */
export function buildContextMenu(cb: ContextMenuCallbacks): Menu {
  const state = getState()
  const currentBook = state && state.bookId > 0 ? getBook(state.bookId) : null
  const allBooks = listBooks()
  const chapters = currentBook ? listChapters(currentBook.id) : []
  const settings = getSettings()

  const items: MenuItemConstructorOptions[] = []

  if (allBooks.length === 0) {
    items.push({ label: '书架空 — 把 .txt 放进监听文件夹', enabled: false })
  } else {
    const bookSubmenu: MenuItemConstructorOptions[] = allBooks
      .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
      .slice(0, 30)
      .map((book) => ({
        label: book.missing ? `${book.title} (缺失)` : book.title,
        type: 'checkbox' as const,
        checked: state?.bookId === book.id,
        click: () => {
          touchBookOpened(book.id)
          cb.onSwitchBook(book.id)
        }
      }))
    items.push({ label: `书架 (${allBooks.length})`, submenu: bookSubmenu })
  }

  items.push({ type: 'separator' })

  if (currentBook && chapters.length > 0) {
    const totalPages = getCurrentPages().length
    const pageInfo =
      totalPages > 0 ? ` · ${((state?.pageIndex ?? 0) + 1)}/${totalPages}` : ''
    const chapterSubmenu: MenuItemConstructorOptions[] = chapters.slice(0, 200).map((c) => ({
      label: `${c.index + 1}. ${c.title}`,
      type: 'checkbox' as const,
      checked: state?.chapterIndex === c.index,
      click: () => cb.onJumpToChapter(c.index)
    }))
    items.push({
      label: `${currentBook.title}${pageInfo}`,
      submenu: chapterSubmenu
    })
  }

  items.push({ type: 'separator' })

  items.push({
    label: state?.hidden ? '显示文字' : '隐藏文字',
    click: cb.onToggleHidden
  })

  const charOptions = [30, 35, 40, 45, 50, 60]
  items.push({
    label: `每页字数 (${settings.charsPerPage})`,
    submenu: charOptions.map((n) => ({
      label: String(n),
      type: 'checkbox' as const,
      checked: settings.charsPerPage === n,
      click: () => {
        updateSettings({ charsPerPage: n })
        void reloadPagination()
      }
    }))
  })

  items.push({
    label: '打开监听文件夹',
    click: cb.onOpenWatchedFolder
  })

  items.push({ type: 'separator' })
  items.push({ label: 'WorkThief 0.2', enabled: false })
  items.push({ label: '退出', click: cb.onQuit })

  return Menu.buildFromTemplate(items)
}
