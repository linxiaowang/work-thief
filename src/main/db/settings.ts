import { getDb } from './client'
import {
  DEFAULT_APP_SETTINGS,
  LEGACY_HOTKEY_DEFAULTS,
  type AppSettings,
  type PreferredEncoding
} from '@shared/types'

const SETTINGS_KEY = 'app_settings'
/** One-shot: force showPageNumber off for existing installs; then user preference sticks. */
const MIGRATED_PAGE_NUMBER_OFF_KEY = 'migrated_page_number_off'

const MIN_CHARS = 20
const MAX_CHARS = 80

function defaultSettings(): AppSettings {
  return { ...DEFAULT_APP_SETTINGS, watchedFolder: null }
}

function upsertSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value)
}

function hasMigrationFlag(key: string): boolean {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return Boolean(row)
}

/**
 * Existing users may still have showPageNumber: true persisted.
 * One-shot migrate to false on load; flag prevents re-forcing if they turn it back on.
 */
function migratePageNumberOff(settings: AppSettings): AppSettings {
  if (hasMigrationFlag(MIGRATED_PAGE_NUMBER_OFF_KEY)) return settings
  upsertSetting(MIGRATED_PAGE_NUMBER_OFF_KEY, '1')
  if (!settings.showPageNumber) return settings
  const next: AppSettings = { ...settings, showPageNumber: false }
  upsertSetting(SETTINGS_KEY, JSON.stringify(next))
  return next
}

/** Read settings; on DB/native failure return defaults (never throw). */
export function getSettingsOrDefault(): AppSettings {
  try {
    return getSettings()
  } catch (err) {
    console.error('[WorkThief] getSettings failed — using defaults', err)
    return defaultSettings()
  }
}

export function getSettings(): AppSettings {
  const d = getDb()
  const row = d.prepare('SELECT value FROM settings WHERE key = ?').get(SETTINGS_KEY) as
    | { value: string }
    | undefined
  let settings: AppSettings
  if (!row) {
    settings = defaultSettings()
  } else {
    try {
      const parsed = JSON.parse(row.value) as Partial<AppSettings>
      settings = mergeWithDefaults(parsed)
    } catch {
      settings = defaultSettings()
    }
  }
  return migratePageNumberOff(settings)
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const merged: AppSettings = { ...current, ...patch }
  if (typeof patch.charsPerPage === 'number') {
    merged.charsPerPage = clampChars(patch.charsPerPage)
  }
  if (patch.preferredEncoding !== undefined) {
    merged.preferredEncoding = normalizeEncoding(patch.preferredEncoding)
  }
  if (patch.moyuText !== undefined) {
    merged.moyuText = String(patch.moyuText)
  }
  if (patch.showPageNumber !== undefined) {
    merged.showPageNumber = Boolean(patch.showPageNumber)
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

function migrateHotkey(
  stored: string | undefined,
  nextDefault: string,
  legacyDefault: string
): string {
  if (stored == null || stored === '' || stored === legacyDefault) return nextDefault
  return stored
}

function mergeWithDefaults(parsed: Partial<AppSettings>): AppSettings {
  const d = defaultSettings()
  return {
    hotkeyNextPage: migrateHotkey(
      parsed.hotkeyNextPage,
      d.hotkeyNextPage,
      LEGACY_HOTKEY_DEFAULTS.hotkeyNextPage
    ),
    hotkeyPrevPage: migrateHotkey(
      parsed.hotkeyPrevPage,
      d.hotkeyPrevPage,
      LEGACY_HOTKEY_DEFAULTS.hotkeyPrevPage
    ),
    // Chapter hotkeys are menu-only; empty / legacy → stay empty.
    hotkeyNextChapter:
      parsed.hotkeyNextChapter === LEGACY_HOTKEY_DEFAULTS.hotkeyNextChapter
        ? ''
        : (parsed.hotkeyNextChapter ?? d.hotkeyNextChapter),
    hotkeyPrevChapter:
      parsed.hotkeyPrevChapter === LEGACY_HOTKEY_DEFAULTS.hotkeyPrevChapter
        ? ''
        : (parsed.hotkeyPrevChapter ?? d.hotkeyPrevChapter),
    hotkeyToggleHidden: migrateHotkey(
      parsed.hotkeyToggleHidden,
      d.hotkeyToggleHidden,
      LEGACY_HOTKEY_DEFAULTS.hotkeyToggleHidden
    ),
    watchedFolder: parsed.watchedFolder ?? d.watchedFolder,
    charsPerPage: clampChars(parsed.charsPerPage ?? d.charsPerPage),
    moyuText: parsed.moyuText ?? d.moyuText,
    showPageNumber: parsed.showPageNumber ?? d.showPageNumber,
    preferredEncoding: normalizeEncoding(parsed.preferredEncoding ?? d.preferredEncoding)
  }
}

function clampChars(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_APP_SETTINGS.charsPerPage
  return Math.max(MIN_CHARS, Math.min(MAX_CHARS, Math.round(n)))
}

function normalizeEncoding(v: string): PreferredEncoding {
  if (v === 'utf-8' || v === 'gbk' || v === 'auto') return v
  return 'auto'
}
