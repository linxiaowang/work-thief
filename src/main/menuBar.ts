import { Tray, nativeImage, app } from 'electron'
import { join } from 'node:path'
import { getBook } from './db/books'
import { listChapters, getChapter } from './db/chapters'
import { getProgress, upsertProgress } from './db/progress'
import { getSettings } from './db/settings'
import { paginate, selectPageForOffset, resolveChapterJumpPageIndex } from './pagination'
import { normalizeNovelText } from './parsers/normalize'

/**
 * MenuBar — owns the macOS menu bar item and all reading state.
 *
 * Tray icon stays put. Title shows the current book-wide page.
 * Boss Key toggles novel text ↔ disguise (moyu_text), never blank-only.
 *
 * Page hot path is sync: pages stay in memory after load; next/prev only
 * bump pageIndex + setTitle; SQLite persist is debounced.
 */

export interface MenuBarState {
  bookId: number
  /** Book-wide page index (0-based). */
  pageIndex: number
  /** Optional chapter highlight for jump UI. */
  chapterIndex: number
  /** Boss disguise mode. */
  hidden: boolean
}

/** Short empty-shelf hint — long Chinese+arrow strings get clipped / hard to spot. */
const EMPTY_HINT = 'WorkThief · 选 txt'

const PERSIST_DEBOUNCE_MS = 800
/** Left-click / nextPage debounce so one physical click ≠ two page turns. */
const NEXT_PAGE_DEBOUNCE_MS = 80

/**
 * 16×16 teal/orange book + white W — non-template color fallback.
 */
const EMBEDDED_COLOR_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAtElEQVR4XmNgoAYQsbH5Tw6G2w3SfCdO7P/5VIX/OpOn/tedPO2/3uQpeNkgPVgN+A8E/EuX/hdYuvg/39IlWNkgNXgN0J0EdMEkoAsmAV2DhU3QAP7lQBcsB7pgOdAFWNgEDdCdCHTBRKALJk4FqQUDEBsmTtAA/mVAFyxbDNaIi40/DICxALYVLUZAYqDYIegCkAJcsQDz0hCKBeQYISoW+JYB4x4aC/jYGGFAUWaiJEcDAFrfzjkeNFsnAAAAAElFTkSuQmCC'

let tray: Tray | null = null
let state: MenuBarState | null = null
let cachedPages: string[] = []
let cachedBookText: string | null = null
let cachedBookKey: string | null = null
let onNeedChooseNovel: (() => void) | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null
let onRightClickMenu: (() => void) | null = null
let lastNextPageAt = 0

export function getTray(): Tray | null {
  return tray
}

export function getState(): MenuBarState | null {
  return state
}

/** Wire first-run / empty-shelf click → file picker. */
export function setChooseNovelHandler(fn: () => void): void {
  onNeedChooseNovel = fn
}

/** Wire right-click → popUpContextMenu (built in index). */
export function setRightClickHandler(fn: () => void): void {
  onRightClickMenu = fn
}

function resolveTrayIcon(): Electron.NativeImage | null {
  const candidates = [
    join(process.cwd(), 'resources/iconTemplate.png'),
    join(app.getAppPath(), 'resources/iconTemplate.png'),
    join(__dirname, '../../resources/iconTemplate.png'),
    join(process.cwd(), 'resources/icon.png'),
    join(app.getAppPath(), 'resources/icon.png'),
    join(__dirname, '../../resources/icon.png')
  ]

  for (const path of candidates) {
    const icon = nativeImage.createFromPath(path)
    console.log(`[WorkThief] tray icon candidate: ${path} isEmpty=${icon.isEmpty()}`)
    if (!icon.isEmpty()) {
      if (path.includes('iconTemplate')) {
        icon.setTemplateImage(true)
      }
      console.log(
        `[WorkThief] tray icon chosen: ${path} isEmpty=${icon.isEmpty()} template=${path.includes('iconTemplate')}`
      )
      return icon
    }
  }

  const icon = nativeImage.createFromDataURL(EMBEDDED_COLOR_PNG)
  console.log(`[WorkThief] tray icon chosen: <embedded-color-fallback> isEmpty=${icon.isEmpty()}`)
  if (icon.isEmpty()) return null
  return icon
}

