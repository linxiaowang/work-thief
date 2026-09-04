import { getDb } from './client'
import { DEFAULT_APP_SETTINGS, type AppSettings } from '@shared/types'

const SETTINGS_KEY = 'app_settings'

const MIN_CHARS = 20
const MAX_CHARS = 80

function defaultSettings(): AppSettings {
  return { ...DEFAULT_APP_SETTINGS, watchedFolder: null }
}

export function getSettings(): AppSettings {
  const d = getDb()
  const row = d.prepare('SELECT value FROM settings WHERE key = ?').get(SETTINGS_KEY) as
    | { value: string }
    | undefined
  if (!row) return defaultSettings()
  try {
    const parsed = JSON.parse(row.value) as Partial<AppSettings>
    return mergeWithDefaults(parsed)
  } catch {
    return defaultSettings()
  }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const merged: AppSettings = { ...current, ...patch }
  if (typeof patch.charsPerPage === 'number') {
    merged.charsPerPage = clampChars(patch.charsPerPage)
  }
  const d = getDb()
  d.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(SETTINGS_KEY, JSON.stringify(merged))
  return merged
}

export function resetSettings(): AppSettings {
  const fresh = defaultSettings()
  const d = getDb()
  d.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(SETTINGS_KEY, JSON.stringify(fresh))
  return fresh
}

function mergeWithDefaults(parsed: Partial<AppSettings>): AppSettings {
  const d = defaultSettings()
  return {
    hotkeyNextPage: parsed.hotkeyNextPage ?? d.hotkeyNextPage,
    hotkeyPrevPage: parsed.hotkeyPrevPage ?? d.hotkeyPrevPage,
    hotkeyNextChapter: parsed.hotkeyNextChapter ?? d.hotkeyNextChapter,
    hotkeyPrevChapter: parsed.hotkeyPrevChapter ?? d.hotkeyPrevChapter,
    hotkeyToggleHidden: parsed.hotkeyToggleHidden ?? d.hotkeyToggleHidden,
    watchedFolder: parsed.watchedFolder ?? d.watchedFolder,
    charsPerPage: clampChars(parsed.charsPerPage ?? d.charsPerPage)
  }
}

function clampChars(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_APP_SETTINGS.charsPerPage
  return Math.max(MIN_CHARS, Math.min(MAX_CHARS, Math.round(n)))
}
