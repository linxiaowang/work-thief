import { Tray, nativeImage } from 'electron'
import { getBook, updateBookParseMeta } from './db/books'
import { listChapters, getChapter, replaceChapters } from './db/chapters'
import { getProgress, upsertProgress } from './db/progress'
import { getSettings, getSettingsOrDefault } from './db/settings'
import {
  paginate,
  selectPageForOffset,
  resolveChapterJumpPageIndex,
  isBlankPage,
  findNonEmptyPageIndex
} from './pagination'
import { normalizeNovelText } from './parsers/normalize'
import {
  truncateForMenuBar,
  MENU_BAR_TITLE_MAX,
  MENU_BAR_TITLE_RETRY,
  buildPageSuffix,
  composeReadingTitle,
  resolveEffectiveCharsPerPage,
  menuBarTitleSuffix,
  safeTrayDisplayUnits,
  slicePageBodyForMenuBarDisplay
} from './trayTitle'
import {
  displayUnitsCacheKey,
  resolveMenuBarDisplayUnits,
  suffixSampleForPaging,
  MENU_BAR_DISPLAY_FALLBACK
} from './menuBarMeasure'

/**
 * MenuBar — owns the macOS menu bar item and all reading state.
 *
 * Title-only menu bar item (no tray icon). Title shows the current book-wide page.
 * Boss Key toggles novel text ↔ disguise (moyu_text), never blank-only.
 *
 * Page hot path is sync when pages are cached: next/prev only bump
 * pageIndex + setTitle; SQLite persist is debounced. Empty cache awaits load.
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

let tray: Tray | null = null
let state: MenuBarState | null = null
let cachedPages: string[] = []
let cachedBookText: string | null = null
let cachedBookKey: string | null = null
let cachedMenuBarDisplayUnits: number = MENU_BAR_DISPLAY_FALLBACK
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

export function initTray(): void {
  // macOS text status item: empty image + setTitle (no menu bar icon).
  tray = new Tray(nativeImage.createEmpty())
  tray.setIgnoreDoubleClickEvents(true)
  tray.setToolTip('WorkThief')
  setTrayTitle(EMPTY_HINT)
  console.log(`[WorkThief] tray title after setTitle: ${JSON.stringify(tray.getTitle())}`)

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
      void nextPage().catch((err) => {
        console.error('[WorkThief] nextPage (tray click) failed:', err)
      })
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
    setTrayTitle(resolveDisguiseText())
    return
  }
  if (state.bookId < 0) {
    setTrayTitle(EMPTY_HINT)
    return
  }

  // Do not auto-advance pageIndex here — that skips a logical page on each blank render.
  const page = cachedPages[state.pageIndex]
  if (page == null || isBlankPage(page)) {
    setTrayTitle('…')
    return
  }
  const settings = getSettingsOrDefault()
  const total = cachedPages.length
  const isLast = total > 0 && state.pageIndex >= total - 1
  const suffixOpts = {
    showPageNumber: settings.showPageNumber,
    isLast
  }
  const barSuffix = menuBarTitleSuffix(state.pageIndex, total, suffixOpts)
  const title = composeReadingTitle(page, barSuffix)
  setReadingTrayTitle(page, barSuffix, title, {
    showPageNumber: settings.showPageNumber,
    pageIndex: state.pageIndex,
    totalPages: total
  })
}

/** Boss disguise: custom moyu_text, or current HH:mm when empty. */
export function resolveDisguiseText(): string {
  const raw = getSettingsOrDefault().moyuText?.trim() ?? ''
  if (raw) return raw
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * Re-parse TXT from disk and rewrite chapters so offsets match current
 * reading-text normalization (auto-fixes legacy imports).
 */
export async function refreshChaptersFromFile(bookId: number): Promise<void> {
  const book = getBook(bookId)
  if (!book) return
  try {
    const settings = getSettings()
    const { readFile } = await import('node:fs/promises')
    const buf = await readFile(book.filePath)
    const { decodeWithPreference } = await import('./parsers/encoding')
    const { text, encoding } = decodeWithPreference(buf, settings.preferredEncoding)
    const { parseTxtText } = await import('./parsers/txt')
    const parsed = parseTxtText(text, book.title, encoding)
    replaceChapters(
      bookId,
      parsed.chapters.map((c) => ({
        bookId,
        index: c.index,
        title: c.title,
        startOffset: c.startOffset,
        charCount: c.charCount
      }))
    )
    updateBookParseMeta(bookId, {
      encoding: parsed.encoding,
      chapterCount: parsed.chapters.length,
      totalChars: parsed.totalChars
    })
  } catch (err) {
    console.error('[WorkThief] refreshChaptersFromFile failed', { bookId, err })
  }
}

export async function loadBookPages(): Promise<void> {
  if (!state || state.bookId < 0) return
  const settings = getSettingsOrDefault()
  const suffixSample = suffixSampleForPaging(settings.showPageNumber)
  const measuredUnits = safeTrayDisplayUnits(
    resolveMenuBarDisplayUnits(tray, suffixSample)
  )
  const unitsKey = displayUnitsCacheKey(measuredUnits)
  const key = `${state.bookId}:${settings.charsPerPage}:${settings.preferredEncoding}:${settings.showPageNumber}:u${unitsKey}`
  if (cachedBookKey === key && cachedPages.length > 0) return

  const book = getBook(state.bookId)
  if (!book) return

  const { readFile } = await import('node:fs/promises')
  const buf = await readFile(book.filePath)
  const { decodeWithPreference } = await import('./parsers/encoding')
  const { text } = decodeWithPreference(buf, settings.preferredEncoding)

  cachedMenuBarDisplayUnits = measuredUnits
  cachedBookText = normalizeNovelText(text)
  const effectiveChars = resolveEffectiveCharsPerPage(
    cachedBookText.length,
    settings.charsPerPage,
    settings.showPageNumber,
    measuredUnits
  )
  cachedPages = paginate(cachedBookText, effectiveChars)
  cachedBookKey = key

  if (state.pageIndex >= cachedPages.length) {
    state.pageIndex = Math.max(0, cachedPages.length - 1)
  }
  syncChapterIndexFromOffset()
  render()
}

/** Display layout changed — remeasure tray width and re-split pages. */
export function invalidatePaginationForDisplayChange(): void {
  cachedBookKey = null
}

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
 * Page forward. When cache is warm: sync bump + setTitle.
 * When empty: await loadBookPages, then page; still empty → status message (never silent).
 */
export async function nextPage(): Promise<void> {
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
  if (cachedPages.length === 0) {
    await loadBookPages()
    if (cachedPages.length === 0) {
      setTrayTitle('无内容·重新选书')
      return
    }
  }
  if (state.pageIndex < cachedPages.length - 1) {
    state.pageIndex++
  }
  // else: already on last page — stop, still re-render (·完)
  render()
  schedulePersistProgress()
}

/** Prev page; empty cache loads first. At first page STOP (do not wrap). */
export async function prevPage(): Promise<void> {
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
  if (cachedPages.length === 0) {
    await loadBookPages()
    if (cachedPages.length === 0) {
      setTrayTitle('无内容·重新选书')
      return
    }
  }
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

/**
 * Chapter jump — recalculate page from this chapter's first char in reading text.
 * Prefer validated startOffset; else nth title match. Never keep the old pageIndex
 * on success. Skips blank pages so tray never gets setTitle('').
 * Not found → 「找不到该章」, keep current page.
 */
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
    failJumpNotFound()
    return
  }

  const settings = getSettingsOrDefault()
  const title = chapter.title?.trim() ?? ''
  let occurrence = 0
  for (const c of listChapters(state.bookId)) {
    if (c.index >= chapterIndex) break
    if ((c.title?.trim() ?? '') === title) occurrence++
  }

  // Must match loadBookPages effective slice length (suffix-aware bodyMax).
  const effectiveChars = resolveEffectiveCharsPerPage(
    cachedBookText.length,
    settings.charsPerPage,
    settings.showPageNumber,
    cachedMenuBarDisplayUnits
  )
  // Recalculate from chapter first char (offset/title) against current pages —
  // do not reuse the previous book-wide pageIndex.
  const pageIndex = resolveChapterJumpPageIndex(
    cachedBookText,
    chapter,
    effectiveChars,
    occurrence,
    cachedPages
  )
  if (pageIndex == null || cachedPages[pageIndex] == null) {
    console.error('[WorkThief] jumpToChapter failed: title not in reading text', {
      chapterIndex,
      title: chapter.title,
      textLength: cachedBookText.length,
      pageCount: cachedPages.length,
      occurrence
    })
    failJumpNotFound()
    return
  }

  state.chapterIndex = chapterIndex
  state.pageIndex = findNonEmptyPageIndex(
    cachedPages,
    Math.min(pageIndex, cachedPages.length - 1),
    1
  )
  // Immediate novel title (Boss already cleared).
  render()
  schedulePersistProgress(true)
}

