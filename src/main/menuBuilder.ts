import { Menu, MenuItemConstructorOptions } from 'electron'
import { listBooks, getBook, touchBookOpened } from './db/books'
import { listChapters, getChapter } from './db/chapters'
import { getState, getCurrentPages } from './menuBar'

export interface ContextMenuCallbacks {
  onSwitchBook: (id: number) => void
  onJumpToChapter: (idx: number) => void
  onToggleHidden: () => void
  onOpenWatchedFolder: () => void
  onQuit: () => void
}

/**
 * Build the right-click menu shown when the user clicks the menu bar
 * icon. Three sections:
 *   1. Books (submenu: all imported books + 最近阅读 highlight)
 *   2. Chapters (submenu: chapters of current book)
 *   3. Actions (toggle hidden, open watched folder, quit)
 */
export function buildContextMenu(cb: ContextMenuCallbacks): Menu {
  const state = getState()
  const currentBook = state && state.bookId > 0 ? getBook(state.bookId) : null
  const allBooks = listBooks()
  const chapters = currentBook ? listChapters(currentBook.id) : []

  const items: MenuItemConstructorOptions[] = []

  // ---- Section 1: Books ----------------------------------------------
  if (allBooks.length === 0) {
    items.push({ label: '书架为空 · 把 .txt 放进监听文件夹', enabled: false })
  } else {
    const bookSubmenu: MenuItemConstructorOptions[] = allBooks
      .sort((a, b) => {
        const ax = a.lastOpenedAt ?? 0
        const bx = b.lastOpenedAt ?? 0
        return bx - ax
      })
      .slice(0, 30) // cap at 30 to avoid absurdly long menus
      .map((book) => ({
        label: book.title,
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

  // ---- Section 2: Chapters -------------------------------------------
  if (currentBook && chapters.length > 0) {
    const totalPages = getCurrentPages().length
    const pageInfo = totalPages > 0 ? ` · 第 ${(state?.pageIndex ?? 0) + 1}/${totalPages} 页` : ''
    const chapterSubmenu: MenuItemConstructorOptions[] = chapters
      .slice(0, 200) // cap to keep menu usable
      .map((c) => ({
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

  // ---- Section 3: Actions --------------------------------------------
  items.push({
    label: state?.hidden ? '👀 显示文字' : '🙈 隐藏文字 (Boss Key)',
    click: cb.onToggleHidden
  })
  items.push({
    label: '打开监听文件夹…',
    click: cb.onOpenWatchedFolder
  })
  items.push({ type: 'separator' })
  items.push({
    label: 'WorkThief v0.2.0',
    enabled: false
  })
  items.push({
    label: '退出',
    click: cb.onQuit
  })

  return Menu.buildFromTemplate(items)
}
