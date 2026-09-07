import { describe, expect, it } from 'vitest'
import { paginate, readingTextOf } from './pagination'
import {
  truncateForMenuBar,
  MENU_BAR_TITLE_MAX,
  MENU_BAR_TITLE_RETRY,
  buildPageSuffix,
  bodyMaxForSuffix,
  composeReadingTitle,
  resolveEffectiveCharsPerPage
} from './trayTitle'

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

describe('buildPageSuffix + bodyMax + composeReadingTitle', () => {
  it('computes page# suffix and ·完 on last page', () => {
    expect(buildPageSuffix(2, 120, { showPageNumber: true, isLast: false })).toBe('·3/120')
    expect(buildPageSuffix(119, 120, { showPageNumber: true, isLast: true })).toBe('·120/120·完')
    expect(buildPageSuffix(0, 1, { showPageNumber: false, isLast: true })).toBe('·完')
    expect(buildPageSuffix(0, 5, { showPageNumber: false, isLast: false })).toBe('')
  })

  it('bodyMax = MAX - suffix.length (at least 10)', () => {
    expect(bodyMaxForSuffix('·3/120')).toBe(MENU_BAR_TITLE_MAX - '·3/120'.length)
    expect(bodyMaxForSuffix('·120/120·完')).toBe(MENU_BAR_TITLE_MAX - '·120/120·完'.length)
    expect(bodyMaxForSuffix('x'.repeat(25))).toBe(10)
  })

  it('composeReadingTitle never trims page; length ≤ MAX when sized correctly', () => {
    const suffix = '·3/120'
    const bodyMax = bodyMaxForSuffix(suffix)
    const page = '甲'.repeat(bodyMax)
    const title = composeReadingTitle(page, suffix)
    expect(title).toBe(page + suffix)
    expect(title.length).toBeLessThanOrEqual(MENU_BAR_TITLE_MAX)
    expect(title.includes(page)).toBe(true)
  })
})

describe('page continuity under title hard cap', () => {
  it('adjacent pages join === original reading slice; rendered title ≤ 28 and contains full page', () => {
    const raw =
      '前言\n\n第一章 开始\n\n' +
      '正文甲' +
      '字'.repeat(80) +
      '\n\n第二章 继续\n\n' +
      '正文乙' +
      '字'.repeat(80)
    const reading = readingTextOf(raw)
    const settingsChars = 20
    const showPageNumber = true
    const effective = resolveEffectiveCharsPerPage(reading.length, settingsChars, showPageNumber)
    expect(effective).toBeLessThanOrEqual(settingsChars)
    expect(effective).toBeGreaterThanOrEqual(10)

    const pages = paginate(reading, effective)
    expect(pages.join('')).toBe(reading)

    for (let i = 0; i + 1 < pages.length; i++) {
      const concat = pages[i] + pages[i + 1]
      const start = pages.slice(0, i).reduce((n, p) => n + p.length, 0)
      const end = start + pages[i].length + pages[i + 1].length
      expect(concat).toBe(reading.slice(start, end))
    }

    for (let i = 0; i < pages.length; i++) {
      const isLast = i === pages.length - 1
      const suffix = buildPageSuffix(i, pages.length, { showPageNumber, isLast })
      const bodyMax = bodyMaxForSuffix(suffix)
      // Page was sliced with effective ≤ worst-case bodyMax; still must fit this suffix.
      expect(pages[i].length).toBeLessThanOrEqual(bodyMax)
      const title = composeReadingTitle(pages[i], suffix)
      expect(title.length).toBeLessThanOrEqual(MENU_BAR_TITLE_MAX)
      expect(title.startsWith(pages[i])).toBe(true)
      expect(title.includes(pages[i])).toBe(true)
      // Full page text contained in title (never trimmed after slicing).
      expect(title.slice(0, pages[i].length)).toBe(pages[i])
    }
  })

  it('default 20-char setting shrinks when suffix would overflow 28', () => {
    // Many pages → longer ·N/M·完 suffix → bodyMax < 20
    const reading = '甲'.repeat(5000)
    const effective = resolveEffectiveCharsPerPage(reading.length, 20, true)
    const pages = paginate(reading, effective)
    const last = pages.length - 1
    const suffix = buildPageSuffix(last, pages.length, { showPageNumber: true, isLast: true })
    const title = composeReadingTitle(pages[last], suffix)
    expect(title.length).toBeLessThanOrEqual(MENU_BAR_TITLE_MAX)
    expect(title.endsWith('·完')).toBe(true)
    expect(title.includes(pages[last])).toBe(true)
  })

  it('large charsPerPage is capped by bodyMax so title never needs end-trim', () => {
    const reading = '乙'.repeat(200)
    const effective = resolveEffectiveCharsPerPage(reading.length, 80, true)
    expect(effective).toBeLessThan(80)
    const pages = paginate(reading, effective)
    for (let i = 0; i < pages.length; i++) {
      const suffix = buildPageSuffix(i, pages.length, {
        showPageNumber: true,
        isLast: i === pages.length - 1
      })
      const title = composeReadingTitle(pages[i], suffix)
      expect(title.length).toBeLessThanOrEqual(MENU_BAR_TITLE_MAX)
      expect(title.slice(0, pages[i].length)).toBe(pages[i])
    }
    expect(pages.join('')).toBe(reading)
  })
})
