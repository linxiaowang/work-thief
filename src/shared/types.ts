/**
 * Shared types for the menu-bar novel reader.
 *
 * This app is now menu-bar-only — no windows, no renderer. Types below
 * describe persisted state and DB rows.
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
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  hotkeyNextPage: 'Alt+Cmd+Right',
  hotkeyPrevPage: 'Alt+Cmd+Left',
  hotkeyNextChapter: 'Alt+Cmd+Down',
  hotkeyPrevChapter: 'Alt+Cmd+Up',
  hotkeyToggleHidden: 'Ctrl+Alt+Cmd+M',
  watchedFolder: null
}
