import jschardet from 'jschardet'

export type Encoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'gbk' | 'big5' | 'shift_jis' | 'euc-kr' | 'iso-8859-1' | 'windows-1252'

/**
 * Decode a Buffer to a UTF-8 string, auto-detecting the source encoding.
 *
 * Strategy:
 *   1. Check for BOM (UTF-8, UTF-16LE, UTF-16BE).
 *   2. Run jschardet on the BOM-stripped buffer.
 *   3. If confidence is low, try common Chinese encodings (GBK → Big5).
 *   4. Fall back to UTF-8 with replacement characters.
 */
export function decodeBuffer(buf: Buffer): { text: string; encoding: Encoding } {
  // 1. BOM detection
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.subarray(3).toString('utf-8'), encoding: 'utf-8' }
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: buf.subarray(2).toString('utf-16le'), encoding: 'utf-16le' }
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    // UTF-16BE — Node has no native decoder; swap byte pairs.
    const swapped = Buffer.alloc(buf.length - 2)
    for (let i = 2; i + 1 < buf.length; i += 2) {
      swapped[i - 2] = buf[i + 1]
      swapped[i - 1] = buf[i]
    }
    return { text: swapped.toString('utf-16le'), encoding: 'utf-16be' }
  }

  // 2. Heuristic detection
  const sampleSize = Math.min(buf.length, 64 * 1024)
  const sample = buf.subarray(0, sampleSize)
  const detected = jschardet.detect(sample)
  const confidence = detected?.confidence ?? 0
  const guess = (detected?.encoding ?? '').toLowerCase()

  const encoding = pickEncoding(guess, confidence, sample)
  const decoder = (globalThis as any).TextDecoder
    ? new TextDecoder(encoding, { fatal: false })
    : null

  let text: string
  if (decoder) {
    text = decoder.decode(buf)
  } else {
    text = buf.toString(encoding as BufferEncoding)
  }
  return { text, encoding: encoding as Encoding }
}

function pickEncoding(guess: string, confidence: number, sample: Buffer): Encoding {
  // Normalize common aliases
  const map: Record<string, Encoding> = {
    'utf-8': 'utf-8',
    utf8: 'utf-8',
    'utf-16': sample.length >= 2 && sample[0] === 0xff ? 'utf-16le' : 'utf-16be',
    'utf-16le': 'utf-16le',
    'utf-16be': 'utf-16be',
    gbk: 'gbk',
    gb2312: 'gbk',
    gb18030: 'gbk',
    big5: 'big5',
    'shift_jis': 'shift_jis',
    'euc-kr': 'euc-kr',
    'iso-8859-1': 'iso-8859-1',
    'windows-1252': 'windows-1252'
  }

  if (confidence >= 0.7 && guess in map) {
    return map[guess]
  }

  // Heuristic fallback: try GBK if the sample has many high bytes
  // (typical for Chinese GBK without proper declaration).
  let highBytes = 0
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] >= 0x80) highBytes++
  }
  if (highBytes / sample.length > 0.2) {
    return 'gbk'
  }

  return 'utf-8'
}
