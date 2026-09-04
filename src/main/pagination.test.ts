import { describe, expect, it } from 'vitest'
import { paginate, selectPageForOffset } from './pagination'

describe('paginate', () => {
  it('returns empty for blank text', () => {
    expect(paginate('')).toEqual([])
    expect(paginate('   ')).toEqual([])
  })

  it('keeps short text as one page', () => {
    expect(paginate('你好世界', 40)).toEqual(['你好世界'])
  })

  it('splits long text near limit', () => {
    const text = '甲'.repeat(100)
    const pages = paginate(text, 40)
    expect(pages.length).toBeGreaterThan(1)
    expect(pages.join('').replace(/\s/g, '').length).toBe(100)
  })

  it('prefers sentence breaks', () => {
    const text = '第一句。' + '字'.repeat(30) + '第二句。' + '字'.repeat(30)
    const pages = paginate(text, 40)
    expect(pages[0].endsWith('。') || pages[0].includes('第一句')).toBe(true)
  })
})

describe('selectPageForOffset', () => {
  it('picks page covering offset', () => {
    const pages = ['aaaa', 'bbbb', 'cccc']
    expect(selectPageForOffset(pages, 0).pageIndex).toBe(0)
    expect(selectPageForOffset(pages, 4).pageIndex).toBe(1)
    expect(selectPageForOffset(pages, 8).pageIndex).toBe(2)
  })

  it('handles empty pages', () => {
    expect(selectPageForOffset([], 0)).toEqual({ pageIndex: 0, page: '' })
  })
})
