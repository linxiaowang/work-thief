import { BrowserWindow, globalShortcut, Notification, app } from 'electron'
import { DEFAULT_APP_SETTINGS, type AppSettings } from '@shared/types'
import { getSettings, updateSettings } from './db/settings'
import { getTray, nextPage, prevPage, render, toggleHidden } from './menuBar'

/**
 * Global hotkeys for the menu-bar reader (Thief-style defaults).
 *
 * Page + Boss only — chapter jump stays in the tray menu.
 * Tray「快捷键」submenu rebinds via a short-lived capture window.
 */

export type HotkeyBinding = 'prevPage' | 'nextPage' | 'toggleHidden'

const DEFAULT_HOTKEYS = {
  nextPage: DEFAULT_APP_SETTINGS.hotkeyNextPage,
  prevPage: DEFAULT_APP_SETTINGS.hotkeyPrevPage,
  toggleHidden: DEFAULT_APP_SETTINGS.hotkeyToggleHidden
} as const

const SETTING_KEY: Record<HotkeyBinding, keyof AppSettings> = {
  prevPage: 'hotkeyPrevPage',
  nextPage: 'hotkeyNextPage',
  toggleHidden: 'hotkeyToggleHidden'
}

const BINDING_LABEL: Record<HotkeyBinding, string> = {
  prevPage: '上一页',
  nextPage: '下一页',
  toggleHidden: 'Boss'
}

const ACCESSIBILITY_HINT = '开 系统设置→隐私→辅助功能'
const WAITING_HINT = '等待按键…'

interface HotkeyCallbacks {
  nextPage: () => void
  prevPage: () => void
  toggleHidden: () => void
}

let lastRegistered: Record<string, string> = {}
let recordingBinding: HotkeyBinding | null = null
let captureWin: BrowserWindow | null = null
let onHotkeysChanged: (() => void) | null = null

export function setHotkeysChangedHandler(fn: () => void): void {
  onHotkeysChanged = fn
}

/**
 * Register page + Boss global shortcuts based on settings. Safe to call
 * repeatedly — unregisters prior bindings first.
 * Does NOT register chapter hotkeys (menu-only).
 */