export function initTray(): void {
  // Reliable macOS text status-item: create with empty image FIRST, then setTitle.
  tray = new Tray(nativeImage.createEmpty())
  tray.setIgnoreDoubleClickEvents(true)
  tray.setToolTip('WorkThief')
  tray.setTitle(EMPTY_HINT)
  console.log(`[WorkThief] tray title after setTitle: ${JSON.stringify(tray.getTitle())}`)

  try {
    let icon = resolveTrayIcon()
    if (icon && !icon.isEmpty()) {
      const size = icon.getSize()
      if (size.width !== 18 || size.height !== 18) {
        icon = icon.resize({ width: 18, height: 18 })
      }
      tray.setImage(icon)
      console.log(`[WorkThief] tray setImage after title size=${JSON.stringify(icon.getSize())}`)
    } else {
      console.log('[WorkThief] tray keeping empty image; title-only status item')
    }
  } catch (err) {
    console.log('[WorkThief] tray.setImage skipped', err)
  }

  try {
    const b = tray.getBounds()
    console.log(
      `[WorkThief] tray bounds: ${JSON.stringify(b)} (macOS status item is on the RIGHT; {0,0,0,0} means not on menu bar)`
    )
  } catch (err) {
    console.log('[WorkThief] tray.getBounds unavailable', err)
  }

  // Thief-style: left click pages (or picker); right click opens menu.
  // Do NOT call tray.setContextMenu — that steals left-click.
  tray.on('click', () => {
    if (!state || state.bookId < 0) {
      onNeedChooseNovel?.()
    } else {
      nextPage()
    }
  })

  tray.on('right-click', () => {
    onRightClickMenu?.()
  })
}

export function setState(newState: MenuBarState): void {
  if (!tray) return
  const bookChanged = !state || state.bookId !== newState.bookId
  state = newState
  if (bookChanged) {
    cachedBookText = null
    cachedPages = []
    cachedBookKey = null
  }
  render()
  schedulePersistProgress()
}

