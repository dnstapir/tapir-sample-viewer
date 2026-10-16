import type { ColumnChunk, FileMetaData, RowGroup } from 'hyparquet'

export interface GridColumns {
  names: string[]
  /** compressed bytes per column, summed over all row groups */
  totals: number[]
  /** largest compressed column chunk per column */
  maxes: number[]
  /** CSS `grid-template-columns` with widths proportional to `totals` */
  template: string
}

export interface RowGroupStats {
  numRows: number
  compressed: number
  uncompressed: number
  totalPages: number
  dataPages: number
  dictPages: number
}

export interface ColumnCell {
  name: string
  title: string
  /** bar width relative to the largest chunk of the same column */
  widthPercent: number
}

function columnName(column: ColumnChunk, index: number): string {
  return column.meta_data?.path_in_schema.join('.') ?? `col${index}`
}

/**
 * Column names (from the first row group) and per-column size totals.
 */
export function gridColumns(metadata: FileMetaData): GridColumns {
  const firstColumns = metadata.row_groups[0]?.columns ?? []
  const totals = Array<number>(firstColumns.length).fill(0)
  const maxes = Array<number>(firstColumns.length).fill(0)
  for (const rowGroup of metadata.row_groups) {
    for (let j = 0; j < rowGroup.columns.length; j++) {
      const size = Number(rowGroup.columns[j].meta_data?.total_compressed_size ?? 0n)
      totals[j] += size
      maxes[j] = Math.max(maxes[j], size)
    }
  }
  return {
    names: firstColumns.map(columnName),
    totals,
    maxes,
    template: totals.map(size => `minmax(4px, ${size}fr)`).join(' '),
  }
}

export function columnLabelTitle(name: string, totalBytes: number): string {
  return `Column: ${name}\n${totalBytes.toLocaleString()} bytes`
}

export function rowGroupStats(rowGroup: RowGroup): RowGroupStats {
  let compressed = 0
  let uncompressed = 0
  let totalPages = 0
  let dataPages = 0
  let dictPages = 0
  for (const { meta_data } of rowGroup.columns) {
    compressed += Number(meta_data?.total_compressed_size ?? 0n)
    uncompressed += Number(meta_data?.total_uncompressed_size ?? 0n)
    for (const { page_type, count } of meta_data?.encoding_stats ?? []) {
      totalPages += count
      if (page_type === 'DATA_PAGE' || page_type === 'DATA_PAGE_V2') dataPages += count
      if (page_type === 'DICTIONARY_PAGE') dictPages += count
    }
  }
  return { numRows: Number(rowGroup.num_rows), compressed, uncompressed, totalPages, dataPages, dictPages }
}

export function rowGroupTitle(index: number, stats: RowGroupStats): string {
  let title = `Row Group: ${index}\n${stats.numRows.toLocaleString()} rows`
  title += `\n${stats.compressed.toLocaleString()} bytes compressed`
  title += `\n${stats.uncompressed.toLocaleString()} bytes uncompressed`
  if (stats.totalPages > 0) {
    title += `\n${stats.totalPages.toLocaleString()} pages (${stats.dataPages} data`
    if (stats.dictPages > 0) title += `, ${stats.dictPages} dictionary`
    title += ')'
  }
  return title
}

export function columnCell(rowGroupIndex: number, rowGroup: RowGroup, columnIndex: number, columnMax: number): ColumnCell {
  const column = rowGroup.columns[columnIndex]
  const numRows = Number(rowGroup.num_rows)
  const numValues = Number(column.meta_data?.num_values ?? 0n)
  const size = Number(column.meta_data?.total_compressed_size ?? 0n)
  const name = columnName(column, columnIndex)
  let title = `Row Group: ${rowGroupIndex}\n${numRows} rows\nColumn: ${name}`
  if (numValues !== numRows) {
    title += `\n${numValues} values`
  }
  title += `\n${size.toLocaleString()} bytes`
  title += `\n${(size / numRows).toFixed(2)} bytes/cell`
  return {
    name,
    title,
    widthPercent: columnMax > 0 ? size / columnMax * 100 : 0,
  }
}
