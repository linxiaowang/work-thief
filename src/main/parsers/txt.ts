import { readFile, stat } from 'node:fs/promises'
import { decodeBuffer, decodeWithPreference, type Encoding } from './encoding'
import { detectChapters, sliceChapters } from './chapters'
import { normalizeLineEndings, normalizeNovelText } from './normalize'
import type { PreferredEncoding } from '@shared/types'

export interface ParsedBook {
  title: string
  encoding: Encoding
  totalChars: number
  chapters: Array<{
    index: number
    title: string
    content: string
    startOffset: number
    charCount: number
  }>
}

/**
 * Read a TXT file from disk, detect encoding, split into chapters.
 *
 * @param filePath Absolute path to the .txt file
 * @param title Optional override for the displayed book title
 */
export async function parseTxtFile(
  filePath: string,
  title?: string,
  preferred: PreferredEncoding = 'auto'
): Promise<ParsedBook> {
  const buf = await readFile(filePath)
  const fileStat = await stat(filePath)
  const { text, encoding } =
    preferred === 'auto' ? decodeBuffer(buf) : decodeWithPreference(buf, preferred)
  return parseTxtText(text, title ?? deriveTitleFromPath(filePath), encoding, fileStat.size)
}

/**
 * Parse already-decoded text. Useful for tests and in-memory rewrites.
 *
 * Chapter headings are detected on line-ending-normalized text (needs newlines).
 * Offsets / totalChars are remapped onto the Thief-style reading string
 * (newlines→spaces, collapsed whitespace) so they match loadBookPages + paginate.
 */
export function parseTxtText(
  text: string,
  title: string,
  encoding: Encoding = 'utf-8',
  _fileSize: number = text.length
): ParsedBook {
  const lineNorm = normalizeLineEndings(text)
  const detected = detectChapters(lineNorm)
  const reading = normalizeNovelText(lineNorm)
  const remapped = remapChapterOffsets(detected, lineNorm, reading)
  const slices = sliceChapters(reading, remapped)
  const chapters = remapped.map((c, i) => ({
    index: i,
    title: c.title,
    content: slices[i].content,
    startOffset: c.startOffset,
    charCount: slices[i].content.length
  }))

  return {
    title,
    encoding,
    totalChars: reading.length,
    chapters
  }
}

/** Map chapter offsets from line-normalized text into the collapsed reading string. */
function remapChapterOffsets(
  detected: Array<{ index: number; title: string; startOffset: number }>,
  lineNorm: string,
  reading: string
): Array<{ index: number; title: string; startOffset: number }> {
  let searchFrom = 0
  return detected.map((c) => {
    const title = c.title?.trim() ?? ''
    let startOffset = 0
    if (title) {
      let idx = reading.indexOf(title, searchFrom)
      if (idx < 0) idx = reading.indexOf(title)
      if (idx >= 0) {
        startOffset = idx
        searchFrom = idx + Math.max(1, title.length)
      } else {
        const ratio = c.startOffset / Math.max(1, lineNorm.length)
        startOffset = Math.min(Math.round(ratio * reading.length), reading.length)
      }
    }
    return { index: c.index, title: c.title, startOffset }
  })
}

function deriveTitleFromPath(filePath: string): string {
  const segments = filePath.split(/[\\/]/)
  const filename = segments[segments.length - 1] ?? filePath
  return filename.replace(/\.txt$/i, '').trim() || '未命名'
}

/**
 * Compute a stable, pleasant-looking color from a string (book path).
 * Used for the auto-generated cover swatch.
 */
export function coverColorFor(seed: string): string {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const hue = Math.abs(h) % 360
  // HSL: medium-light, low saturation — looks tasteful on a bookshelf.
  return hslToHex(hue, 45, 55)
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const toHex = (x: number) => {
    const v = Math.round(x * 255)
      .toString(16)
      .padStart(2, '0')
    return v
  }
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
}
