import chokidar, { FSWatcher } from 'chokidar'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { getSettings, updateSettings } from './db/settings'
import { importPaths } from './ipc'

let watcher: FSWatcher | null = null
let watchedPath: string | null = null

export const DEFAULT_WATCHED_FOLDER_NAME = 'WorkThief'

/**
 * Default watched folder: ~/Documents/WorkThief/
 * Created automatically on first launch.
 */
export function getDefaultWatchedFolder(): string {
  return join(homedir(), 'Documents', DEFAULT_WATCHED_FOLDER_NAME)
}

/**
 * Make sure a watched folder exists. If settings don't have one yet,
 * set it to ~/Documents/WorkThief/ and create the directory.
 */
export async function ensureWatchedFolder(): Promise<string> {
  const settings = getSettings()
  let folder = settings.watchedFolder
  if (!folder) {
    folder = getDefaultWatchedFolder()
    updateSettings({ watchedFolder: folder })
  }
  try {
    mkdirSync(folder, { recursive: true })
  } catch {
    /* ignore */
  }
  watchedPath = folder
  return folder
}

export function getWatchedFolder(): string | null {
  return watchedPath
}

export async function setWatchedFolder(folder: string | null): Promise<void> {
  if (watcher) {
    await watcher.close()
    watcher = null
  }
  watchedPath = folder
  updateSettings({ watchedFolder: folder })

  if (!folder) return

  try {
    mkdirSync(folder, { recursive: true })
  } catch {
    /* ignore */
  }

  watcher = chokidar.watch(folder, {
    depth: 4,
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 600, pollInterval: 100 }
  })

  const onChange = async (path: string) => {
    if (!path.toLowerCase().endsWith('.txt')) return
    try {
      await importPaths([path])
    } catch (err) {
      console.error('[watcher] import failed:', err)
    }
  }

  watcher.on('add', onChange)
  watcher.on('change', onChange)
}

/** Called at app startup to resume watching the previously-saved folder. */
export async function resumeWatching(): Promise<void> {
  const settings = getSettings()
  const folder = settings.watchedFolder ?? getDefaultWatchedFolder()
  await setWatchedFolder(folder)
}
