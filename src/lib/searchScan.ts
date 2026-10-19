import type { DataFrame } from 'hightable/dataframe'
import { checkSignal, sortableDataFrame } from 'hightable/dataframe'
import type { AsyncBuffer, FileMetaData } from 'hyparquet'
import { parquetReadObjects, parquetSchema } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { concatDataFrame } from './concatDataFrame.ts'
import type { DataSet, DataSetEntry } from './dataset.ts'
import { filteredDataFrame } from './filteredDataFrame.ts'
import type { SearchPredicate } from './search.ts'

export interface SearchResult {
  df: DataFrame
  /** table caption, also the key for saved column widths */
  name: string
  matches: number
  /** number of files searched */
  files: number
}

/**
 * Indexes of the rows matching the predicate, in file order.
 * Reads only the predicate's columns, one row group at a time; values are discarded.
 */
export async function scanRows({ file, metadata, predicate, signal }: {
  file: AsyncBuffer
  metadata: FileMetaData
  predicate: SearchPredicate
  signal?: AbortSignal
}): Promise<number[]> {
  const available = new Set(parquetSchema(metadata).children.map(child => child.element.name))
  // missing columns read as empty
  const columns = predicate.columns.filter(column => available.has(column))
  const indexes: number[] = []
  let rowStart = 0
  for (const rowGroup of metadata.row_groups) {
    checkSignal(signal)
    const rowEnd = rowStart + Number(rowGroup.num_rows)
    if (columns.length > 0) {
      const rows = await parquetReadObjects({ file, metadata, columns, rowStart, rowEnd, compressors })
      rows.forEach((row, i) => {
        if (predicate.matches(row)) indexes.push(rowStart + i)
      })
    }
    rowStart = rowEnd
  }
  checkSignal(signal)
  return indexes
}

/** Matching rows of one data set, sortable. */
export async function searchDataSet(dataSet: DataSet, predicate: SearchPredicate, signal?: AbortSignal): Promise<SearchResult> {
  const indexes = await scanRows({ file: dataSet.file, metadata: dataSet.metadata, predicate, signal })
  return {
    df: sortableDataFrame(filteredDataFrame(dataSet.rows, indexes)),
    name: dataSet.name,
    matches: indexes.length,
    files: 1,
  }
}

/** Matching rows of all data sets in one table with a File column, sortable. */
export async function searchAll({ entries, load, predicate, signal, onProgress }: {
  entries: DataSetEntry[]
  load: (entry: DataSetEntry) => Promise<DataSet>
  predicate: SearchPredicate
  signal?: AbortSignal
  onProgress?: (file: number, files: number) => void
}): Promise<SearchResult> {
  const parts = []
  for (const [i, entry] of entries.entries()) {
    checkSignal(signal)
    onProgress?.(i + 1, entries.length)
    const dataSet = await load(entry)
    const indexes = await scanRows({ file: dataSet.file, metadata: dataSet.metadata, predicate, signal })
    parts.push({ name: dataSet.name, df: filteredDataFrame(dataSet.rows, indexes) })
  }
  const df = concatDataFrame(parts)
  return { df: sortableDataFrame(df), name: 'Search results in all files', matches: df.numRows, files: entries.length }
}
