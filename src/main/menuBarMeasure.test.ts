import { describe, expect, it } from 'vitest'
import { displayUnitsCacheKey } from './menuBarMeasure'
import { maxBodyCharsForDisplay } from './trayTitle'

describe('menuBarMeasure', () => {
  it('buckets display units for stable cache keys', () => {
    expect(displayUnitsCacheKey(71)).toBe(72)
    expect(displayUnitsCacheKey(73)).toBe(72)
  })
})

describe('adaptive body chars from display width', () => {
  it('allows more chars when display budget is wider', () => {
    const suffix = '·完'
    const narrow = maxBodyCharsForDisplay(suffix, 40, 120)
    const wide = maxBodyCharsForDisplay(suffix, 44, 120)
    expect(wide).toBeGreaterThanOrEqual(narrow)
    expect(wide).toBeGreaterThanOrEqual(18)
  })
})
