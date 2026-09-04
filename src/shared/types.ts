/**
 * Shared types for the menu-bar novel reader.
 *
 * Menu-bar only — no Dock, no reading window, no Popover. Body text
 * is rendered via Tray.setTitle(); navigation is a right-click menu.
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
  chapterIndex: number
  /** 0..1 fraction through the current chapter (used to restore page). */
  chapterProgress: number
  lastReadAt: number
}

export interface AppSettings {
  hotkeyNextPage: string
  hotkeyPrevPage: string
  hotkeyNextChapter: string
  hotkeyPrevChapter: string
  hotkeyToggleHidden: string
  watchedFolder: string | null
  /** Characters shown per menu-bar "page". */
  charsPerPage: number
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  hotkeyNextPage: 'Alt+Cmd+Right',
  hotkeyPrevPage: 'Alt+Cmd+Left',
  hotkeyNextChapter: 'Alt+Cmd+Down',
  hotkeyPrevChapter: 'Alt+Cmd+Up',
  hotkeyToggleHidden: 'Ctrl+Alt+Cmd+M',
  watchedFolder: null,
  charsPerPage: 40
}

export interface ImportResult {
  imported: number
  failed: Array<{ path: string; reason: string }>
}
