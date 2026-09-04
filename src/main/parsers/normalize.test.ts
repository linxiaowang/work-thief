import { describe, expect, it } from 'vitest'
import { normalizeNovelText } from './normalize'
import { detectChapters } from './chapters'
import { parseTxtText } from './txt'
import { paginate, resolveChapterJumpPageIndex } from '../pagination'

describe('normalizeNovelText', () => {
  it('converts CRLF and lone CR to LF only', () => {
    expect(normalizeNovelText('a\r\nb\rc')).toBe('a\nb\nc')
  })

  it('does not collapse newlines to spaces', () => {
    expect(normalizeNovelText('第一章\n正文')).toBe('第一章\n正文')
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
    const reading = normalizeNovelText(sampleCrlf)
    const pages = paginate(reading, 40)
    expect(pages.length).toBeGreaterThan(0)

    const ch2 = parsed.chapters.find((c) => c.title.includes('第二章'))!
    const pageIndex = resolveChapterJumpPageIndex(pages, reading, ch2)
    expect(pageIndex).not.toBeNull()
    const page = pages[pageIndex!]
    expect(page).toContain('第二章')
    // Opening text of chapter 2 should be on this page (or title at least).
    expect(page.includes('继续') || page.includes('开场白') || page.includes('第二章')).toBe(
      true
    )
  })

  it('title fallback works when startOffset is wrong (legacy misaligned)', () => {
    const reading = normalizeNovelText(sampleCrlf)
    const pages = paginate(reading, 40)
    const chapters = detectChapters(reading)
    const ch2 = chapters.find((c) => c.title.includes('第二章'))!
    // Simulate legacy bad offset far from real title
    const bad = { startOffset: 0, title: ch2.title }
    const pageIndex = resolveChapterJumpPageIndex(pages, reading, bad)
    expect(pageIndex).not.toBeNull()
    expect(pages[pageIndex!]).toContain('第二章')
  })

  it('returns null when chapter cannot be resolved', () => {
    const pages = paginate('没有任何章节标题的正文。', 40)
    expect(
      resolveChapterJumpPageIndex(pages, '没有任何章节标题的正文。', {
        startOffset: 9999,
        title: '不存在的章节'
      })
    ).toBeNull()
  })
})
