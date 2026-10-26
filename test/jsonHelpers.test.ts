import { describe, expect, it } from 'vitest'
import { formatHexDump, isPrimitive, previewCount, shouldObjectCollapse, stringifyPrimitive } from '../src/lib/json.ts'

describe('isPrimitive', () => {
  it.each([
    [1, true],
    [1n, true],
    [true, true],
    [null, true],
    [undefined, true],
  ])('%s -> %s', (value, expected) => {
    expect(isPrimitive(value)).toBe(expected)
  })
  it.each([['text'], [[1]], [{ a: 1 }]])('%j is not primitive', value => {
    expect(isPrimitive(value)).toBe(false)
  })
})

describe('stringifyPrimitive', () => {
  it('handles bigint, undefined and JSON values', () => {
    expect(stringifyPrimitive(12n)).toBe('12')
    expect(stringifyPrimitive(undefined)).toBe('undefined')
    expect(stringifyPrimitive(null)).toBe('null')
    expect(stringifyPrimitive(1.5)).toBe('1.5')
  })
})

describe('shouldObjectCollapse', () => {
  it('collapses objects with only primitive values', () => {
    expect(shouldObjectCollapse({ a: 1, b: 2n })).toBe(true)
  })
  it('keeps objects with nested values or strings open', () => {
    expect(shouldObjectCollapse({ a: { b: 1 } })).toBe(false)
    expect(shouldObjectCollapse({ a: 'text' })).toBe(false)
  })
  it('collapses large collections', () => {
    expect(shouldObjectCollapse(Array.from({ length: 100 }, () => 'x'))).toBe(true)
  })
})

describe('previewCount', () => {
  it('shows every entry when they fit', () => {
    expect(
      previewCount(
        [
          [undefined, 1],
          [undefined, 2],
        ],
        20,
      ),
    ).toEqual({ count: 2, truncated: false })
  })
  it('stops before the entry that exceeds the width, counting keys and separators', () => {
    // "a: 1" = 4, ", " + "b: 2" = 10, ", " + "c: 3" = 16
    expect(
      previewCount(
        [
          ['a', 1],
          ['b', 2],
          ['c', 3],
        ],
        16,
      ),
    ).toEqual({ count: 2, truncated: true })
  })
  it('stops at the first non-primitive entry', () => {
    expect(
      previewCount(
        [
          [undefined, 1],
          [undefined, { x: 1 }],
          [undefined, 2],
        ],
        100,
      ),
    ).toEqual({ count: 1, truncated: true })
  })
})

describe('formatHexDump', () => {
  it('formats 16 bytes per line with offset, padded hex and printable ascii', () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('PAR1'), ...Array<number>(14).fill(0)])
    const lines = formatHexDump(bytes)
    expect(lines).toHaveLength(2)
    expect(lines[0].offset).toBe('00000000')
    expect(lines[0].hex.startsWith('50 41 52 31 00')).toBe(true)
    expect(lines[0].ascii).toBe('PAR1............')
    expect(lines[1]).toEqual({ offset: '00000010', hex: '00 00'.padEnd(47), ascii: '..' })
  })
})