export function render(): void {
  if (!tray || !state) return
  if (state.hidden) {
    tray.setTitle(truncateForMenuBar(resolveDisguiseText()))
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
  const settings = getSettings()
  let title = page
  if (settings.showPageNumber && cachedPages.length > 0) {
    title = `${page}  ${state.pageIndex + 1}/${cachedPages.length}`
  }
  // Last page: stop (no wrap) + optional 「·完」 suffix.
  if (cachedPages.length > 0 && state.pageIndex >= cachedPages.length - 1) {
    title = `${title}·完`
  }
  tray.setTitle(truncateForMenuBar(title))
}

/** Boss disguise: custom moyu_text, or current HH:mm when empty. */
export function resolveDisguiseText(): string {
  const raw = getSettings().moyuText?.trim() ?? ''
  if (raw) return raw
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export async function loadBookPages(): Promise<void> {
  if (!state || state.bookId < 0) return
  const settings = getSettings()
  const key = `${state.bookId}:${settings.charsPerPage}:${settings.preferredEncoding}`
  if (cachedBookKey === key && cachedPages.length > 0) return

  const book = getBook(state.bookId)
  if (!book) return

  const { readFile } = await import('node:fs/promises')
  const buf = await readFile(book.filePath)
  const { decodeWithPreference } = await import('./parsers/encoding')
  const { text } = decodeWithPreference(buf, settings.preferredEncoding)

  // Thief-style reading string (collapsed whitespace) — same as import offsets + paginate.
  cachedBookText = normalizeNovelText(text)
  cachedPages = paginate(cachedBookText, settings.charsPerPage)
  cachedBookKey = key

  if (state.pageIndex >= cachedPages.length) {
    state.pageIndex = Math.max(0, cachedPages.length - 1)
  }
  syncChapterIndexFromOffset()
  render()
}

/** Re-split after charsPerPage / encoding change; keep approximate position. */
export async function reloadPagination(): Promise<void> {
  if (!state || state.bookId < 0) return
  let charsBefore = 0
  for (let i = 0; i < state.pageIndex && i < cachedPages.length; i++) {
    charsBefore += cachedPages[i].length
  }
  cachedBookKey = null
  await loadBookPages()
  if (cachedPages.length > 0) {
    state.pageIndex = selectPageForOffset(cachedPages, charsBefore).pageIndex
  }
  syncChapterIndexFromOffset()
  render()
  schedulePersistProgress()
}

/**
 * Sync page hot path: memory only — no loadBookPages, no listChapters, no SQLite.
 * Persist is debounced. At last page: STOP (do not wrap).
 */
export function nextPage(): void {
  if (!state) return
  const now = Date.now()
  if (now - lastNextPageAt < NEXT_PAGE_DEBOUNCE_MS) return
  lastNextPageAt = now

  if (state.bookId < 0) {
    onNeedChooseNovel?.()
    return
  }
  // Boss disguise: left-click / nextPage only exits disguise — do NOT advance page.
  if (state.hidden) {
    state.hidden = false
    render()
    return
  }
  if (cachedPages.length === 0) return
  if (state.pageIndex < cachedPages.length - 1) {
    state.pageIndex++
  }
  // else: already on last page — stop, still re-render (·完)
  render()
  schedulePersistProgress()
}

/** Sync prev; at first page STOP (do not wrap to last). */
export function prevPage(): void {
  if (!state) return
  if (state.bookId < 0) {
    onNeedChooseNovel?.()
    return
  }
  // Boss disguise: exit only — do not change pageIndex.
  if (state.hidden) {
    state.hidden = false
    render()
    return
  }
  if (cachedPages.length === 0) return
  if (state.pageIndex > 0) {
    state.pageIndex--
  }
  render()
  schedulePersistProgress()
}

export async function nextChapter(): Promise<void> {
  if (!state || state.bookId < 0) return
  const chapters = listChapters(state.bookId)
  if (chapters.length === 0) return
  const next = chapters.find((c) => c.index > state!.chapterIndex)
  if (!next) return
  await jumpToChapter(next.index)
}

export async function prevChapter(): Promise<void> {
  if (!state || state.bookId < 0) return
  const chapters = listChapters(state.bookId)
  if (chapters.length === 0) return
  const prev = [...chapters].reverse().find((c) => c.index < state!.chapterIndex)
  if (!prev) return
  await jumpToChapter(prev.index)
}

/** Optional chapter jump — maps chapter start offset → book-wide page. */
export async function jumpToChapter(chapterIndex: number): Promise<void> {
  if (!state || state.bookId < 0) return
  // Force exit Boss disguise so novel text shows immediately after jump.
  state.hidden = false
  await loadBookPages()
  const chapter = getChapter(state.bookId, chapterIndex)
  if (!chapter || !cachedBookText || cachedPages.length === 0) {
    console.error('[WorkThief] jumpToChapter failed: missing chapter/pages', {
      chapterIndex,
      hasChapter: !!chapter,
      hasText: !!cachedBookText,
      pageCount: cachedPages.length
    })
    failJump()
    return
  }

  const pageIndex = resolveChapterJumpPageIndex(cachedPages, cachedBookText, chapter)
  if (pageIndex == null || cachedPages[pageIndex] == null) {
    console.error('[WorkThief] jumpToChapter failed: could not resolve page', {
      chapterIndex,
      title: chapter.title,
      startOffset: chapter.startOffset,
      textLength: cachedBookText.length,
      pageCount: cachedPages.length
    })
    failJump()
    return
  }

  state.chapterIndex = chapterIndex
  state.pageIndex = pageIndex
  // Immediate novel title (Boss already cleared).
  render()
  schedulePersistProgress(true)
}

/** Show jump failure on tray; fall back to first page for recovery. */
function failJump(): void {
  if (!state) return
  state.pageIndex = 0
  state.hidden = false
  if (tray) {
    tray.setTitle('跳转失败')
  }
  schedulePersistProgress(true)
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
 * Switch book and restore approximate book-wide page from progress fraction.
 */
export async function switchToBook(bookId: number): Promise<void> {
  const book = getBook(bookId)
  if (!book) return
  const progress = getProgress(bookId)
  state = {
    bookId,
    pageIndex: 0,
    chapterIndex: progress?.chapterIndex ?? 0,
    hidden: state?.hidden ?? false
  }
  cachedBookKey = null
  await loadBookPages()
  if (progress && cachedBookText && cachedPages.length > 0) {
    const approxOffset = Math.floor((progress.chapterProgress ?? 0) * cachedBookText.length)
    state.pageIndex = selectPageForOffset(cachedPages, approxOffset).pageIndex
    syncChapterIndexFromOffset()
  }
  render()
  schedulePersistProgress(true)
}

export function getCurrentPages(): string[] {
  return cachedPages
}

/** Refresh chapterIndex from current page (for menu checkbox). Not on page hot path. */
export function syncChapterIndexForMenu(): void {
  syncChapterIndexFromOffset()
}

function syncChapterIndexFromOffset(): void {
  if (!state || state.bookId < 0 || !cachedBookText) return
  let charsBefore = 0
  for (let i = 0; i < state.pageIndex && i < cachedPages.length; i++) {
    charsBefore += cachedPages[i].length
  }
  const chapters = listChapters(state.bookId)
  if (chapters.length === 0) {
    state.chapterIndex = 0
    return
  }
  let best = chapters[0].index
  for (const c of chapters) {
    if (c.startOffset <= charsBefore) best = c.index
    else break
  }
  state.chapterIndex = best
}

function schedulePersistProgress(immediate = false): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (immediate) {
    persistProgress()
    return
  }
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistProgress()
  }, PERSIST_DEBOUNCE_MS)
}

function persistProgress(): void {
  if (!state || state.bookId < 0) return
  // Lazily sync chapter highlight before write (not on every page turn render).
  syncChapterIndexFromOffset()
  let fraction = 0
  if (cachedBookText && cachedBookText.length > 0 && cachedPages.length > 0) {
    let charsBefore = 0
    for (let i = 0; i < state.pageIndex && i < cachedPages.length; i++) {
      charsBefore += cachedPages[i].length
    }
    fraction = charsBefore / cachedBookText.length
  }
  upsertProgress(state.bookId, state.chapterIndex, fraction)
}

function truncateForMenuBar(text: string): string {
  // Display only — pages are already collapsed; still flatten disguise / legacy newlines.
  const oneLine = text.replace(/\s*\n\s*/g, ' ').replace(/　+/g, ' ').trim()
  if (oneLine.length <= 80) return oneLine
  return oneLine.slice(0, 77) + '…'
}

export const _internals = { PERSIST_DEBOUNCE_MS, NEXT_PAGE_DEBOUNCE_MS, EMPTY_HINT }
