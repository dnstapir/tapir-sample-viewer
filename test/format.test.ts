import { describe, expect, it } from 'vitest'
import { formatFileSize } from '../src/lib/format.ts'

describe('formatFileSize', () => {
  it.each([
    [0, '0 b'],
    [1, '1 b'],
    [1023, '1023 b'],
    [1024, '1.0 kb'],
    [16283, '16 kb'],
    [10 * 1024, '10 kb'],
    [1536 * 1024, '1.5 mb'],
    [5 * 1024 ** 3, '5.0 gb'],
    [2 * 1024 ** 4, '2.0 tb'],
  ])('%i bytes -> %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected)
  })
})