export function applyShortcuts(): { ok: boolean; failures: string[] } {
  const failures: string[] = []
  const settings = getSettings()
  const keys = resolveHotkeys(settings)

  globalShortcut.unregisterAll()
  lastRegistered = {}

  const cbs: HotkeyCallbacks = {
    nextPage: () => {
      void nextPage()
    },
    prevPage: () => {
      void prevPage()
    },
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

function resolveHotkeys(settings: AppSettings): Record<HotkeyBinding, string> {
  return {
    nextPage: settings.hotkeyNextPage || DEFAULT_HOTKEYS.nextPage,
    prevPage: settings.hotkeyPrevPage || DEFAULT_HOTKEYS.prevPage,
    toggleHidden: settings.hotkeyToggleHidden || DEFAULT_HOTKEYS.toggleHidden
  }
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

function notifyTip(title: string, body: string): void {
  if (!Notification.isSupported()) {
    console.warn(`[WorkThief] ${title}: ${body}`)
    return
  }
  try {
    new Notification({ title, body }).show()
  } catch (err) {
    console.error('[WorkThief] tip Notification failed:', err)
  }
}

export function unregisterAllShortcuts(): void {
  globalShortcut.unregisterAll()
  lastRegistered = {}
}

export function getRegisteredShortcuts(): Record<string, string> {
  return { ...lastRegistered }
}

/** Current accelerators for menu labels (falls back to defaults). */
export function getHotkeyAccelerators(settings?: AppSettings): Record<HotkeyBinding, string> {
  return resolveHotkeys(settings ?? getSettings())
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

export function friendlyAccel(accel: string): string {
  return accel
    .replace(/CommandOrControl/gi, process.platform === 'darwin' ? '⌘' : 'Ctrl')
    .replace(/Command/gi, '⌘')
    .replace(/Control|Ctrl/gi, '⌃')
    .replace(/Option|Alt/gi, '⌥')
    .replace(/Shift/gi, '⇧')
    .replace(/\+/g, '')
}

/** Canonical form for conflict checks. */
export function normalizeAccelerator(accel: string): string {
  const parts = accel
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return ''

  const mods: string[] = []
  let key = ''
  for (const p of parts) {
    const lower = p.toLowerCase()
    if (lower === 'commandorcontrol' || lower === 'cmdorctrl') {
      mods.push('CommandOrControl')
    } else if (lower === 'command' || lower === 'cmd') {
      mods.push('Command')
    } else if (lower === 'control' || lower === 'ctrl') {
      mods.push('Control')
    } else if (lower === 'alt' || lower === 'option') {
      mods.push('Alt')
    } else if (lower === 'shift') {
      mods.push('Shift')
    } else if (lower === 'super' || lower === 'meta') {
      mods.push('Super')
    } else {
      key = p.length === 1 ? p.toUpperCase() : p
    }
  }

  const order = ['CommandOrControl', 'Command', 'Control', 'Alt', 'Shift', 'Super']
  mods.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return [...mods, key].filter(Boolean).join('+')
}

/**
 * Convert Electron before-input-event payload to an accelerator string.
 * Returns null for pure modifiers / incomplete combos.
 * Returns 'Escape' for Esc (cancel sentinel).
 */
export function inputToAccelerator(input: {
  type: string
  key: string
  code: string
  control: boolean
  meta: boolean
  alt: boolean
  shift: boolean
}): string | null {
  if (input.type !== 'keyDown') return null

  const rawKey = input.key
  if (
    rawKey === 'Meta' ||
    rawKey === 'Control' ||
    rawKey === 'Alt' ||
    rawKey === 'Shift' ||
    rawKey === 'MetaLeft' ||
    rawKey === 'MetaRight' ||
    rawKey === 'ControlLeft' ||
    rawKey === 'ControlRight' ||
    rawKey === 'AltLeft' ||
    rawKey === 'AltRight' ||
    rawKey === 'ShiftLeft' ||
    rawKey === 'ShiftRight'
  ) {
    return null
  }

  if (rawKey === 'Escape' || input.code === 'Escape') return 'Escape'

  const parts: string[] = []
  if (process.platform === 'darwin') {
    if (input.meta) parts.push('CommandOrControl')
    else if (input.control) parts.push('Control')
  } else {
    if (input.control || input.meta) parts.push('CommandOrControl')
  }
  if (input.alt) parts.push('Alt')
  if (input.shift) parts.push('Shift')

  const keyPart = normalizeInputKey(input)
  if (!keyPart) return null
  // Global hotkeys need at least one modifier so we don't steal plain typing.
  if (parts.length === 0) return null
  parts.push(keyPart)
  return parts.join('+')
}

function normalizeInputKey(input: { key: string; code: string }): string | null {
  const { key, code } = input
  if (key === ' ') return 'Space'
  if (key === 'ArrowLeft' || code === 'ArrowLeft') return 'Left'
  if (key === 'ArrowRight' || code === 'ArrowRight') return 'Right'
  if (key === 'ArrowUp' || code === 'ArrowUp') return 'Up'
  if (key === 'ArrowDown' || code === 'ArrowDown') return 'Down'
  if (key === 'Enter' || code === 'Enter' || code === 'NumpadEnter') return 'Enter'
  if (key === 'Tab') return 'Tab'
  if (key === 'Backspace') return 'Backspace'
  if (key === 'Delete') return 'Delete'
  if (key === 'Home') return 'Home'
  if (key === 'End') return 'End'
  if (key === 'PageUp') return 'PageUp'
  if (key === 'PageDown') return 'PageDown'
  if (key === 'Insert') return 'Insert'

  const f = /^F([1-9]|1[0-9]|2[0-4])$/i.exec(code) || /^F([1-9]|1[0-9]|2[0-4])$/i.exec(key)
  if (f) return `F${f[1]}`

  if (/^Key[A-Z]$/i.test(code)) return code.slice(3).toUpperCase()
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^Numpad([0-9])$/.test(code)) return code.replace('Numpad', 'num')

  // Punctuation / symbols — prefer physical code when shifted glyphs differ.
  const codeMap: Record<string, string> = {
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    IntlBackslash: '\\'
  }
  if (codeMap[code]) return codeMap[code]

  if (key.length === 1) {
    if (/[a-zA-Z]/.test(key)) return key.toUpperCase()
    return key
  }
  return null
}

/** Whether accelerator collides with another of the three bindings. */
export function findHotkeyConflict(
  binding: HotkeyBinding,
  accelerator: string,
  current?: Record<HotkeyBinding, string>
): HotkeyBinding | null {
  const keys = current ?? getHotkeyAccelerators()
  const target = normalizeAccelerator(accelerator)
  if (!target) return null
  for (const name of Object.keys(keys) as HotkeyBinding[]) {
    if (name === binding) continue
    if (normalizeAccelerator(keys[name]) === target) return name
  }
  return null
}

export function isRecordingHotkey(): boolean {
  return recordingBinding != null
}

/**
 * Begin recording a new accelerator for `binding`.
 * Unregisters globals so the combo can be captured; Esc cancels.
 */
export function startHotkeyRecording(binding: HotkeyBinding): void {
  if (recordingBinding) {
    cancelHotkeyRecording()
  }
  recordingBinding = binding
  unregisterAllShortcuts()
  showWaitingHint()
  openCaptureWindow()
}

export function cancelHotkeyRecording(): void {
  if (!recordingBinding && !captureWin) return
  finishRecording(null)
}

/** Restore Thief-style defaults for the three page/Boss bindings. */
export function resetHotkeysToDefaults(): { ok: boolean; failures: string[] } {
  if (recordingBinding) cancelHotkeyRecording()
  updateSettings({
    hotkeyNextPage: DEFAULT_HOTKEYS.nextPage,
    hotkeyPrevPage: DEFAULT_HOTKEYS.prevPage,
    hotkeyToggleHidden: DEFAULT_HOTKEYS.toggleHidden
  })
  const result = applyShortcuts()
  onHotkeysChanged?.()
  notifyTip('快捷键已恢复默认', formatShortcutCopy())
  return result
}

function showWaitingHint(): void {
  const tray = getTray()
  if (!tray) return
  try {
    tray.setTitle(WAITING_HINT)
    tray.setToolTip(WAITING_HINT)
  } catch {
    // ignore
  }
}

function openCaptureWindow(): void {
  closeCaptureWindow()
  const win = new BrowserWindow({
    width: 1,
    height: 1,
    x: 0,
    y: 0,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  captureWin = win

  void win.loadURL('data:text/html,<!doctype html><title>hotkey</title>')

  win.webContents.on('before-input-event', (event, input) => {
    if (!recordingBinding) return
    const accel = inputToAccelerator(input)
    if (accel == null) return
    event.preventDefault()
    if (accel === 'Escape') {
      finishRecording(null)
      return
    }
    void commitRecordedAccelerator(recordingBinding, accel)
  })

  win.once('ready-to-show', () => {
    try {
      if (process.platform === 'darwin') {
        app.focus({ steal: true })
      }
    } catch {
      // ignore
    }
    win.setOpacity(0)
    win.show()
    win.focus()
  })

  win.on('blur', () => {
    // Keep trying to hold focus briefly while recording; user Esc still cancels.
    if (!recordingBinding || win.isDestroyed()) return
    setTimeout(() => {
      if (recordingBinding && captureWin === win && !win.isDestroyed()) {
        try {
          win.focus()
        } catch {
          // ignore
        }
      }
    }, 50)
  })

  win.on('closed', () => {
    if (captureWin === win) captureWin = null
    if (recordingBinding) {
      // Window closed externally → cancel
      finishRecording(null)
    }
  })
}

function closeCaptureWindow(): void {
  const win = captureWin
  captureWin = null
  if (win && !win.isDestroyed()) {
    try {
      win.removeAllListeners('blur')
      win.removeAllListeners('closed')
      win.close()
    } catch {
      // ignore
    }
  }
}

async function commitRecordedAccelerator(
  binding: HotkeyBinding,
  accelerator: string
): Promise<void> {
  const conflict = findHotkeyConflict(binding, accelerator)
  if (conflict) {
    notifyTip(
      '快捷键冲突',
      `「${friendlyAccel(accelerator)}」已被「${BINDING_LABEL[conflict]}」使用，请换一组。`
    )
    // Stay in recording mode so the user can try again.
    showWaitingHint()
    if (captureWin && !captureWin.isDestroyed()) {
      try {
        captureWin.focus()
      } catch {
        // ignore
      }
    }
    return
  }

  const settings = getSettings()
  const settingKey = SETTING_KEY[binding]
  const previous = settings[settingKey] as string
  updateSettings({ [settingKey]: accelerator } as Partial<AppSettings>)

  // Probe-register: apply all; if this binding failed, revert.
  const result = applyShortcuts()
  const failedThis = result.failures.some((f) => f.startsWith(`${binding}:`))
  if (failedThis) {
    updateSettings({ [settingKey]: previous } as Partial<AppSettings>)
    applyShortcuts()
    notifyTip(
      '快捷键无法注册',
      `「${friendlyAccel(accelerator)}」注册失败（可能与系统或其他应用冲突）。`
    )
    showWaitingHint()
    if (captureWin && !captureWin.isDestroyed()) {
      try {
        captureWin.focus()
      } catch {
        // ignore
      }
    }
    return
  }

  finishRecording(accelerator)
}

function finishRecording(_committed: string | null): void {
  recordingBinding = null
  closeCaptureWindow()
  // Re-apply in case cancel left shortcuts unregistered.
  applyShortcuts()
  try {
    render()
  } catch {
    // ignore
  }
  onHotkeysChanged?.()
}

export const _internals = {
  DEFAULT_HOTKEYS,
  ACCESSIBILITY_HINT,
  WAITING_HINT,
  SETTING_KEY,
  BINDING_LABEL
}
