import { describe, expect, it } from 'vitest'
import { normalizeLineEndings, normalizeNovelText } from './normalize'
import { detectChapters } from './chapters'
import { parseTxtText } from './txt'
import { paginate, resolveChapterJumpPageIndex, readingTextOf } from '../pagination'

describe('normalizeLineEndings', () => {
  it('converts CRLF and lone CR to LF only', () => {
    expect(normalizeLineEndings('a\r\nb\rc')).toBe('a\nb\nc')
  })
})

describe('normalizeNovelText', () => {
  it('collapses newlines to spaces and trims once', () => {
    expect(normalizeNovelText('第一章\n正文')).toBe('第一章 正文')
    expect(normalizeNovelText('  a  \n\n  b  ')).toBe('a b')
  })
})

describe('chapter jump with shared normalization', () => {
  const sampleCrlf = [
    '前言内容。',
    '',
    '第一章 开始',
    '这是第一章的正文内容，有一些字。',
    '',
    '第二章 继续',
    '这是第二章的开场白，跳转应落在这里。',
    '更多第二章内容。'
  ].join('\r\n')

  it('import offsets match loadBookPages reading string (CRLF source)', () => {
    const parsed = parseTxtText(sampleCrlf, '测试')
    const reading = normalizeNovelText(sampleCrlf)
    expect(parsed.totalChars).toBe(reading.length)

    const ch2 = parsed.chapters.find((c) => c.title.includes('第二章'))!
    expect(ch2).toBeTruthy()
    expect(reading.slice(ch2.startOffset, ch2.startOffset + 3)).toBe('第二章')
  })

  it('jump to 第二章 lands on that chapter opening', () => {
    const parsed = parseTxtText(sampleCrlf, '测试')
    const reading = readingTextOf(sampleCrlf)
    const pages = paginate(reading, 20)
    expect(pages.length).toBeGreaterThan(0)

    const ch2 = parsed.chapters.find((c) => c.title.includes('第二章'))!
    const pageIndex = resolveChapterJumpPageIndex(reading, ch2, 20)
    expect(pageIndex).not.toBeNull()
    const page = pages[pageIndex!]
    expect(page).toContain('第二章')
  })

  it('title search ignores wrong startOffset (legacy misaligned)', () => {
    const reading = readingTextOf(sampleCrlf)
    const pages = paginate(reading, 20)
    const chapters = detectChapters(normalizeLineEndings(sampleCrlf))
    const ch2 = chapters.find((c) => c.title.includes('第二章'))!
    const pageIndex = resolveChapterJumpPageIndex(reading, { title: ch2.title }, 20)
    expect(pageIndex).not.toBeNull()
    expect(pages[pageIndex!]).toContain('第二章')
  })

  it('returns null when chapter cannot be resolved', () => {
    expect(
      resolveChapterJumpPageIndex('没有任何章节标题的正文。', { title: '不存在的章节' }, 20)
    ).toBeNull()
  })
})
