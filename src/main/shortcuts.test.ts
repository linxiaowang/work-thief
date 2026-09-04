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
  app: {
    isReady: () => true,
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
    charsPerPage: 40,
    moyuText: 'Hello',
    showPageNumber: true,
    preferredEncoding: 'auto'
  })
}))

vi.mock('./menuBar', () => ({
  nextPage: vi.fn(),
  prevPage: vi.fn(),
  toggleHidden: vi.fn(),
  getTray: () => ({ setTitle: vi.fn() })
}))

const { applyShortcuts, formatShortcutCopy, _internals } = await import('./shortcuts')

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

  it('notifies and returns failures when register fails', () => {
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
    expect(copy).toMatch(/[⌘⌃].*⌥/)
  })
})
