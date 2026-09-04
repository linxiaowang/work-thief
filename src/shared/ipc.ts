/**
 * IPC channel names. Centralized to avoid typos and enable searching.
 */
export const IPC = {
  // Book operations
  BOOKS_LIST: 'books:list',
  BOOKS_IMPORT: 'books:import',
  BOOKS_IMPORT_PATHS: 'books:import-paths',
  BOOKS_DELETE: 'books:delete',
  BOOKS_RENAME: 'books:rename',
  BOOKS_RESOLVE_MISSING: 'books:resolve-missing',

  // Chapter operations
  CHAPTERS_GET: 'chapters:get',
  CHAPTER_CONTENT: 'chapters:content',

  // Progress
  PROGRESS_GET: 'progress:get',
  PROGRESS_UPDATE: 'progress:update',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_RESET: 'settings:reset',

  // Window controls
  WINDOW_OPEN_READER: 'window:open-reader',
  WINDOW_HIDE_READER: 'window:hide-reader',
  WINDOW_HIDE_ALL: 'window:hide-all',

  // Watched folder
  WATCHED_SET_FOLDER: 'watched:set-folder',
  WATCHED_GET_FOLDER: 'watched:get-folder',

  // Search
  SEARCH_IN_CHAPTER: 'search:in-chapter',

  // Misc
  APP_VERSION: 'app:version',
  OPEN_IN_FINDER: 'app:open-in-finder',
  SHOW_ITEM_IN_FOLDER: 'app:show-item-in-folder'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
