import type { ColumnChunk, ColumnMetaData, FileMetaData, RowGroup } from 'hyparquet'
import { beforeAll, describe, expect, it } from 'vitest'
import { columnCell, gridColumns, rowGroupStats, rowGroupTitle } from '../src/lib/grid.ts'
import type { Sample } from './samples.ts'
import { loadSamples } from './samples.ts'

function chunk(name: string, compressed: bigint, meta: Partial<ColumnMetaData> = {}): ColumnChunk {
  return {
    file_offset: 0n,
    meta_data: {
      path_in_schema: [name],
      total_compressed_size: compressed,
      total_uncompressed_size: compressed * 2n,
      num_values: 10n,
      ...meta,
    } as ColumnMetaData,
  }
}

function rowGroup(columns: ColumnChunk[], numRows = 10n): RowGroup {
  return { columns, num_rows: numRows, total_byte_size: 0n }
}

const metadata = {
  row_groups: [
    rowGroup([chunk('a', 100n), chunk('b', 300n)]),
    rowGroup([chunk('a', 200n), chunk('b', 50n)]),
  ],
} as FileMetaData

describe('gridColumns', () => {
  it('sums sizes per column and keeps the largest chunk', () => {
    expect(gridColumns(metadata)).toEqual({
      names: ['a', 'b'],
      totals: [300, 350],
      maxes: [200, 300],
      template: 'minmax(4px, 300fr) minmax(4px, 350fr)',
    })
  })
  it('falls back to colN when column metadata is missing', () => {
    const noMeta = { row_groups: [rowGroup([{ file_offset: 0n }])] } as FileMetaData
    expect(gridColumns(noMeta).names).toEqual(['col0'])
  })
  it('handles files without row groups', () => {
    expect(gridColumns({ row_groups: [] as RowGroup[] } as FileMetaData))
      .toEqual({ names: [], totals: [], maxes: [], template: '' })
  })
})

describe('rowGroupStats + rowGroupTitle', () => {
  it('counts data and dictionary pages', () => {
    const rg = rowGroup([
      chunk('a', 100n, { encoding_stats: [
        { page_type: 'DICTIONARY_PAGE', encoding: 'PLAIN', count: 1 },
        { page_type: 'DATA_PAGE', encoding: 'RLE_DICTIONARY', count: 2 },
      ] }),
      chunk('b', 300n, { encoding_stats: [{ page_type: 'DATA_PAGE_V2', encoding: 'PLAIN', count: 3 }] }),
    ])
    const stats = rowGroupStats(rg)
    expect(stats).toEqual({ numRows: 10, compressed: 400, uncompressed: 800, totalPages: 6, dataPages: 5, dictPages: 1 })
    expect(rowGroupTitle(2, stats)).toBe(
      'Row Group: 2\n10 rows\n400 bytes compressed\n800 bytes uncompressed\n6 pages (5 data, 1 dictionary)',
    )
  })
  it('omits the page line when there are no encoding stats', () => {
    const stats = rowGroupStats(rowGroup([chunk('a', 100n)]))
    expect(rowGroupTitle(0, stats)).toBe('Row Group: 0\n10 rows\n100 bytes compressed\n200 bytes uncompressed')
  })
  it('omits the dictionary count when there are no dictionary pages', () => {
    const stats = rowGroupStats(rowGroup([
      chunk('a', 100n, { encoding_stats: [{ page_type: 'DATA_PAGE', encoding: 'PLAIN', count: 2 }] }),
    ]))
    expect(rowGroupTitle(0, stats)).toMatch(/\n2 pages \(2 data\)$/)
  })
})

describe('columnCell', () => {
  it('scales the bar to the largest chunk of the column', () => {
    const rg = rowGroup([chunk('a', 100n)])
    expect(columnCell(1, rg, 0, 200)).toEqual({
      title: 'Row Group: 1\n10 rows\nColumn: a\n100 bytes\n10.00 bytes/cell',
      bytes: 100,
      widthPercent: 50,
    })
  })
  it('mentions the value count when it differs from the row count', () => {
    const rg = rowGroup([chunk('a', 100n, { num_values: 15n })])
    expect(columnCell(0, rg, 0, 100).title).toContain('\n15 values\n')
  })
  it('uses zero width when the column max is zero', () => {
    const rg = rowGroup([chunk('a', 0n)])
    expect(columnCell(0, rg, 0, 0).widthPercent).toBe(0)
  })
})

describe('grid of sample files', () => {
  let samples: Sample[] = []
  beforeAll(async () => {
    samples = await loadSamples()
  })

  it('has one name and total per column, summing to the compressed size', () => {
    for (const { metadata } of samples) {
      const { names, totals } = gridColumns(metadata)
      expect(names).toHaveLength(metadata.row_groups[0].columns.length)
      const compressed = metadata.row_groups.reduce((sum, rg) => sum + rowGroupStats(rg).compressed, 0)
      expect(totals.reduce((a, b) => a + b, 0)).toBe(compressed)
    }
  })

  it('never exceeds 100% bar width', () => {
    for (const { metadata } of samples) {
      const { maxes } = gridColumns(metadata)
      metadata.row_groups.forEach((rg, i) => {
        rg.columns.forEach((_, j) => {
          expect(columnCell(i, rg, j, maxes[j]).widthPercent).toBeLessThanOrEqual(100)
        })
      })
    }
  })
})
