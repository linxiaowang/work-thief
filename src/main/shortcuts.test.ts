import { describe, expect, it, vi, beforeEach } from 'vitest'

const register = vi.fn<(accelerator: string, cb: () => void) => boolean>(() => true)
const unregisterAll = vi.fn()
const notificationShow = vi.fn()

vi.mock('electron', () => ({
  globalShortcut: {
    register: (accelerator: string, cb: () => void) => register(accelerator, cb),
    unregisterAll: () => unregisterAll()
  },
  Notification: Object.assign(
    class {
      show = notificationShow
    },
    { isSupported: () => true }
  ),
  BrowserWindow: class {
    webContents = { on: vi.fn() }
    once = vi.fn()
    on = vi.fn()
    show = vi.fn()
    focus = vi.fn()
    close = vi.fn()
    setOpacity = vi.fn()
    isDestroyed = () => false
    removeAllListeners = vi.fn()
    loadURL = vi.fn(async () => undefined)
  },
  app: {
    isReady: () => true,
    focus: vi.fn(),
    getPath: () => process.cwd() + '/.test-userdata'
  }
}))

vi.mock('./db/settings', () => ({
  getSettings: () => ({
    hotkeyNextPage: 'CommandOrControl+Alt+.',
    hotkeyPrevPage: 'CommandOrControl+Alt+,',
    hotkeyNextChapter: '',
    hotkeyPrevChapter: '',
    hotkeyToggleHidden: 'CommandOrControl+Alt+M',
    watchedFolder: null,
    charsPerPage: 20,
    moyuText: '工作中',
    showPageNumber: false,
    preferredEncoding: 'auto'
  }),
  updateSettings: vi.fn((patch: Record<string, unknown>) => ({
    hotkeyNextPage: 'CommandOrControl+Alt+.',
    hotkeyPrevPage: 'CommandOrControl+Alt+,',
    hotkeyNextChapter: '',
    hotkeyPrevChapter: '',
    hotkeyToggleHidden: 'CommandOrControl+Alt+M',
    watchedFolder: null,
    charsPerPage: 20,
    moyuText: '工作中',
    showPageNumber: false,
    preferredEncoding: 'auto',
    ...patch
  }))
}))

vi.mock('./menuBar', () => ({
  nextPage: vi.fn(),
  prevPage: vi.fn(),
  toggleHidden: vi.fn(),
  getTray: () => null,
  render: vi.fn()
}))

const {
  applyShortcuts,
  formatShortcutCopy,
  inputToAccelerator,
  normalizeAccelerator,
  findHotkeyConflict,
  friendlyAccel,
  _internals
} = await import('./shortcuts')

describe('shortcuts', () => {
  beforeEach(() => {
    register.mockClear()
    register.mockReturnValue(true)
    unregisterAll.mockClear()
    notificationShow.mockClear()
  })

  it('uses Thief-style default accelerators', () => {
    expect(_internals.DEFAULT_HOTKEYS.nextPage).toBe('CommandOrControl+Alt+.')
    expect(_internals.DEFAULT_HOTKEYS.prevPage).toBe('CommandOrControl+Alt+,')
    expect(_internals.DEFAULT_HOTKEYS.toggleHidden).toBe('CommandOrControl+Alt+M')
  })

  it('registers page + Boss only (no chapter hotkeys)', () => {
    const result = applyShortcuts()
    expect(result.ok).toBe(true)
    expect(unregisterAll).toHaveBeenCalled()
    const accelerators = register.mock.calls.map((c) => c[0])
    expect(accelerators).toEqual([
      'CommandOrControl+Alt+.',
      'CommandOrControl+Alt+,',
      'CommandOrControl+Alt+M'
    ])
  })

  it('notifies and returns failures when register fails (no tray overwrite)', () => {
    register.mockReturnValue(false)
    const result = applyShortcuts()
    expect(result.ok).toBe(false)
    expect(result.failures.length).toBe(3)
    expect(notificationShow).toHaveBeenCalled()
  })

  it('formatShortcutCopy shows friendly labels', () => {
    const copy = formatShortcutCopy({
      hotkeyNextPage: 'CommandOrControl+Alt+.',
      hotkeyPrevPage: 'CommandOrControl+Alt+,',
      hotkeyToggleHidden: 'CommandOrControl+Alt+M'
    })
    expect(copy).toContain('下一页')
    expect(copy).toContain('上一页')
    expect(copy).toContain('Boss')
    expect(copy).toMatch(/⌥/)
    expect(copy).toContain('M')
  })

  it('friendlyAccel maps modifiers', () => {
    expect(friendlyAccel('CommandOrControl+Alt+M')).toMatch(/⌥/)
    expect(friendlyAccel('CommandOrControl+Alt+M')).toContain('M')
  })

  it('normalizeAccelerator canonicalizes aliases', () => {
    expect(normalizeAccelerator('CmdOrCtrl+Option+m')).toBe('CommandOrControl+Alt+M')
    expect(normalizeAccelerator('Control+Alt+,')).toBe('Control+Alt+,')
  })

  it('findHotkeyConflict detects reuse among the three bindings', () => {
    const current = {
      prevPage: 'CommandOrControl+Alt+,',
      nextPage: 'CommandOrControl+Alt+.',
      toggleHidden: 'CommandOrControl+Alt+M'
    }
    expect(findHotkeyConflict('prevPage', 'CommandOrControl+Alt+.', current)).toBe('nextPage')
    expect(findHotkeyConflict('prevPage', 'CommandOrControl+Alt+,', current)).toBeNull()
    expect(findHotkeyConflict('toggleHidden', 'CmdOrCtrl+Alt+.', current)).toBe('nextPage')
  })

  it('inputToAccelerator builds combos and ignores bare keys', () => {
    expect(
      inputToAccelerator({
        type: 'keyDown',
        key: 'm',
        code: 'KeyM',
        control: false,
        meta: true,
        alt: true,
        shift: false
      })
    ).toBe('CommandOrControl+Alt+M')

    expect(
      inputToAccelerator({
        type: 'keyDown',
        key: ',',
        code: 'Comma',
        control: false,
        meta: true,
        alt: true,
        shift: false
      })
    ).toBe('CommandOrControl+Alt+,')

    expect(
      inputToAccelerator({
        type: 'keyDown',
        key: 'Escape',
        code: 'Escape',
        control: false,
        meta: false,
        alt: false,
        shift: false
      })
    ).toBe('Escape')

    expect(
      inputToAccelerator({
        type: 'keyDown',
        key: 'a',
        code: 'KeyA',
        control: false,
        meta: false,
        alt: false,
        shift: false
      })
    ).toBeNull()

    expect(
      inputToAccelerator({
        type: 'keyDown',
        key: 'Meta',
        code: 'MetaLeft',
        control: false,
        meta: true,
        alt: false,
        shift: false
      })
    ).toBeNull()
  })
})
