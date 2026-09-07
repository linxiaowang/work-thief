import { describe, expect, it } from 'vitest'
import { paginate, selectPageForOffset, readingTextOf } from './pagination'

describe('paginate', () => {
  it('returns empty for blank text', () => {
    expect(paginate('')).toEqual([])
    expect(paginate('   ')).toEqual([])
  })

  it('keeps short text as one page', () => {
    expect(paginate('你好世界', 40)).toEqual(['你好世界'])
  })

  it('splits long text into fixed windows without overlap', () => {
    const text = '甲'.repeat(100)
    const pages = paginate(text, 40)
    expect(pages.length).toBe(3)
    expect(pages[0].length).toBe(40)
    expect(pages[1].length).toBe(40)
    expect(pages[2].length).toBe(20)
    expect(pages.join('')).toBe(text)
  })

  it('collapses newlines/whitespace then slices continuously', () => {
    const raw = '第一句。\n\n  第二句。\n第三句。'
    const pages = paginate(raw, 10)
    const reading = readingTextOf(raw)
    expect(pages.join('')).toBe(reading)
    expect(reading.includes('\n')).toBe(false)
  })

  it('adjacent pages concat equals original reading slice for same range', () => {
    const raw = ['前言', '第一章 开始', '正文甲' + '字'.repeat(50), '第二章 继续', '正文乙' + '字'.repeat(50)].join(
      '\n\n'
    )
    const n = 40
    const pages = paginate(raw, n)
    const reading = readingTextOf(raw)
    expect(pages.join('')).toBe(reading)

    for (let i = 0; i + 1 < pages.length; i++) {
      const concat = pages[i] + pages[i + 1]
      const start = i * n
      const end = Math.min((i + 2) * n, reading.length)
      expect(concat).toBe(reading.slice(start, end))
    }
  })

  it('never trims individual pages (interior spaces preserved at boundaries)', () => {
    // 10 chars of content with a space that falls on a page boundary after normalize
    const reading = 'abcdefghij klmnopqrst' // length 21, space at index 10
    const pages = paginate(reading, 10)
    expect(pages[0]).toBe('abcdefghij')
    expect(pages[1]).toBe(' klmnopqrs')
    expect(pages[2]).toBe('t')
    expect(pages.join('')).toBe(reading)
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
