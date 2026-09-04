import { Tray, nativeImage } from 'electron'
import { join } from 'node:path'
import { getBook } from './db/books'
import { listChapters, getChapter } from './db/chapters'
import { getProgress, upsertProgress } from './db/progress'
import { paginate } from './pagination'

/**
 * MenuBar — owns the macOS menu bar item and all reading state.
 *
 * The tray icon stays put at all times. The title text shows the
 * current page of the current chapter. The Boss Key hides the title
 * but leaves the icon visible.
 */

export interface MenuBarState {
  bookId: number
  chapterIndex: number
  pageIndex: number
  hidden: boolean
}

let tray: Tray | null = null
let state: MenuBarState | null = null
let cachedPages: string[] = []
let cachedChapterText: string | null = null
let cachedChapterId: number | null = null

export function getTray(): Tray | null {
  return tray
}

export function getState(): MenuBarState | null {
  return state
}

/**
 * Initialize the tray icon. Called once at app startup.
 */
export function initTray(): void {
  const templatePath = join(__dirname, '../../resources/iconTemplate.png')
  const fallbackPath = join(__dirname, '../../resources/icon.png')
  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(templatePath)
    if (icon.isEmpty()) throw new Error('template empty')
    icon.setTemplateImage(true)
  } catch {
    icon = nativeImage.createFromPath(fallbackPath)
  }
  tray = new Tray(icon)
  tray.setToolTip('WorkThief — 菜单栏摸鱼阅读')
}

/**
 * Set or replace the current reading state and refresh the title text.
 * Resets the page cache for the chapter if chapterIndex changed.
 */
export function setState(newState: MenuBarState): void {
  if (!tray) return

  const chapterChanged = !state || state.bookId !== newState.bookId || state.chapterIndex !== newState.chapterIndex
  state = newState
  if (chapterChanged) {
    cachedChapterText = null
    cachedPages = []
  }
  render()
  persistProgress()
}

/**
 * Refresh the menu bar text using the current state. Call after
 * changing pages, toggling hidden, or loading a chapter's pages.
 */
export function render(): void {
  if (!tray || !state) return
  if (state.hidden) {
    tray.setTitle('')
    return
  }

  const page = cachedPages[state.pageIndex] ?? '加载中…'
  const chapter = getChapter(state.bookId, state.chapterIndex)
  const chapterLabel = chapter ? ` ${state.chapterIndex + 1}. ` : ' '
  const truncated = truncateForMenuBar(chapterLabel + page)
  tray.setTitle(truncated)
}

/**
 * Load all pages for the current chapter. Lazy: only reads/decodes the
 * file the first time we visit a chapter.
 */
export async function loadCurrentChapterPages(): Promise<void> {
  if (!state) return
  if (cachedChapterId === state.chapterIndex) return

  const book = getBook(state.bookId)
  if (!book) return
  const chapter = getChapter(state.bookId, state.chapterIndex)
  if (!chapter) return

  // Read the chapter text from disk (cached by chapter id+bookId)
  const { readFile } = await import('node:fs/promises')
  const buf = await readFile(book.filePath)
  const { decodeBuffer } = await import('./parsers/encoding')
  const { text } = decodeBuffer(buf)
  const allChapters = listChapters(state.bookId)
  const nextCh = allChapters.find((c) => c.index === state!.chapterIndex + 1)
  const slice = text.slice(chapter.startOffset, nextCh ? nextCh.startOffset : text.length)
  cachedChapterText = slice
  cachedPages = paginate(slice)
  cachedChapterId = state.chapterIndex

  // Clamp pageIndex in case we jumped to a shorter chapter.
  if (state.pageIndex >= cachedPages.length) {
    state.pageIndex = Math.max(0, cachedPages.length - 1)
  }
  render()
}

/**
 * Advance to the next page; rolls into next chapter if needed; rolls
 * into next book if needed.
 */
export async function nextPage(): Promise<void> {
  if (!state) return
  await loadCurrentChapterPages()
  if (state.pageIndex < cachedPages.length - 1) {
    state.pageIndex++
  } else {
    // Last page of current chapter → next chapter.
    const totalChapters = listChapters(state.bookId).length
    if (state.chapterIndex < totalChapters - 1) {
      state.chapterIndex++
      state.pageIndex = 0
      cachedChapterId = null
      await loadCurrentChapterPages()
    } else {
      // Last chapter, last page — wrap to first page of first chapter.
      state.chapterIndex = 0
      state.pageIndex = 0
      cachedChapterId = null
      await loadCurrentChapterPages()
    }
  }
  render()
  persistProgress()
}

export async function prevPage(): Promise<void> {
  if (!state) return
  await loadCurrentChapterPages()
  if (state.pageIndex > 0) {
    state.pageIndex--
  } else {
    // First page → previous chapter's last page.
    if (state.chapterIndex > 0) {
      state.chapterIndex--
      cachedChapterId = null
      await loadCurrentChapterPages()
      state.pageIndex = Math.max(0, cachedPages.length - 1)
    } else {
      // Wrap to last page of last chapter.
      const totalChapters = listChapters(state.bookId).length
      state.chapterIndex = Math.max(0, totalChapters - 1)
      cachedChapterId = null
      await loadCurrentChapterPages()
      state.pageIndex = Math.max(0, cachedPages.length - 1)
    }
  }
  render()
  persistProgress()
}

export async function nextChapter(): Promise<void> {
  if (!state) return
  const totalChapters = listChapters(state.bookId).length
  if (state.chapterIndex < totalChapters - 1) {
    state.chapterIndex++
    state.pageIndex = 0
    cachedChapterId = null
    await loadCurrentChapterPages()
    render()
    persistProgress()
  }
}

export async function prevChapter(): Promise<void> {
  if (!state) return
  if (state.chapterIndex > 0) {
    state.chapterIndex--
    state.pageIndex = 0
    cachedChapterId = null
    await loadCurrentChapterPages()
    render()
    persistProgress()
  }
}

export async function jumpToChapter(chapterIndex: number, pageIndex: number = 0): Promise<void> {
  if (!state) return
  state.chapterIndex = chapterIndex
  state.pageIndex = pageIndex
  cachedChapterId = null
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
 * Switch to a different book, restoring its last-read position.
 */
export async function switchToBook(bookId: number): Promise<void> {
  const book = getBook(bookId)
  if (!book) return
  const progress = getProgress(bookId)
  state = {
    bookId,
    chapterIndex: progress?.chapterIndex ?? 0,
    pageIndex: 0, // pageIndex isn't persisted — start at top of resumed chapter
    hidden: state?.hidden ?? false
  }
  cachedChapterId = null
  await loadCurrentChapterPages()
  render()
}

export function getCurrentPages(): string[] {
  return cachedPages
}

function persistProgress(): void {
  if (!state) return
  // Persist as character progress within the chapter (best we can do
  // without a page → char offset mapping; rough approximation).
  upsertProgress(state.bookId, state.chapterIndex, 0)
}

function truncateForMenuBar(text: string): string {
  // macOS truncates Tray.setTitle around 30-50 chars depending on other
  // menu bar items. Be defensive: hard-cut at 80 chars.
  if (text.length <= 80) return text
  return text.slice(0, 77) + '…'
}
