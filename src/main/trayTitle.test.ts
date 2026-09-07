import { describe, expect, it } from 'vitest'
import { truncateForMenuBar, MENU_BAR_TITLE_MAX, MENU_BAR_TITLE_RETRY } from './trayTitle'

describe('truncateForMenuBar', () => {
  it('hard-caps at 28 chars by default', () => {
    expect(MENU_BAR_TITLE_MAX).toBe(28)
    const long = '甲'.repeat(40) + '·3/120'
    const out = truncateForMenuBar(long)
    expect(out.length).toBe(28)
    expect(out.endsWith('…')).toBe(true)
  })

  it('keeps short titles including page suffix', () => {
    expect(truncateForMenuBar('短正文·3/120')).toBe('短正文·3/120')
  })

  it('supports 16-char retry length', () => {
    expect(MENU_BAR_TITLE_RETRY).toBe(16)
    const out = truncateForMenuBar('甲'.repeat(40), 16)
    expect(out.length).toBe(16)
  })
})
