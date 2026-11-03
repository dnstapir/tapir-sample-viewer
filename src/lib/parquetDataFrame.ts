import type { AsyncBuffer, ColumnData, FileMetaData } from 'hyparquet'
import { parquetRead, parquetSchema } from 'hyparquet'
import type { DataFrame, DataFrameEvents, ResolvedValue } from './dataframe.ts'
import {
  checkSignal,
  createEventTarget,
  validateFetchParams,
  validateGetCellParams,
  validateGetRowNumberParams,
} from './dataframe.ts'

interface RowChunk {
  rowStart: number
  rowEnd: number
}

const maxChunkRows = 1000

// chunks never cross a row group boundary
export function planChunks(metadata: FileMetaData, maxRows = maxChunkRows): RowChunk[] {
  const chunks: RowChunk[] = []
  let groupStart = 0
  for (const rowGroup of metadata.row_groups) {
    const groupEnd = groupStart + Number(rowGroup.num_rows)
    for (let rowStart = groupStart; rowStart < groupEnd; rowStart += maxRows) {
      chunks.push({ rowStart, rowEnd: Math.min(rowStart + maxRows, groupEnd) })
    }
    groupStart = groupEnd
  }
  return chunks
}

export function parquetDataFrame(file: AsyncBuffer, metadata: FileMetaData): DataFrame {
  const columnDescriptors = parquetSchema(metadata).children.map(child => ({ name: child.element.name }))
  const numRows = Number(metadata.num_rows)
  const data = { numRows, columnDescriptors }
  const eventTarget = createEventTarget<DataFrameEvents>()

  const cells = new Map<string, ResolvedValue[]>(columnDescriptors.map(({ name }) => [name, []]))
  const chunks = planChunks(metadata).map(chunk => ({ ...chunk, reads: new Map<string, Promise<void>>() }))

  function onChunk({ columnName, columnData, rowStart }: ColumnData): void {
    const column = cells.get(columnName)
    if (!column) return
    for (let i = 0; i < columnData.length; i++) {
      const value: unknown = columnData[i]
      column[rowStart + i] ??= { value }
    }
    eventTarget.dispatchEvent(new CustomEvent('resolve'))
  }

  function readChunk(chunk: (typeof chunks)[number], columns: string[]): Promise<void> {
    const missing = columns.filter(column => !chunk.reads.has(column))
    if (missing.length > 0) {
      const read = parquetRead({
        file,
        metadata,
        rowStart: chunk.rowStart,
        rowEnd: chunk.rowEnd,
        columns: missing,
        onChunk,
      }).catch((error: unknown) => {
        // forget failed reads so a later fetch can retry
        for (const column of missing) chunk.reads.delete(column)
        throw error
      })
      for (const column of missing) chunk.reads.set(column, read)
    }
    return Promise.all(columns.map(column => chunk.reads.get(column) ?? Promise.resolve())).then(() => undefined)
  }

  return {
    numRows,
    columnDescriptors,
    eventTarget,
    getRowNumber({ row, orderBy }) {
      validateGetRowNumberParams({ row, orderBy, data })
      return { value: row }
    },
    getCell({ row, column, orderBy }) {
      validateGetCellParams({ row, column, orderBy, data })
      return cells.get(column)?.[row]
    },
    async fetch({ rowStart, rowEnd, columns, orderBy, signal }) {
      validateFetchParams({ rowStart, rowEnd, columns, orderBy, data })
      checkSignal(signal)
      if (!columns || columns.length === 0) return
      await Promise.all(
        chunks
          .filter(chunk => chunk.rowStart < rowEnd && chunk.rowEnd > rowStart)
          .map(chunk => readChunk(chunk, columns)),
      )
      checkSignal(signal)
    },
  }
}
