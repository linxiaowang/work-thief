import { describe, expect, it } from 'vitest'
import {
  paginate,
  selectPageForOffset,
  readingTextOf,
  resolveChapterJumpPageIndex,
  resolveChapterStartOffset,
  isBlankPage,
  findNonEmptyPageIndex,
  _internals
} from './pagination'
import { parseTxtText } from './parsers/txt'
import { resolveEffectiveCharsPerPage, truncateForMenuBar, composeReadingTitle, buildPageSuffix } from './trayTitle'
import { normalizeLineEndings } from './parsers/normalize'

describe('paginate', () => {
  it('returns empty for blank text', () => {
    expect(paginate('')).toEqual([])
    expect(paginate('   ')).toEqual([])
  })

  it('keeps short text as one page', () => {
    expect(paginate('你好世界', 40)).toEqual(['你好世界'])
  })

  it('defaults to 20 chars per page', () => {
    expect(_internals.DEFAULT_CHARS_PER_PAGE).toBe(20)
    const text = '甲'.repeat(45)
    const pages = paginate(text)
    expect(pages.length).toBe(3)
    expect(pages[0].length).toBe(20)
    expect(pages[1].length).toBe(20)
    expect(pages[2].length).toBe(5)
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

describe('isBlankPage / findNonEmptyPageIndex', () => {
  it('detects whitespace and newline-only pages', () => {
    expect(isBlankPage('')).toBe(true)
    expect(isBlankPage('   ')).toBe(true)
    expect(isBlankPage('\n\n\n')).toBe(true)
    expect(isBlankPage('\n  \n')).toBe(true)
    expect(isBlankPage(null)).toBe(true)
    expect(isBlankPage('第1章')).toBe(false)
    expect(isBlankPage(' a ')).toBe(false)
  })

  it('skips blank pages forward and backward', () => {
    const pages = ['甲乙', '\n\n\n\n', '   ', '丙丁', '']
    expect(findNonEmptyPageIndex(pages, 1, 1)).toBe(3)
    expect(findNonEmptyPageIndex(pages, 2, 1)).toBe(3)
    expect(findNonEmptyPageIndex(pages, 4, -1)).toBe(3)
    expect(findNonEmptyPageIndex(pages, 1, -1)).toBe(0)
  })
})

describe('resolveChapterJumpPageIndex', () => {
  it('uses title location and floor(idx/charsPerPage); ignores bad startOffset', () => {
    const reading = '前言。第一章 开始。正文甲。第二章 继续。正文乙。'
    const idx = reading.indexOf('第二章')
    expect(idx).toBeGreaterThan(0)
    const pageIndex = resolveChapterJumpPageIndex(reading, { title: '第二章 继续', startOffset: 99999 }, 20)
    expect(pageIndex).toBe(Math.floor(idx / 20))
  })

  it('prefers validated startOffset over an earlier title false-match', () => {
    // Body mentions the later chapter title before the real heading.
    const reading = '详见第二章 继续。前言。第一章 开始。正文。第二章 继续。后文。'
    const real = reading.lastIndexOf('第二章 继续')
    const pageIndex = resolveChapterJumpPageIndex(
      reading,
      { title: '第二章 继续', startOffset: real },
      10
    )
    expect(pageIndex).toBe(Math.floor(real / 10))
    expect(resolveChapterStartOffset(reading, { title: '第二章 继续', startOffset: real })).toBe(real)
  })

  it('supports nth occurrence of the same title', () => {
    const reading = '章X' + '一'.repeat(18) + '章X' + '二'.repeat(10)
    const first = resolveChapterJumpPageIndex(reading, { title: '章X' }, 10, 0)
    const second = resolveChapterJumpPageIndex(reading, { title: '章X' }, 10, 1)
    const secondIdx = reading.indexOf('章X', 2)
    expect(first).toBe(0)
    expect(second).toBe(Math.floor(secondIdx / 10))
    expect(second).toBeGreaterThan(first!)
  })

  it('returns null when title missing', () => {
    expect(
      resolveChapterJumpPageIndex('没有任何章节标题的正文。', { title: '不存在的章节' }, 20)
    ).toBeNull()
  })

  it('with pages: uses selectPageForOffset and skips blank windows after jump', () => {
    const pages = ['前文前文前文前文', '\n\n\n\n\n\n\n\n', '   ', '第9章 标题续', '正文正文正文正文']
    // Offset into the blank region that precedes the chapter title page.
    const text = pages.join('')
    const titleAt = text.indexOf('第9章 标题续')
    const pageIndex = resolveChapterJumpPageIndex(
      text,
      { title: '第9章 标题续', startOffset: titleAt },
      10,
      0,
      pages
    )
    expect(pageIndex).toBe(3)
    expect(isBlankPage(pages[pageIndex!])).toBe(false)
  })
})

describe('long book jump ~1000+ then next pages (Shawn repro)', () => {
  it('recalculates page from chapter first char; never yields blank tray titles on next', () => {
    const parts: string[] = []
    for (let i = 1; i <= 1200; i++) {
      // Heavy newline padding between title and body — blank windows if sliced raw.
      parts.push(`第${i}章 标题${i}\n` + '\n'.repeat(25) + ('正文内容'.repeat(25)) + '\n')
    }
    const raw = '前言前言\n\n' + parts.join('\n')
    const parsed = parseTxtText(raw, 'long')
    expect(parsed.chapters.length).toBeGreaterThanOrEqual(1000)

    const reading = readingTextOf(raw)
    const effective = resolveEffectiveCharsPerPage(reading.length, 20, false)
    const pages = paginate(reading, effective)

    const ch = parsed.chapters[999] // chapter 1000
    const offset = resolveChapterStartOffset(reading, ch, 0)
    expect(offset).toBe(ch.startOffset)
    expect(reading.startsWith(ch.title.trim(), offset!)).toBe(true)

    const pageIndex = resolveChapterJumpPageIndex(reading, ch, effective, 0, pages)
    expect(pageIndex).not.toBeNull()
    // Must not keep a stale early pageIndex — landed near chapter 1000 offset.
    expect(pageIndex!).toBe(selectPageForOffset(pages, offset!).pageIndex)
    expect(isBlankPage(pages[pageIndex!])).toBe(false)

    // Simulate next-page × 5 — tray titles must stay non-empty.
    let idx = pageIndex!
    for (let step = 0; step < 5; step++) {
      if (idx < pages.length - 1) {
        idx += 1
        idx = findNonEmptyPageIndex(pages, idx, 1)
      }
      const page = pages[idx]
      expect(isBlankPage(page)).toBe(false)
      const suffix = buildPageSuffix(idx, pages.length, { showPageNumber: false, isLast: false })
      const title = composeReadingTitle(page, suffix)
      expect(title.replace(/\s+/g, '').length).toBeGreaterThan(0)
      expect(truncateForMenuBar(title).length).toBeGreaterThan(0)
    }
  })

  it('raw newline windows after chapter jump: next-page auto-skips blanks (never empty title)', () => {
    // Reproduce empty-tray path when paging keeps newline runs (pre-collapse / mixed).
    const parts: string[] = []
    for (let i = 1; i <= 80; i++) {
      parts.push(`第${i}章 标题\n` + '\n'.repeat(40) + ('哈'.repeat(40)) + '\n')
    }
    const raw = normalizeLineEndings(parts.join('\n'))
    const limit = 20
    const pages: string[] = []
    for (let i = 0; i < raw.length; i += limit) {
      pages.push(raw.slice(i, i + limit))
    }
    expect(pages.some((p) => isBlankPage(p))).toBe(true)

    const title = '第40章 标题'
    const offset = raw.indexOf(title)
    expect(offset).toBeGreaterThan(0)
    let pageIndex = resolveChapterJumpPageIndex(raw, { title, startOffset: offset }, limit, 0, pages)!
    expect(isBlankPage(pages[pageIndex])).toBe(false)

    // Old bug: naive ++ landed on newline-only page → truncateForMenuBar → ''.
    const naiveNext = pages[pageIndex + 1]
    expect(isBlankPage(naiveNext)).toBe(true)
    expect(truncateForMenuBar(naiveNext)).toBe('')

    // Fixed: auto-advance skips blanks.
    pageIndex = findNonEmptyPageIndex(pages, pageIndex + 1, 1)
    expect(isBlankPage(pages[pageIndex])).toBe(false)
    const titleOut = composeReadingTitle(
      pages[pageIndex],
      buildPageSuffix(pageIndex, pages.length, { showPageNumber: false, isLast: false })
    )
    expect(truncateForMenuBar(titleOut).length).toBeGreaterThan(0)
  })
})
