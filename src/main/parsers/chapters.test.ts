import { describe, expect, it } from 'vitest'
import { detectChapters, sliceChapters } from './chapters'

describe('detectChapters', () => {
  it('returns single chapter for plain text without headings', () => {
    const text = '这是一些普通文字，没有任何章节标记。\n继续写一些。'
    const chapters = detectChapters(text)
    expect(chapters).toHaveLength(1)
    expect(chapters[0].startOffset).toBe(0)
  })

  it('detects 第一章 style headings', () => {
    const text = '引子\n第一段。\n\n第一章 开始\n正文开始。\n\n第二章 继续\n更多正文。'
    const chapters = detectChapters(text)
    const titles = chapters.map((c) => c.title)
    expect(titles).toContain('第一章 开始')
    expect(titles).toContain('第二章 继续')
  })

  it('detects 第N章 with Arabic numerals', () => {
    const text = '第1章 出发\nA\n\n第2章 抵达\nB'
    const chapters = detectChapters(text)
    expect(chapters.map((c) => c.title)).toEqual(['第1章 出发', '第2章 抵达'])
  })

  it('detects 【第X章】 style', () => {
    const text = '【第一章 标题】\n正文\n【第二章 另一个】\n正文2'
    const chapters = detectChapters(text)
    expect(chapters.map((c) => c.title)).toEqual(['第一章 标题', '第二章 另一个'])
  })

  it('detects Chapter 1 / CHAPTER I English style', () => {
    const text = 'Chapter 1: Begin\nbody1\n\nChapter 2\nbody2'
    const chapters = detectChapters(text)
    expect(chapters.length).toBeGreaterThanOrEqual(2)
    expect(chapters[0].title.toLowerCase()).toContain('chapter')
  })

  it('detects 序章 / 楔子 / 番外', () => {
    const text = '序章\n开始\n\n第一章 真章\n正文'
    const chapters = detectChapters(text)
    expect(chapters[0].title).toBe('序章')
    expect(chapters[1].title).toBe('第一章 真章')
  })

  it('handles large Chinese numerals like 二十三', () => {
    const text = '引\n\n第二十三章 危机\n内容\n\n第二十四章 转机\n更多'
    const chapters = detectChapters(text)
    expect(chapters.map((c) => c.title)).toEqual(['第二十三章 危机', '第二十四章 转机'])
  })

  it('records correct character offsets', () => {
    const text = '引子\nA\n\n第二章 标题\nB'
    const chapters = detectChapters(text)
    const ch2 = chapters.find((c) => c.title.includes('第二章'))!
    // '引' '子' '\n' 'A' '\n' '\n' '第' '二' '章' ' ' '标' '题' '\n' 'B'
    //  0    1    2   3   4    5    6    7   8    9  10   11   12  13
    // '第二章' starts at offset 6.
    expect(ch2.startOffset).toBe(6)
    expect(text.slice(ch2.startOffset, ch2.startOffset + 3)).toBe('第二章')
  })
})

describe('sliceChapters', () => {
  it('produces correct number of slices', () => {
    const text = '第一章 A\nA内容\n第二章 B\nB内容\n第三章 C\nC内容'
    const chapters = detectChapters(text)
    const slices = sliceChapters(text, chapters)
    expect(slices).toHaveLength(chapters.length)
  })

  it('last chapter extends to end of text', () => {
    const text = '第一章 A\nbody\n第二章 B\nbody2 trailing'
    const chapters = detectChapters(text)
    const slices = sliceChapters(text, chapters)
    expect(slices[slices.length - 1].content).toContain('body2 trailing')
  })

  it('first slice does not include content before first heading', () => {
    const text = '前言内容\n\n第一章 真章\n正文'
    const chapters = detectChapters(text)
    const slices = sliceChapters(text, chapters)
    expect(slices[0].content).not.toContain('前言内容')
    expect(slices[0].content).toContain('第一章 真章')
  })
})
