import type { ColumnChunk, ColumnMetaData, FileMetaData } from 'hyparquet'

interface RowGroupItem {
  type: 'rowgroup'
  start: bigint
  groupIndex: number
  columns: ColumnChunk[]
  totalByteSize: bigint
}

interface IndexItem {
  type: 'index'
  start: bigint
  end: bigint
  name: string
}

export type LayoutItem = RowGroupItem | IndexItem

interface ByteRange {
  name: string
  start: bigint
  end: bigint
}

export function metadataRange(byteLength: number, metadata: FileMetaData): { start: number, end: number } {
  return {
    start: byteLength - metadata.metadata_length - 4,
    end: byteLength - 4,
  }
}

export function collectLayoutItems(metadata: FileMetaData): LayoutItem[] {
  const items: LayoutItem[] = []

  for (let groupIndex = 0; groupIndex < metadata.row_groups.length; groupIndex++) {
    const rowGroup = metadata.row_groups[groupIndex]
    let start = BigInt(Number.MAX_SAFE_INTEGER)
    for (const column of rowGroup.columns) {
      if (column.meta_data) {
        const [colStart] = getColumnRange(column.meta_data)
        if (colStart < start) start = colStart
      }
    }
    items.push({
      type: 'rowgroup',
      start,
      groupIndex,
      columns: rowGroup.columns,
      totalByteSize: rowGroup.total_byte_size,
    })
  }

  for (let groupIndex = 0; groupIndex < metadata.row_groups.length; groupIndex++) {
    const rowGroup = metadata.row_groups[groupIndex]
    for (const column of rowGroup.columns) {
      const columnName = column.meta_data?.path_in_schema.join('.')
      if (column.column_index_offset) {
        items.push({
          type: 'index',
          start: column.column_index_offset,
          end: column.column_index_offset + BigInt(column.column_index_length ?? 0),
          name: `ColumnIndex\nRowGroup ${groupIndex}, Column '${columnName}'`,
        })
      }
      if (column.offset_index_offset) {
        items.push({
          type: 'index',
          start: column.offset_index_offset,
          end: column.offset_index_offset + BigInt(column.offset_index_length ?? 0),
          name: `OffsetIndex\nRowGroup ${groupIndex}, Column '${columnName}'`,
        })
      }
    }
  }

  items.sort((a, b) => Number(a.start - b.start))
  return items
}

export function columnPages(columnMetadata: ColumnMetaData): ByteRange[] {
  const { dictionary_page_offset, data_page_offset, index_page_offset } = columnMetadata
  const end = getColumnRange(columnMetadata)[1]
  const offsets = [
    { name: 'Dictionary', offset: dictionary_page_offset },
    { name: 'Data', offset: data_page_offset },
    { name: 'Index', offset: index_page_offset },
    { name: 'End', offset: end },
  ]
    .filter((page): page is { name: string, offset: bigint } => page.offset !== undefined)
    .sort((a, b) => Number(a.offset - b.offset))

  return offsets.slice(0, -1).map(({ name, offset }, index) => ({
    name,
    start: offset,
    end: offsets[index + 1].offset,
  }))
}

// copied from hyparquet, where it is not exported
export function getColumnRange({ dictionary_page_offset, data_page_offset, total_compressed_size }: ColumnMetaData): [bigint, bigint] {
  let columnOffset = dictionary_page_offset
  if (!columnOffset || data_page_offset < columnOffset) {
    columnOffset = data_page_offset
  }
  return [columnOffset, columnOffset + total_compressed_size]
}
