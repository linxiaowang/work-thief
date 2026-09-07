import { globalShortcut, Notification } from 'electron'
import { getSettings } from './db/settings'
import { nextPage, prevPage, toggleHidden } from './menuBar'

/**
 * Global hotkeys for the menu-bar reader (Thief-style defaults).
 *
 * Page + Boss only — chapter jump stays in the tray menu.
 */

const DEFAULT_HOTKEYS = {
  nextPage: 'CommandOrControl+Alt+.',
  prevPage: 'CommandOrControl+Alt+,',
  toggleHidden: 'CommandOrControl+Alt+M'
} as const

const ACCESSIBILITY_HINT = '开 系统设置→隐私→辅助功能'

interface HotkeyCallbacks {
  nextPage: () => void
  prevPage: () => void
  toggleHidden: () => void
}

let lastRegistered: Record<string, string> = {}

/**
 * Register page + Boss global shortcuts based on settings. Safe to call
 * repeatedly — unregisters prior bindings first.
 * Does NOT register chapter hotkeys (menu-only).
 */
export function applyShortcuts(): { ok: boolean; failures: string[] } {
  const failures: string[] = []
  const settings = getSettings()
  const keys = {
    nextPage: settings.hotkeyNextPage || DEFAULT_HOTKEYS.nextPage,
    prevPage: settings.hotkeyPrevPage || DEFAULT_HOTKEYS.prevPage,
    toggleHidden: settings.hotkeyToggleHidden || DEFAULT_HOTKEYS.toggleHidden
  }

  globalShortcut.unregisterAll()
  lastRegistered = {}

  const cbs: HotkeyCallbacks = {
    nextPage: () => nextPage(),
    prevPage: () => prevPage(),
    toggleHidden: () => toggleHidden()
  }

  const tryRegister = (accelerator: string, name: keyof HotkeyCallbacks) => {
    if (!accelerator.trim()) return
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
  tryRegister(keys.toggleHidden, 'toggleHidden')

  const ok = failures.length === 0
  if (!ok) {
    notifyShortcutFailure(failures)
  }
  return { ok, failures }
}

function notifyShortcutFailure(failures: string[]): void {
  // Notification only — never overwrite novel tray title with the accessibility hint.
  if (!Notification.isSupported()) {
    console.warn('[WorkThief] shortcut register failed:', failures.join('; '))
    return
  }
  try {
    const n = new Notification({
      title: 'WorkThief 热键注册失败',
      body: `请打开「系统设置 → 隐私与安全性 → 辅助功能」允许本应用，然后重启。\n${failures.join('\n')}`
    })
    n.show()
  } catch (err) {
    console.error('[WorkThief] shortcut failure Notification failed:', err)
  }
}

export function unregisterAllShortcuts(): void {
  globalShortcut.unregisterAll()
  lastRegistered = {}
}

export function getRegisteredShortcuts(): Record<string, string> {
  return { ...lastRegistered }
}

/** Human-readable copy of current page/Boss shortcuts for Settings UI. */
export function formatShortcutCopy(settings?: {
  hotkeyNextPage: string
  hotkeyPrevPage: string
  hotkeyToggleHidden: string
}): string {
  const s = settings ?? getSettings()
  const next = s.hotkeyNextPage || DEFAULT_HOTKEYS.nextPage
  const prev = s.hotkeyPrevPage || DEFAULT_HOTKEYS.prevPage
  const boss = s.hotkeyToggleHidden || DEFAULT_HOTKEYS.toggleHidden
  return `下一页 ${friendlyAccel(next)}　上一页 ${friendlyAccel(prev)}　Boss ${friendlyAccel(boss)}`
}

function friendlyAccel(accel: string): string {
  return accel
    .replace(/CommandOrControl/gi, process.platform === 'darwin' ? '⌘' : 'Ctrl')
    .replace(/Command/gi, '⌘')
    .replace(/Control|Ctrl/gi, '⌃')
    .replace(/Option|Alt/gi, '⌥')
    .replace(/Shift/gi, '⇧')
    .replace(/\+/g, '')
}

export const _internals = { DEFAULT_HOTKEYS, ACCESSIBILITY_HINT }
