import { Tray, nativeImage, app } from 'electron'
import { join } from 'node:path'
import { getBook } from './db/books'
import { listChapters, getChapter } from './db/chapters'
import { getProgress, upsertProgress } from './db/progress'
import { getSettings } from './db/settings'
import { paginate, selectPageForOffset } from './pagination'

/**
 * MenuBar — owns the macOS menu bar item and all reading state.
 *
 * The tray icon stays put. Title text shows the current page.
 * Boss Key clears the title but leaves the icon.
 */

export interface MenuBarState {
  bookId: number
  chapterIndex: number
  pageIndex: number
  hidden: boolean
}

const EMPTY_HINT = '放 txt → Documents/WorkThief'

/** Tiny 16×16 black PNG — last-resort embedded template for macOS menu bar. */
const EMBEDDED_TEMPLATE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFUlEQVQ4T2NkYGD4z0ABYBzVMKqBEQAAsgABqV9mVQAAAABJRU5ErkJggg=='

let tray: Tray | null = null
let state: MenuBarState | null = null
let cachedPages: string[] = []
let cachedChapterText: string | null = null
let cachedChapterKey: string | null = null

export function getTray(): Tray | null {
  return tray
}

export function getState(): MenuBarState | null {
  return state
}

function resolveTrayIcon(): Electron.NativeImage {
  const candidates = [
    join(process.cwd(), 'resources/iconTemplate.png'),
    join(process.cwd(), 'resources/icon.png'),
    join(app.getAppPath(), 'resources/iconTemplate.png'),
    join(app.getAppPath(), 'resources/icon.png'),
    join(__dirname, '../../resources/iconTemplate.png'),
    join(__dirname, '../../resources/icon.png')
  ]

  for (const path of candidates) {
    const icon = nativeImage.createFromPath(path)
    console.log(`[WorkThief] tray icon candidate: ${path} isEmpty=${icon.isEmpty()}`)
    if (!icon.isEmpty()) {
      if (path.includes('iconTemplate')) {
        icon.setTemplateImage(true)
      }
      console.log(`[WorkThief] tray icon chosen: ${path} isEmpty=${icon.isEmpty()}`)
      return icon
    }
  }

  // Never new Tray(empty). Prefer embedded template PNG for macOS menu bar.
  const icon = nativeImage.createFromDataURL(EMBEDDED_TEMPLATE_PNG)
  if (!icon.isEmpty()) {
    icon.setTemplateImage(true)
  }
  console.log(`[WorkThief] tray icon chosen: <embedded-fallback> isEmpty=${icon.isEmpty()}`)
  return icon
}

export function initTray(): void {
  const icon = resolveTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('WorkThief')
  // Title immediately so the item is findable even before books load / with empty shelf.
  tray.setTitle(EMPTY_HINT)
}

export function setState(newState: MenuBarState): void {
  if (!tray) return

  const chapterChanged =
    !state || state.bookId !== newState.bookId || state.chapterIndex !== newState.chapterIndex
  state = newState
  if (chapterChanged) {
    cachedChapterText = null
    cachedPages = []
    cachedChapterKey = null
  }
  render()
  persistProgress()
}

export function render(): void {
  if (!tray || !state) return
  if (state.hidden) {
    tray.setTitle('')
    return
  }
  if (state.bookId < 0) {
    tray.setTitle(EMPTY_HINT)
    return
  }

  const page = cachedPages[state.pageIndex]
  if (page == null) {
    tray.setTitle('…')
    return
  }
  const chapter = getChapter(state.bookId, state.chapterIndex)
  const chapterLabel = chapter ? `${state.chapterIndex + 1}. ` : ''
  tray.setTitle(truncateForMenuBar(chapterLabel + page))
}

export async function loadCurrentChapterPages(): Promise<void> {
  if (!state || state.bookId < 0) return
  const key = `${state.bookId}:${state.chapterIndex}`
  if (cachedChapterKey === key && cachedPages.length > 0) return

  const book = getBook(state.bookId)
  if (!book) return
  const chapter = getChapter(state.bookId, state.chapterIndex)
  if (!chapter) return

  const { readFile } = await import('node:fs/promises')
  const buf = await readFile(book.filePath)
  const { decodeBuffer } = await import('./parsers/encoding')
  const { text } = decodeBuffer(buf)
  const allChapters = listChapters(state.bookId)
  const nextCh = allChapters.find((c) => c.index === state!.chapterIndex + 1)
  const slice = text.slice(chapter.startOffset, nextCh ? nextCh.startOffset : text.length)
  cachedChapterText = slice
  const chars = getSettings().charsPerPage
  cachedPages = paginate(slice, chars)
  cachedChapterKey = key

  if (state.pageIndex >= cachedPages.length) {
    state.pageIndex = Math.max(0, cachedPages.length - 1)
  }
  render()
}

