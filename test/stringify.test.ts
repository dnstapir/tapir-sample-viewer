// Ported from HighTable v0.26.4 (MIT): test/utils/stringify.test.ts.
import { describe, expect, it } from 'vitest'
import { stringify } from '../src/lib/stringify.ts'

describe('stringify', () => {
  it('returns strings unchanged', () => {
    expect(stringify('Hello')).toBe('Hello')
  })

  it('formats numbers with en-US grouping and at most 7 fraction digits', () => {
    expect(stringify(4200)).toBe('4,200')
    expect(stringify(1.23456789)).toBe('1.2345679')
    expect(stringify(0.0000001)).toBe('0.0000001')
    expect(stringify(0.00000001)).toBe('0')
    expect(stringify(-0)).toBe('-0')
    expect(stringify(1000.123456789)).toBe('1,000.1234568')
    expect(stringify(1.23e20)).toBe('123,000,000,000,000,000,000')
    expect(stringify(Infinity)).toBe('∞')
    expect(stringify(Number.NaN)).toBe('NaN')
  })

  it('formats bigints', () => {
    expect(stringify(123n)).toBe('123')
    expect(stringify(1234567890n)).toBe('1,234,567,890')
    expect(stringify(-1234567890n)).toBe('-1,234,567,890')
  })

  it('handles null, undefined, booleans, dates and errors', () => {
    expect(stringify(null)).toBe('null')
    expect(stringify(undefined)).toBe(undefined)
    expect(stringify(true)).toBe('true')
    expect(stringify(new Date('2020-01-01T00:00:00.000Z'))).toBe('2020-01-01T00:00:00.000Z')
    expect(stringify(new TypeError('invalid type'))).toBe('TypeError: invalid type')
  })

  it('indents arrays and nested objects', () => {
    expect(stringify([1, 2])).toBe('[\n  1,\n  2\n]')
    expect(stringify({ a: [1, { x: 'x' }], b: { c: 'hello' }, d: undefined })).toBe(
      '{\n  a: [\n    1,\n    {\n      x: x\n    }\n  ],\n  b: {\n    c: hello\n  }\n}',
    )
  })
})
