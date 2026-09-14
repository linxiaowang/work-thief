import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { paginate, readingTextOf } from './pagination'
import { decodeBuffer } from './parsers/encoding'
import {
  truncateForMenuBar,
  MENU_BAR_TITLE_MAX,
  MENU_BAR_TITLE_RETRY,
  MENU_BAR_DISPLAY_MAX,
  buildPageSuffix,
  bodyMaxForSuffix,
  composeReadingTitle,
  resolveEffectiveCharsPerPage,
  menuBarDisplayUnits,
  readingTitleFitsMenuBar,
  menuBarTitleSuffix,
  maxBodyCharsForDisplay,
  worstMenuBarSuffixForPaging
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

  it('menuBarTitleSuffix keeps page# in tooltip when showPageNumber', () => {
    expect(menuBarTitleSuffix(6964, 24915, { showPageNumber: true, isLast: false })).toBe('')
    expect(menuBarTitleSuffix(24914, 24915, { showPageNumber: true, isLast: true })).toBe('·完')
    expect(menuBarTitleSuffix(2, 120, { showPageNumber: false, isLast: false })).toBe('')
    expect(menuBarTitleSuffix(119, 120, { showPageNumber: false, isLast: true })).toBe('·完')
  })

  it('bodyMax uses display-width binary search (at least 10)', () => {
    expect(bodyMaxForSuffix('·3/120')).toBe(maxBodyCharsForDisplay('·3/120'))
    expect(bodyMaxForSuffix('')).toBe(maxBodyCharsForDisplay(''))
    expect(bodyMaxForSuffix('·完')).toBeGreaterThanOrEqual(20)
    expect(bodyMaxForSuffix('x'.repeat(25))).toBeGreaterThanOrEqual(10)
  })

  it('with showPageNumber, effective chars uses adaptive width up to settings cap', () => {
    const reading = '甲'.repeat(5000)
    const effective = resolveEffectiveCharsPerPage(reading.length, 80, true, 44)
    expect(effective).toBeGreaterThanOrEqual(18)
    expect(effective).toBeLessThanOrEqual(80)
  })

  it('composeReadingTitle never trims page; fits display budget when sized correctly', () => {
    const suffix = '·3/120'
    const bodyMax = bodyMaxForSuffix(suffix, 46)
    const page = '甲'.repeat(bodyMax)
    const title = composeReadingTitle(page, suffix)
    expect(title).toBe(page + suffix)
    expect(readingTitleFitsMenuBar(page, suffix, 46)).toBe(true)
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
      const suffixOpts = { showPageNumber, isLast }
      const barSuffix = menuBarTitleSuffix(i, pages.length, suffixOpts)
      const bodyMax = bodyMaxForSuffix(worstMenuBarSuffixForPaging(pages.length, showPageNumber))
      expect(pages[i].length).toBeLessThanOrEqual(bodyMax)
      const title = composeReadingTitle(pages[i], barSuffix)
      expect(readingTitleFitsMenuBar(pages[i], barSuffix)).toBe(true)
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
    const barSuffix = menuBarTitleSuffix(last, pages.length, {
      showPageNumber: true,
      isLast: true
    })
    const title = composeReadingTitle(pages[last], barSuffix)
    expect(readingTitleFitsMenuBar(pages[last], barSuffix)).toBe(true)
    expect(title.endsWith('·完')).toBe(true)
    expect(title.includes(pages[last])).toBe(true)
  })

  it('large charsPerPage is capped by bodyMax so title never needs end-trim', () => {
    const reading = '乙'.repeat(200)
    const effective = resolveEffectiveCharsPerPage(reading.length, 80, true)
    expect(effective).toBeLessThan(80)
    const pages = paginate(reading, effective)
    for (let i = 0; i < pages.length; i++) {
      const suffixOpts = {
        showPageNumber: true,
        isLast: i === pages.length - 1
      }
      const barSuffix = menuBarTitleSuffix(i, pages.length, suffixOpts)
      const title = composeReadingTitle(pages[i], barSuffix)
      expect(readingTitleFitsMenuBar(pages[i], barSuffix)).toBe(true)
      expect(title.slice(0, pages[i].length)).toBe(pages[i])
    }
    expect(pages.join('')).toBe(reading)
  })

  it('刘冰/世杰 dialogue pages fit macOS display width with page numbers', () => {
    const path = '/Users/shawnlin/Downloads/遥远的救世主.TXT'
    if (!existsSync(path)) return
    const buf = readFileSync(path)
    const { text } = decodeBuffer(buf)
    const reading = readingTextOf(text)
    const needle = '便开玩笑地说'
    const idx = reading.indexOf(needle)
    expect(idx).toBeGreaterThan(0)
    const effective = resolveEffectiveCharsPerPage(reading.length, 20, true)
    const pages = paginate(reading, effective)
    let acc = 0
    let pi = 0
    for (let i = 0; i < pages.length; i++) {
      if (acc <= idx && idx < acc + pages[i].length) {
        pi = i
        break
      }
      acc += pages[i].length
    }
    for (let j = pi; j < pi + 4 && j < pages.length; j++) {
      const suffixOpts = {
        showPageNumber: true,
        isLast: j === pages.length - 1
      }
      const barSuffix = menuBarTitleSuffix(j, pages.length, suffixOpts)
      expect(readingTitleFitsMenuBar(pages[j], barSuffix)).toBe(true)
      expect(pages[j].replace(/\s+/g, '').length).toBeGreaterThan(0)
    }
  })
})