/** Title not found: keep current page (never blank); show status on tray. */
function failJumpNotFound(): void {
  if (!state) return
  state.hidden = false
  // Keep pageIndex — do not jump to 0 / blank.
  setTrayTitle('找不到该章')
  // Also ensure current page remains available on next click.
  if (cachedPages.length > 0 && cachedPages[state.pageIndex] != null) {
    // Title shows the error; progress unchanged.
  } else if (cachedPages.length > 0) {
    state.pageIndex = Math.min(state.pageIndex, cachedPages.length - 1)
  }
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
 * Switch book: re-parse chapters from file (fix offsets), then restore page.
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
  cachedBookText = null
  cachedPages = []
  await refreshChaptersFromFile(bookId)
  await loadBookPages()
  // Re-read after await: TS narrows module `let` to null after assignment above.
  const reading = cachedBookText as string | null
  if (progress && reading && cachedPages.length > 0) {
    const approxOffset = Math.floor((progress.chapterProgress ?? 0) * reading.length)
    state.pageIndex = selectPageForOffset(cachedPages, approxOffset).pageIndex
    syncChapterIndexFromOffset()
  }
  if (cachedPages.length === 0) {
    setTrayTitle('无内容·重新选书')
  } else {
    render()
  }
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
  // Locate each chapter title in reading text (nth occurrence); ignore legacy offsets.
  let best = chapters[0].index
  let searchFrom = 0
  for (const c of chapters) {
    const title = c.title?.trim() ?? ''
    let offset = c.startOffset
    if (title) {
      let idx = cachedBookText.indexOf(title, searchFrom)
      if (idx < 0) idx = cachedBookText.indexOf(title)
      if (idx >= 0) {
        offset = idx
        searchFrom = idx + Math.max(1, title.length)
      }
    }
    if (offset <= charsBefore) best = c.index
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

/** setTitle with empty-getTitle retry at 16 chars (hints / errors / disguise). */
function setTrayTitle(text: string): void {
  if (!tray) return
  let primary = truncateForMenuBar(text, MENU_BAR_TITLE_MAX)
  // Never blank the menu bar — whitespace-only input becomes a visible placeholder.
  if (!primary) primary = '…'
  tray.setTitle(primary)
  let shown = ''
  try {
    shown = tray.getTitle() ?? ''
  } catch {
    shown = ''
  }
  if (!shown) {
    console.warn(
      '[WorkThief] tray getTitle() empty after setTitle; retrying with 16 chars',
      JSON.stringify(primary)
    )
    tray.setTitle(truncateForMenuBar(text, MENU_BAR_TITLE_RETRY))
  }
}

/**
 * Reading title — always slice to width budget before setTitle.
 * Do not trust getTitle() on success (macOS can return text while showing blank).
 */
function setReadingTrayTitle(
  page: string,
  barSuffix: string,
  _title: string,
  meta: { showPageNumber: boolean; pageIndex: number; totalPages: number }
): void {
  if (!tray) return
  if (isBlankPage(page)) {
    setTrayTitle('…')
    return
  }

  const pageHint = meta.totalPages > 0 ? `${meta.pageIndex + 1}/${meta.totalPages}` : ''
  const tip = pageHint ? `${page}  (${pageHint})` : page
  try {
    tray.setToolTip(tip)
  } catch {
    // ignore
  }

  const maxUnits = cachedMenuBarDisplayUnits
  let body = slicePageBodyForMenuBarDisplay(page, barSuffix, maxUnits)

  const publish = (): string => composeReadingTitle(body, barSuffix)

  for (let attempt = 0; attempt < 12; attempt++) {
    const title = publish()
    tray.setTitle(title)
    let shown = ''
    try {
      shown = tray.getTitle() ?? ''
    } catch {
      shown = ''
    }
    if (shown.replace(/\s+/g, '').length > 0) {
      return
    }
    if (body.length <= 2) break
    body = body.slice(0, Math.max(2, body.length - 2))
    body = slicePageBodyForMenuBarDisplay(body, barSuffix, maxUnits)
  }

  console.warn('[WorkThief] tray setTitle empty after shrink; using short fallback', {
    page: meta.pageIndex + 1
  })
  setTrayTitle(truncateForMenuBar(page, MENU_BAR_TITLE_RETRY))
}

export const _internals = {
  PERSIST_DEBOUNCE_MS,
  NEXT_PAGE_DEBOUNCE_MS,
  EMPTY_HINT,
  MENU_BAR_TITLE_MAX,
  MENU_BAR_TITLE_RETRY,
  setTrayTitle,
  setReadingTrayTitle
}

export {
  truncateForMenuBar,
  MENU_BAR_TITLE_MAX,
  MENU_BAR_TITLE_RETRY,
  buildPageSuffix,
  composeReadingTitle,
  resolveEffectiveCharsPerPage
} from './trayTitle'

