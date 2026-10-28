import type { DataFrame } from './dataframe.ts'
import { checkSignal, validateFetchParams, validateGetCellParams, validateGetRowNumberParams } from './dataframe.ts'

export function consecutiveRanges(rows: readonly number[]): { rowStart: number; rowEnd: number }[] {
  const ranges: { rowStart: number; rowEnd: number }[] = []
  for (const row of rows) {
    const last = ranges.at(-1)
    if (last?.rowEnd === row) last.rowEnd++
    else ranges.push({ rowStart: row, rowEnd: row + 1 })
  }
  return ranges
}

export function filteredDataFrame(source: DataFrame, indexes: readonly number[]): DataFrame {
  const data = { numRows: indexes.length, columnDescriptors: source.columnDescriptors }
  return {
    ...data,
    eventTarget: source.eventTarget,
    getRowNumber({ row, orderBy }) {
      validateGetRowNumberParams({ row, orderBy, data })
      return source.getRowNumber({ row: indexes[row] })
    },
    getCell({ row, column, orderBy }) {
      validateGetCellParams({ row, column, orderBy, data })
      return source.getCell({ row: indexes[row], column })
    },
    async fetch({ rowStart, rowEnd, columns, orderBy, signal }) {
      validateFetchParams({ rowStart, rowEnd, columns, orderBy, data })
      checkSignal(signal)
      const fetch = source.fetch?.bind(source)
      if (!fetch) return
      await Promise.all(
        consecutiveRanges(indexes.slice(rowStart, rowEnd)).map(range => fetch({ ...range, columns, signal })),
      )
    },
  }
}
