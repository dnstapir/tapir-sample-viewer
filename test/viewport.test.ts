import { describe, expect, it } from 'vitest'
import { computeSlice, maxCanvasHeight, overscanRows, rowHeight, scrollTopForRow } from '../src/lib/viewport.ts'

const headerHeight = 33
const viewportHeight = 33 + 10 * rowHeight // header + 10 rows

describe('computeSlice', () => {
  it('maps scrollTop to rows directly when the canvas is not capped', () => {
    const slice = computeSlice({ numRows: 1000, scrollTop: 100 * rowHeight, viewportHeight, headerHeight })
    expect(slice.canvasHeight).toBe(1000 * rowHeight + headerHeight)
    expect(slice.visibleStart).toBe(100)
    expect(slice.visibleEnd).toBe(111)
    expect(slice.renderStart).toBe(100 - overscanRows)
    expect(slice.renderEnd).toBe(111 + overscanRows)
    expect(slice.top).toBe(slice.renderStart * rowHeight)
  })

  it('clamps the rendered range to the data', () => {
    const slice = computeSlice({ numRows: 5, scrollTop: 0, viewportHeight, headerHeight })
    expect(slice).toMatchObject({ visibleStart: 0, visibleEnd: 5, renderStart: 0, renderEnd: 5, top: 0 })
  })

  it('caps the canvas for huge tables and still reaches the last row', () => {
    const numRows = 10_000_000
    const top = computeSlice({ numRows, scrollTop: 0, viewportHeight, headerHeight })
    expect(top.canvasHeight).toBe(maxCanvasHeight)
    expect(top.visibleStart).toBe(0)

    const bottom = computeSlice({ numRows, scrollTop: maxCanvasHeight - viewportHeight, viewportHeight, headerHeight })
    expect(bottom.visibleEnd).toBe(numRows)
    const lastRowBottom = bottom.top - (maxCanvasHeight - viewportHeight) + headerHeight + (numRows - bottom.renderStart) * rowHeight
    expect(lastRowBottom).toBeCloseTo(viewportHeight, 3)
  })
})

describe('scrollTopForRow', () => {
  const base = { numRows: 1000, scrollTop: 100 * rowHeight, viewportHeight, headerHeight }

  it('returns undefined when the row is already fully visible', () => {
    expect(scrollTopForRow({ ...base, row: 105 })).toBeUndefined()
  })
  it('scrolls up so the row is at the top', () => {
    expect(scrollTopForRow({ ...base, row: 50 })).toBe(50 * rowHeight)
  })
  it('scrolls down so the row is at the bottom', () => {
    expect(scrollTopForRow({ ...base, row: 200 })).toBe(201 * rowHeight - 10 * rowHeight)
  })
  it('round-trips through computeSlice for a capped canvas', () => {
    const numRows = 10_000_000
    const scrollTop = scrollTopForRow({ numRows, scrollTop: 0, viewportHeight, headerHeight, row: 5_000_000 })
    expect(scrollTop).toBeDefined()
    const slice = computeSlice({ numRows, scrollTop: scrollTop ?? 0, viewportHeight, headerHeight })
    expect(slice.visibleStart).toBeLessThanOrEqual(5_000_000)
    expect(slice.visibleEnd).toBeGreaterThan(5_000_000)
  })
})
