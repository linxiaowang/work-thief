import { describe, expect, it } from 'vitest'
import { decodeBuffer } from './encoding'

describe('decodeBuffer', () => {
  it('decodes UTF-8 with BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('你好', 'utf-8')])
    const { text, encoding } = decodeBuffer(buf)
    expect(text).toBe('你好')
    expect(encoding).toBe('utf-8')
  })

  it('decodes UTF-16LE with BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('你好', 'utf-16le')])
    const { text, encoding } = decodeBuffer(buf)
    expect(text).toBe('你好')
    expect(encoding).toBe('utf-16le')
  })

  it('decodes UTF-16BE with BOM', () => {
    const inner = Buffer.from('你好', 'utf-16le')
    const swapped = Buffer.alloc(inner.length)
    for (let i = 0; i < inner.length; i += 2) {
      swapped[i] = inner[i + 1]
      swapped[i + 1] = inner[i]
    }
    const buf = Buffer.concat([Buffer.from([0xfe, 0xff]), swapped])
    const { text, encoding } = decodeBuffer(buf)
    expect(text).toBe('你好')
    expect(encoding).toBe('utf-16be')
  })

  it('decodes plain UTF-8 without BOM', () => {
    const buf = Buffer.from('hello world', 'utf-8')
    const { text, encoding } = decodeBuffer(buf)
    expect(text).toBe('hello world')
    expect(encoding).toBe('utf-8')
  })

  it('falls back to GBK for high-byte Chinese text', () => {
    // Pre-encoded GBK bytes for "三体" (avoid Buffer.from('gbk') which
    // Node.js doesn't support natively).
    //   三 = 0xC8 0xFD
    //   体 = 0xCC 0xE5
    const gbkBytes = Buffer.from([0xc8, 0xfd, 0xcc, 0xe5])
    const { text: decoded, encoding } = decodeBuffer(gbkBytes)
    expect(decoded).toBe('三体')
    expect(encoding).toBe('gbk')
  })

  it('handles empty buffer', () => {
    const { text } = decodeBuffer(Buffer.alloc(0))
    expect(text).toBe('')
  })
})

describe('decodeWithPreference', () => {
  it('forces UTF-8', async () => {
    const { decodeWithPreference } = await import('./encoding')
    const buf = Buffer.from('hello', 'utf-8')
    const { text, encoding } = decodeWithPreference(buf, 'utf-8')
    expect(text).toBe('hello')
    expect(encoding).toBe('utf-8')
  })

  it('forces GBK', async () => {
    const { decodeWithPreference } = await import('./encoding')
    const gbkBytes = Buffer.from([0xc8, 0xfd, 0xcc, 0xe5])
    const { text, encoding } = decodeWithPreference(gbkBytes, 'gbk')
    expect(text).toBe('三体')
    expect(encoding).toBe('gbk')
  })
})
