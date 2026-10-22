import { describe, expect, it } from 'vitest'
import { formatFileSize } from '../src/lib/format.ts'

describe('formatFileSize', () => {
  it.each([
    [0, '0 b'],
    [1023, '1023 b'],
    [1024, '1.0 kb'],
    [10 * 1024, '10 kb'],
    [1536 * 1024, '1.5 mb'],
  ])('%i bytes -> %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected)
  })
  it('keeps one decimal when a value just below 10 rounds up (same as the original)', () => {
    expect(formatFileSize(10200)).toBe('10.0 kb')
  })
})
