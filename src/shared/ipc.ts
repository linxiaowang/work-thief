/**
 * Legacy IPC channel names kept for reference / future tooling.
 * The app itself no longer uses renderer IPC — everything runs in main.
 */
export const IPC = {
  BOOKS_LIST: 'books:list',
  BOOKS_IMPORT: 'books:import',
  BOOKS_IMPORT_PATHS: 'books:import-paths',
  BOOKS_DELETE: 'books:delete',
  BOOKS_RENAME: 'books:rename',
  BOOKS_RESOLVE_MISSING: 'books:resolve-missing',
  CHAPTERS_GET: 'chapters:get',
  CHAPTER_CONTENT: 'chapters:content',
  PROGRESS_GET: 'progress:get',
  PROGRESS_UPDATE: 'progress:update',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_RESET: 'settings:reset',
  WATCHED_SET_FOLDER: 'watched:set-folder',
  WATCHED_GET_FOLDER: 'watched:get-folder',
  APP_VERSION: 'app:version',
  OPEN_IN_FINDER: 'app:open-in-finder',
  SHOW_ITEM_IN_FOLDER: 'app:show-item-in-folder'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
