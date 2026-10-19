import type { DataFrame } from 'hightable/dataframe'
import { checkSignal, validateFetchParams, validateGetCellParams, validateGetRowNumberParams } from 'hightable/dataframe'

/** Splits ascending row indexes into runs of consecutive rows. */
export function consecutiveRanges(rows: readonly number[]): { rowStart: number, rowEnd: number }[] {
  const ranges: { rowStart: number, rowEnd: number }[] = []
  for (const row of rows) {
    const last = ranges.at(-1)
    if (last?.rowEnd === row) last.rowEnd++
    else ranges.push({ rowStart: row, rowEnd: row + 1 })
  }
  return ranges
}

/**
 * Unsorted view on the given source rows (ascending), e.g. search matches.
 * Row `i` is source row `indexes[i]`; row numbers and cells come from the source, which stays lazily loaded.
 */
export function filteredDataFrame(source: DataFrame, indexes: readonly number[]): DataFrame {
  const data = { numRows: indexes.length, columnDescriptors: source.columnDescriptors }
  return {
    ...data,
    metadata: source.metadata,
    // events report new source cells, which are also new cells of this view
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
      await Promise.all(consecutiveRanges(indexes.slice(rowStart, rowEnd))
        .map(range => fetch({ ...range, columns, signal })))
    },
  }
}
