import { describe, expect, it } from 'vitest'
import { adjustWidths, loadWidths, minColumnWidth, saveWidths } from '../src/lib/columnWidths.ts'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
  }
}

describe('loadWidths / saveWidths', () => {
  it('round-trips widths and removes the key when empty', () => {
    const storage = memoryStorage()
    saveWidths(storage, 'k', { a: 120 })
    expect(loadWidths(storage, 'k')).toEqual({ a: 120 })
    saveWidths(storage, 'k', {})
    expect(storage.data.has('k')).toBe(false)
  })
  it('ignores corrupt JSON, non-objects and invalid or too small widths', () => {
    expect(loadWidths(memoryStorage({ k: '{oops' }), 'k')).toEqual({})
    expect(loadWidths(memoryStorage({ k: '[1,2]' }), 'k')).toEqual({})
    expect(loadWidths(memoryStorage({ k: JSON.stringify({ a: 'x', b: -5, c: minColumnWidth - 1, d: 80 }) }), 'k')).toEqual({ d: 80 })
  })
})

describe('adjustWidths', () => {
  it('does nothing when the columns fit or the space is unknown', () => {
    expect(adjustWidths({ columns: ['a', 'b'], fixed: {}, measured: { a: 100, b: 100 }, maxTotalWidth: 1000 })).toEqual({})
    expect(adjustWidths({ columns: ['a'], fixed: {}, measured: { a: 5000 } })).toEqual({})
  })

  it('shrinks the widest measured column first, never fixed columns', () => {
    const adjusted = adjustWidths({
      columns: ['fixed', 'wide', 'narrow'],
      fixed: { fixed: 600 },
      measured: { wide: 600, narrow: 200 },
      maxTotalWidth: 1203, // 3px margin -> 1200 target, surplus 200
    })
    expect(adjusted).toEqual({ wide: 400 })
  })

  it('does not shrink a column below a third of its measured width or 150px', () => {
    const adjusted = adjustWidths({ columns: ['a'], fixed: {}, measured: { a: 900 }, maxTotalWidth: 103 })
    expect(adjusted).toEqual({ a: 300 })
  })

  it('shrinks equally wide columns together', () => {
    const adjusted = adjustWidths({ columns: ['a', 'b'], fixed: {}, measured: { a: 400, b: 400 }, maxTotalWidth: 603 })
    expect(adjusted).toEqual({ a: 300, b: 300 })
  })
})
