/**
 * Chapter detection for plain-text novels.
 *
 * Order matters — we try patterns from most specific to most generic.
 * Each match should be a chapter heading line; we record its character
 * offset in the source text so the reader can jump to it precisely.
 */

interface ChapterMatch {
  index: number
  title: string
  startOffset: number
}

interface PatternSet {
  id: string
  regex: RegExp
  /** Pulls a clean title out of the matched line (strips decorations). */
  clean: (raw: string) => string
}

// Chinese numerals commonly used in chapter headings (一~十, 百, 千, etc.)
const CN_NUM =
  '[一二三四五六七八九十百千万零〇两壹贰叁肆伍陆柒捌玖拾佰仟]+'

const PATTERNS: PatternSet[] = [
  // 【第一章 标题】 / 《第二章 标题》 — bracket-wrapped heading. Allow
  // any chars (incl. a title) between the chapter marker and the
  // closing bracket. Tried first so we don't greedily treat the
  // brackets as decoration around a plain "第一章" heading.
  {
    id: 'cn-bracket',
    regex: new RegExp(`^[【《]\\s*(?:第)?(?:[0-9]+|${CN_NUM})\\s*[章回节卷].*?[】》]\\s*$`, 'm'),
    clean: (raw) =>
      raw
        .trim()
        .replace(/^[【《]\s*/, '')
        .replace(/\s*[】》]$/, '')
        .trim()
  },
  // ====== 第X章 ======
  {
    id: 'cn-equals',
    regex: new RegExp(`^={3,}\\s*第?(?:[0-9]+|${CN_NUM})\\s*[章回节卷].*$`, 'm'),
    clean: (raw) => raw.trim().replace(/^=+\s*/, '').replace(/\s*=+$/, '')
  },
  // 第一章 / 第123章 / 第1节
  {
    id: 'cn-chapter',
    regex: new RegExp(`^第\\s*(?:[0-9]+|${CN_NUM})\\s*[章回节卷集部篇].*$`, 'm'),
    clean: (raw) => raw.trim().replace(/\s+/g, ' ')
  },
  // Chapter 1 / CHAPTER I
  {
    id: 'en-chapter',
    regex: /^Chapter\s+[0-9IVXLCDM]+.*$/im,
    clean: (raw) => raw.trim().replace(/\s+/g, ' ')
  },
  // 卷一 / 序章 / 楔子 / 番外
  {
    id: 'cn-special',
    regex: /^(?:序章|序言|序|楔子|引子|后记|尾声|番外|番外一|番外二)$/m,
    clean: (raw) => raw.trim()
  }
]

/**
 * Detect chapter boundaries in the given text.
 * Returns at least one chapter (the whole text as a single chapter) so
 * callers can always assume at least one entry exists.
 *
 * Patterns are tried in priority order (earlier = higher). When two
 * patterns match near the same position (e.g. cn-bracket and cn-chapter
 * both fire on "【第一章】"), the higher-priority match wins.
 */
export function detectChapters(text: string): ChapterMatch[] {
  const accepted: Array<{ offset: number; length: number; raw: string; patternId: string }> = []

  for (const pattern of PATTERNS) {
    // matchAll requires the 'g' flag for non-zero-length iteration.
    const globalRegex = new RegExp(pattern.regex.source, pattern.regex.flags + 'g')
    for (const m of text.matchAll(globalRegex)) {
      if (m.index === undefined) continue
      // Skip if a higher-priority pattern already accepted a match
      // within 4 chars of this position.
      const overlaps = accepted.some(
        (a) => Math.abs(a.offset - m.index!) <= 4
      )
      if (overlaps) continue
      accepted.push({
        offset: m.index,
        length: m[0].length,
        raw: m[0],
        patternId: pattern.id
      })
    }
  }

  if (accepted.length === 0) {
    return [
      {
        index: 0,
        title: deriveTitleFromContent(text),
        startOffset: 0
      }
    ]
  }

  // Final pass: sort by offset and dedupe very close matches (keep first).
  accepted.sort((a, b) => a.offset - b.offset)
  const deduped: typeof accepted = []
  for (const m of accepted) {
    if (deduped.length === 0 || m.offset - deduped[deduped.length - 1].offset > 4) {
      deduped.push(m)
    }
  }

  return deduped.map((m, i) => {
    const pattern = PATTERNS.find((p) => p.id === m.patternId)!
    return {
      index: i,
      title: pattern.clean(m.raw),
      startOffset: m.offset
    }
  })
}

/**
 * When no chapter is detected, try to use the first non-empty line as
 * the title (typically the book title in many TXT novels).
 */
function deriveTitleFromContent(text: string): string {
  const trimmed = text.trimStart()
  const firstLine = trimmed.split(/\r?\n/, 1)[0]?.trim() ?? ''
  if (firstLine.length > 0 && firstLine.length <= 40) {
    return firstLine
  }
  return '未命名章节'
}

/**
 * Split text into chapter content slices given detected chapter
 * boundaries. The last chapter extends to the end of the text.
 */
export function sliceChapters(
  text: string,
  chapters: ChapterMatch[]
): Array<{ title: string; content: string }> {
  return chapters.map((c, i) => {
    const start = c.startOffset
    const end = i + 1 < chapters.length ? chapters[i + 1].startOffset : text.length
    const content = text.slice(start, end).trimStart()
    return { title: c.title, content }
  })
}
