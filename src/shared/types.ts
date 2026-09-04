/**
 * Shared types for the menu-bar novel reader.
 *
 * Menu-bar only — body text via Tray.setTitle(); navigation is a tray menu.
 */

export interface Book {
  id: number
  title: string
  filePath: string
  fileSize: number
  encoding: string
  chapterCount: number
  totalChars: number
  importedAt: number
  lastOpenedAt: number | null
  coverColor: string
  missing: boolean
}

export interface Chapter {
  id: number
  bookId: number
  index: number
  title: string
  startOffset: number
  charCount: number
}

export interface Progress {
  bookId: number
  /** Kept for optional chapter jump UI; book-wide paging uses chapterProgress. */
  chapterIndex: number
  /** 0..1 fraction through the whole book text (used to restore page). */
  chapterProgress: number
  lastReadAt: number
}

/** Forced TXT decode; auto uses heuristic detection. */
export type PreferredEncoding = 'auto' | 'utf-8' | 'gbk'

export interface AppSettings {
  hotkeyNextPage: string
  hotkeyPrevPage: string
  hotkeyNextChapter: string
  hotkeyPrevChapter: string
  hotkeyToggleHidden: string
  watchedFolder: string | null
  /** Characters shown per menu-bar "page" (Thief page_size). */
  charsPerPage: number
  /** Boss Key disguise text (Thief moyu_text). Empty → show current HH:mm. */
  moyuText: string
  /** Append " N/total" after page body when true. */
  showPageNumber: boolean
  /** How to decode TXT files. */
  preferredEncoding: PreferredEncoding
}

/** Thief-style defaults. Chapter jump stays in the tray menu only. */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  hotkeyNextPage: 'CommandOrControl+Alt+.',
  hotkeyPrevPage: 'CommandOrControl+Alt+,',
  hotkeyNextChapter: '',
  hotkeyPrevChapter: '',
  hotkeyToggleHidden: 'CommandOrControl+Alt+M',
  watchedFolder: null,
  charsPerPage: 40,
  moyuText: 'Hello',
  showPageNumber: true,
  preferredEncoding: 'auto'
}

/** Old defaults that should auto-migrate to the Thief-style set. */
export const LEGACY_HOTKEY_DEFAULTS = {
  hotkeyNextPage: 'Alt+Cmd+Right',
  hotkeyPrevPage: 'Alt+Cmd+Left',
  hotkeyNextChapter: 'Alt+Cmd+Down',
  hotkeyPrevChapter: 'Alt+Cmd+Up',
  hotkeyToggleHidden: 'Ctrl+Alt+Cmd+M'
} as const

export interface ImportResult {
  imported: number
  failed: Array<{ path: string; reason: string }>
}

