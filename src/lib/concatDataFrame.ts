import type { CustomEventTarget, DataFrame, DataFrameEvents } from 'hightable/dataframe'
import { checkSignal, validateFetchParams, validateGetCellParams, validateGetRowNumberParams } from 'hightable/dataframe'

export const fileColumn = 'File'

export interface ConcatPart {
  name: string
  df: DataFrame
}

/**
 * Unsorted stack of data frames with the same columns, with a leading File column holding each part's name.
 * Row numbers are the row numbers within each part's file.
 */
export function concatDataFrame(parts: ConcatPart[]): DataFrame {
  const starts: number[] = []
  let numRows = 0
  for (const part of parts) {
    starts.push(numRows)
    numRows += part.df.numRows
  }
  const columnDescriptors = [{ name: fileColumn }, ...parts[0]?.df.columnDescriptors ?? []]
  const data = { numRows, columnDescriptors }

  function locate(row: number): { part: ConcatPart, row: number } {
    let index = parts.length - 1
    while (starts[index] > row) index--
    return { part: parts[index], row: row - starts[index] }
  }

  // listeners go to every part, so events from any file reach the table
  const eventTarget: CustomEventTarget<DataFrameEvents> = {
    addEventListener(type, listener, options) {
      for (const part of parts) part.df.eventTarget?.addEventListener(type, listener, options)
    },
    removeEventListener(type, listener, options) {
      for (const part of parts) part.df.eventTarget?.removeEventListener(type, listener, options)
    },
    dispatchEvent(event) {
      parts[0]?.df.eventTarget?.dispatchEvent(event)
    },
  }

  return {
    ...data,
    eventTarget,
    getRowNumber({ row, orderBy }) {
      validateGetRowNumberParams({ row, orderBy, data })
      const located = locate(row)
      return located.part.df.getRowNumber({ row: located.row })
    },
    getCell({ row, column, orderBy }) {
      validateGetCellParams({ row, column, orderBy, data })
      const located = locate(row)
      if (column === fileColumn) return { value: located.part.name }
      return located.part.df.getCell({ row: located.row, column })
    },
    async fetch({ rowStart, rowEnd, columns, orderBy, signal }) {
      validateFetchParams({ rowStart, rowEnd, columns, orderBy, data })
      checkSignal(signal)
      const partColumns = columns?.filter(column => column !== fileColumn)
      const fetches: Promise<void>[] = []
      parts.forEach((part, i) => {
        const start = Math.max(rowStart - starts[i], 0)
        const end = Math.min(rowEnd - starts[i], part.df.numRows)
        if (start < end && part.df.fetch) {
          fetches.push(part.df.fetch({ rowStart: start, rowEnd: end, columns: partColumns, signal }))
        }
      })
      await Promise.all(fetches)
    },
  }
}
