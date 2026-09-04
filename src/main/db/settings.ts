import { getDb } from './client'
import { DEFAULT_APP_SETTINGS, type AppSettings } from '@shared/types'

const SETTINGS_KEY = 'app_settings'

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
    watchedFolder: parsed.watchedFolder ?? d.watchedFolder
  }
}
