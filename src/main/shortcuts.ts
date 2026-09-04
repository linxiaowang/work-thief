import { globalShortcut } from 'electron'
import { getSettings } from './db/settings'
import {
  nextPage,
  prevPage,
  nextChapter,
  prevChapter,
  toggleHidden
} from './menuBar'

/**
 * Global hotkeys for the menu-bar reader.
 *
 * Defaults avoid conflicts with Spotlight, Raycast, Alfred, and common
 * text-editor shortcuts. Users can override in settings.
 */

const DEFAULT_HOTKEYS = {
  nextPage: 'Alt+Cmd+Right',
  prevPage: 'Alt+Cmd+Left',
  nextChapter: 'Alt+Cmd+Down',
  prevChapter: 'Alt+Cmd+Up',
  toggleHidden: 'Ctrl+Alt+Cmd+M'
} as const

interface HotkeyCallbacks {
  nextPage: () => void | Promise<void>
  prevPage: () => void | Promise<void>
  nextChapter: () => void | Promise<void>
  prevChapter: () => void | Promise<void>
  toggleHidden: () => void
}

let lastRegistered: Record<string, string> = {}

/**
 * Register all global shortcuts based on settings. Safe to call
 * repeatedly — unregisters prior bindings first.
 */
export function applyShortcuts(): { ok: boolean; failures: string[] } {
  const failures: string[] = []
  const settings = getSettings()
  // Use settings overrides when present, otherwise defaults.
  const keys = {
    nextPage: (settings as any).hotkeyNextPage ?? DEFAULT_HOTKEYS.nextPage,
    prevPage: (settings as any).hotkeyPrevPage ?? DEFAULT_HOTKEYS.prevPage,
    nextChapter: (settings as any).hotkeyNextChapter ?? DEFAULT_HOTKEYS.nextChapter,
    prevChapter: (settings as any).hotkeyPrevChapter ?? DEFAULT_HOTKEYS.prevChapter,
    toggleHidden: (settings as any).hotkeyToggleHidden ?? DEFAULT_HOTKEYS.toggleHidden
  }

  globalShortcut.unregisterAll()
  lastRegistered = {}

  const cbs: HotkeyCallbacks = {
    nextPage: () => void nextPage(),
    prevPage: () => void prevPage(),
    nextChapter: () => void nextChapter(),
    prevChapter: () => void prevChapter(),
    toggleHidden: () => toggleHidden()
  }

  const tryRegister = (accelerator: string, name: keyof HotkeyCallbacks) => {
    try {
      const ok = globalShortcut.register(accelerator, cbs[name])
      if (!ok) failures.push(`${name}: ${accelerator}`)
      else lastRegistered[name] = accelerator
    } catch (err) {
      failures.push(`${name}: ${(err as Error).message}`)
    }
  }

  tryRegister(keys.nextPage, 'nextPage')
  tryRegister(keys.prevPage, 'prevPage')
  tryRegister(keys.nextChapter, 'nextChapter')
  tryRegister(keys.prevChapter, 'prevChapter')
  tryRegister(keys.toggleHidden, 'toggleHidden')

  return { ok: failures.length === 0, failures }
}

export function unregisterAllShortcuts(): void {
  globalShortcut.unregisterAll()
  lastRegistered = {}
}

export const _internals = { DEFAULT_HOTKEYS }