/** Re-split pages after charsPerPage changes; keep approximate position. */
export async function reloadPagination(): Promise<void> {
  if (!state || !cachedChapterText) return
  let charsBefore = 0
  for (let i = 0; i < state.pageIndex && i < cachedPages.length; i++) {
    charsBefore += cachedPages[i].length
  }
  cachedPages = paginate(cachedChapterText, getSettings().charsPerPage)
  const selected = selectPageForOffset(cachedPages, charsBefore)
  state.pageIndex = selected.pageIndex
  render()
  persistProgress()
}

export async function nextPage(): Promise<void> {
  if (!state || state.bookId < 0) return
  await loadCurrentChapterPages()
  if (state.pageIndex < cachedPages.length - 1) {
    state.pageIndex++
  } else {
    const totalChapters = listChapters(state.bookId).length
    if (state.chapterIndex < totalChapters - 1) {
      state.chapterIndex++
      state.pageIndex = 0
      cachedChapterKey = null
      await loadCurrentChapterPages()
    } else {
      state.chapterIndex = 0
      state.pageIndex = 0
      cachedChapterKey = null
      await loadCurrentChapterPages()
    }
  }
  render()
  persistProgress()
}

export async function prevPage(): Promise<void> {
  if (!state || state.bookId < 0) return
  await loadCurrentChapterPages()
  if (state.pageIndex > 0) {
    state.pageIndex--
  } else if (state.chapterIndex > 0) {
    state.chapterIndex--
    cachedChapterKey = null
    await loadCurrentChapterPages()
    state.pageIndex = Math.max(0, cachedPages.length - 1)
  } else {
    const totalChapters = listChapters(state.bookId).length
    state.chapterIndex = Math.max(0, totalChapters - 1)
    cachedChapterKey = null
    await loadCurrentChapterPages()
    state.pageIndex = Math.max(0, cachedPages.length - 1)
  }
  render()
  persistProgress()
}

export async function nextChapter(): Promise<void> {
  if (!state || state.bookId < 0) return
  const totalChapters = listChapters(state.bookId).length
  if (state.chapterIndex < totalChapters - 1) {
    state.chapterIndex++
    state.pageIndex = 0
    cachedChapterKey = null
    await loadCurrentChapterPages()
    render()
    persistProgress()
  }
}

export async function prevChapter(): Promise<void> {
  if (!state || state.bookId < 0) return
  if (state.chapterIndex > 0) {
    state.chapterIndex--
    state.pageIndex = 0
    cachedChapterKey = null
    await loadCurrentChapterPages()
    render()
    persistProgress()
  }
}

export async function jumpToChapter(chapterIndex: number, pageIndex: number = 0): Promise<void> {
  if (!state || state.bookId < 0) return
  state.chapterIndex = chapterIndex
  state.pageIndex = pageIndex
  cachedChapterKey = null
  await loadCurrentChapterPages()
  render()
  persistProgress()
}

export function setHidden(hidden: boolean): void {
  if (!state) return
  state.hidden = hidden
  render()
}

export function toggleHidden(): void {
  if (!state) return
  state.hidden = !state.hidden
  render()
}

/**
 * Switch book and restore last chapter + approximate page.
 */
export async function switchToBook(bookId: number): Promise<void> {
  const book = getBook(bookId)
  if (!book) return
  const progress = getProgress(bookId)
  state = {
    bookId,
    chapterIndex: progress?.chapterIndex ?? 0,
    pageIndex: 0,
    hidden: state?.hidden ?? false
  }
  cachedChapterKey = null
  await loadCurrentChapterPages()
  if (progress && cachedChapterText && cachedPages.length > 0) {
    const approxOffset = Math.floor((progress.chapterProgress ?? 0) * cachedChapterText.length)
    state.pageIndex = selectPageForOffset(cachedPages, approxOffset).pageIndex
  }
  render()
  persistProgress()
}

export function getCurrentPages(): string[] {
  return cachedPages
}

function persistProgress(): void {
  if (!state || state.bookId < 0) return
  let fraction = 0
  if (cachedChapterText && cachedChapterText.length > 0 && cachedPages.length > 0) {
    let charsBefore = 0
    for (let i = 0; i < state.pageIndex && i < cachedPages.length; i++) {
      charsBefore += cachedPages[i].length
    }
    fraction = charsBefore / cachedChapterText.length
  }
  upsertProgress(state.bookId, state.chapterIndex, fraction)
}

function truncateForMenuBar(text: string): string {
  if (text.length <= 80) return text
  return text.slice(0, 77) + '…'
}
