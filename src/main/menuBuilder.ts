import { Menu, MenuItemConstructorOptions } from 'electron'
import { listBooks, getBook, touchBookOpened } from './db/books'
import { listChapters } from './db/chapters'
import { getState, getCurrentPages } from './menuBar'

export interface ContextMenuCallbacks {
  onOpenSettings: () => void
  onChooseNovel: () => void
  onPrevPage: () => void
  onNextPage: () => void
  onSwitchBook: (id: number) => void
  onJumpToChapter: (idx: number) => void
  onToggleHidden: () => void
  onQuit: () => void
}

/**
 * Tray menu: Settings / Choose novel / Prev·Next / Boss / Quit.
 * Bookshelf + chapter jump stay as optional extras.
 */
export function buildContextMenu(cb: ContextMenuCallbacks): Menu {
  const state = getState()
  const currentBook = state && state.bookId > 0 ? getBook(state.bookId) : null
  const allBooks = listBooks()
  const chapters = currentBook ? listChapters(currentBook.id) : []
  const totalPages = getCurrentPages().length
  const pageInfo =
    currentBook && totalPages > 0
      ? ` · ${(state?.pageIndex ?? 0) + 1}/${totalPages}`
      : ''

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
          touchBookOpened(book.id)
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
    const chapterSubmenu: MenuItemConstructorOptions[] = chapters.slice(0, 200).map((c) => ({
      label: `${c.index + 1}. ${c.title}`,
      type: 'checkbox' as const,
      checked: state?.chapterIndex === c.index,
      click: () => cb.onJumpToChapter(c.index)
    }))
    items.push({
      label: `跳转章节`,
      submenu: chapterSubmenu
    })
  }

  items.push({ type: 'separator' })

  items.push({
    label: state?.hidden ? 'Boss：显示小说' : 'Boss：伪装',
    click: cb.onToggleHidden
  })

  items.push({ type: 'separator' })
  items.push({ label: 'WorkThief 0.3', enabled: false })
  items.push({ label: '退出', click: cb.onQuit })

  return Menu.buildFromTemplate(items)
}
