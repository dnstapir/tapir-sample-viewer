import type { ColumnChunk, ColumnMetaData, FileMetaData, RowGroup } from 'hyparquet'
import { beforeAll, describe, expect, it } from 'vitest'
import { collectLayoutItems, columnPages, getColumnRange, metadataRange } from '../src/lib/layout.ts'
import type { Sample } from './samples.ts'
import { loadSamples } from './samples.ts'

function columnMeta(fields: Partial<ColumnMetaData>): ColumnMetaData {
  return { path_in_schema: ['c'], total_compressed_size: 0n, data_page_offset: 0n, ...fields } as ColumnMetaData
}

describe('getColumnRange', () => {
  it('starts at the dictionary page when it precedes the data page', () => {
    expect(getColumnRange(columnMeta({ dictionary_page_offset: 4n, data_page_offset: 100n, total_compressed_size: 200n })))
      .toEqual([4n, 204n])
  })
  it('starts at the data page when there is no dictionary page', () => {
    expect(getColumnRange(columnMeta({ data_page_offset: 50n, total_compressed_size: 10n })))
      .toEqual([50n, 60n])
  })
  it('ignores a zero dictionary offset', () => {
    expect(getColumnRange(columnMeta({ dictionary_page_offset: 0n, data_page_offset: 50n, total_compressed_size: 10n })))
      .toEqual([50n, 60n])
  })
})

describe('columnPages', () => {
  it('splits a column chunk into contiguous pages in file order', () => {
    expect(columnPages(columnMeta({ dictionary_page_offset: 4n, data_page_offset: 100n, total_compressed_size: 200n })))
      .toEqual([
        { name: 'Dictionary', start: 4n, end: 100n },
        { name: 'Data', start: 100n, end: 204n },
      ])
  })
  it('returns a single data page without dictionary', () => {
    expect(columnPages(columnMeta({ data_page_offset: 50n, total_compressed_size: 10n })))
      .toEqual([{ name: 'Data', start: 50n, end: 60n }])
  })
})

describe('collectLayoutItems', () => {
  function chunk(start: bigint, extra: Partial<ColumnChunk> = {}): ColumnChunk {
    return {
      file_offset: 0n,
      meta_data: columnMeta({ path_in_schema: ['a'], data_page_offset: start, total_compressed_size: 10n }),
      ...extra,
    }
  }

  it('sorts row groups and indexes by start offset', () => {
    const metadata = {
      row_groups: [
        { columns: [chunk(4n, { column_index_offset: 100n, column_index_length: 5 })], total_byte_size: 10n },
        { columns: [chunk(14n, { offset_index_offset: 90n, offset_index_length: 3 })], total_byte_size: 10n },
      ] as RowGroup[],
    } as FileMetaData

    const items = collectLayoutItems(metadata)
    expect(items.map(item => [item.type, item.start])).toEqual([
      ['rowgroup', 4n],
      ['rowgroup', 14n],
      ['index', 90n],
      ['index', 100n],
    ])
    expect(items[2]).toEqual({ type: 'index', start: 90n, end: 93n, name: 'OffsetIndex\nRowGroup 1, Column \'a\'' })
    expect(items[3]).toEqual({ type: 'index', start: 100n, end: 105n, name: 'ColumnIndex\nRowGroup 0, Column \'a\'' })
  })
})

describe('layout of sample files', () => {
  let samples: Sample[] = []
  beforeAll(async () => {
    samples = await loadSamples()
  })

  it('starts the first row group right after the leading PAR1 magic', () => {
    for (const { metadata } of samples) {
      expect(collectLayoutItems(metadata)[0]).toMatchObject({ type: 'rowgroup', start: 4n })
    }
  })

  it('has contiguous pages per column, matching total_compressed_size', () => {
    for (const { metadata } of samples) {
      for (const rowGroup of metadata.row_groups) {
        for (const { meta_data } of rowGroup.columns) {
          if (!meta_data) continue
          const pages = columnPages(meta_data)
          for (let i = 1; i < pages.length; i++) {
            expect(pages[i].start).toBe(pages[i - 1].end)
          }
          expect(pages[pages.length - 1].end - pages[0].start).toBe(meta_data.total_compressed_size)
        }
      }
    }
  })

  it('ends all data before the footer metadata', () => {
    for (const { metadata, byteLength } of samples) {
      const { start } = metadataRange(byteLength, metadata)
      const lastEnd = metadata.row_groups
        .flatMap(rowGroup => rowGroup.columns)
        .map(column => column.meta_data ? getColumnRange(column.meta_data)[1] : 0n)
        .reduce((a, b) => a > b ? a : b, 0n)
      expect(lastEnd).toBeLessThanOrEqual(BigInt(start))
    }
  })
})
