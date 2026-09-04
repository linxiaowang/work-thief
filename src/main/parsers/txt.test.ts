import { describe, expect, it } from 'vitest'
import { parseTxtText, coverColorFor } from './txt'

describe('parseTxtText', () => {
  it('parses a minimal novel', () => {
    const text = `三体

第一章 太阳系

地球往事开始。
人类的危机浮现。

第二章 三体

三体世界降临。
`

    const result = parseTxtText(text, '三体', 'utf-8', text.length)
    expect(result.title).toBe('三体')
    expect(result.totalChars).toBe(text.length)
    expect(result.chapters.length).toBeGreaterThanOrEqual(2)
    expect(result.chapters[0].title).toBe('第一章 太阳系')
    expect(result.chapters[1].title).toBe('第二章 三体')
    expect(result.chapters[1].content).toContain('三体世界降临')
  })

  it('produces a single chapter for unstructured text', () => {
    const text = '这是一段没有章节的长文，描述了所有事情。'.repeat(50)
    const result = parseTxtText(text, '散文集', 'utf-8', text.length)
    expect(result.chapters).toHaveLength(1)
    expect(result.chapters[0].charCount).toBe(text.length)
  })

  it('records correct chapter char counts', () => {
    const text = `第一章 A
AAA

第二章 B
BBBBB

第三章 C
CC
`
    const result = parseTxtText(text, 'test', 'utf-8', text.length)
    expect(result.chapters).toHaveLength(3)
    expect(result.chapters[0].charCount).toBeGreaterThan(0)
    expect(result.chapters[1].charCount).toBeGreaterThan(0)
    expect(result.chapters[2].charCount).toBeGreaterThan(0)
  })
})

describe('coverColorFor', () => {
  it('returns a valid hex color', () => {
    const color = coverColorFor('/some/path/三体.txt')
    expect(color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('produces different colors for different inputs', () => {
    const a = coverColorFor('/path/a.txt')
    const b = coverColorFor('/path/b.txt')
    const c = coverColorFor('/path/c.txt')
    const colors = new Set([a, b, c])
    expect(colors.size).toBeGreaterThan(1)
  })

  it('produces stable colors for the same input', () => {
    const a = coverColorFor('/path/三体.txt')
    const b = coverColorFor('/path/三体.txt')
    expect(a).toBe(b)
  })
})
