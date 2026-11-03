import type { AsyncBuffer, FileMetaData, RowGroup } from 'hyparquet'
import { parquetReadObjects } from 'hyparquet'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { parquetDataFrame, planChunks } from '../src/lib/parquetDataFrame.ts'
import { sortableDataFrame } from '../src/lib/sortableDataFrame.ts'
import type { Sample } from './samples.ts'
import { loadSamples } from './samples.ts'

function countingBuffer(file: AsyncBuffer): { file: AsyncBuffer; reads: () => number } {
  let count = 0
  return {
    file: {
      byteLength: file.byteLength,
      slice(start, end) {
        count++
        return file.slice(start, end)
      },
    },
    reads: () => count,
  }
}

describe('planChunks', () => {
  it('splits row groups into chunks without crossing row group boundaries', () => {
    const metadata = {
      row_groups: [{ num_rows: 2500n }, { num_rows: 700n }] as RowGroup[],
    } as FileMetaData
    expect(planChunks(metadata, 1000)).toEqual([
      { rowStart: 0, rowEnd: 1000 },
      { rowStart: 1000, rowEnd: 2000 },
      { rowStart: 2000, rowEnd: 2500 },
      { rowStart: 2500, rowEnd: 3200 },
    ])
  })
  it('returns no chunks for an empty file', () => {
    expect(planChunks({ row_groups: [] as RowGroup[] } as FileMetaData)).toEqual([])
  })
})

describe('parquetDataFrame on sample files', () => {
  let sample: Sample
  let file: AsyncBuffer
  let expected: Record<string, unknown>[]
  beforeAll(async () => {
    ;[sample] = await loadSamples()
    file = await asyncBufferFromFile(sample.path)
    expected = await parquetReadObjects({ file, metadata: sample.metadata })
  })

  it('exposes all top-level columns and the row count', () => {
    const df = parquetDataFrame(file, sample.metadata)
    expect(df.numRows).toBe(Number(sample.metadata.num_rows))
    expect(df.columnDescriptors.map(c => c.name)).toEqual(Object.keys(expected[0]))
  })

  it('returns no cells before fetch, and only the fetched columns after', async () => {
    const df = parquetDataFrame(file, sample.metadata)
    expect(df.getCell({ row: 0, column: 'label1' })).toBeUndefined()

    await df.fetch?.({ rowStart: 0, rowEnd: 10, columns: ['label0', 'label1'] })

    for (let row = 0; row < 10; row++) {
      expect(df.getCell({ row, column: 'label0' })).toEqual({ value: expected[row].label0 })
      expect(df.getCell({ row, column: 'label1' })).toEqual({ value: expected[row].label1 })
    }
    expect(df.getCell({ row: 0, column: 'label2' })).toBeUndefined()
  })

  it('decodes every column identically to parquetReadObjects', async () => {
    const df = parquetDataFrame(file, sample.metadata)
    const columns = df.columnDescriptors.map(c => c.name)
    await df.fetch?.({ rowStart: 0, rowEnd: df.numRows, columns })
    for (let row = 0; row < df.numRows; row++) {
      for (const column of columns) {
        expect(df.getCell({ row, column })?.value).toEqual(expected[row][column])
      }
    }
  })

  it('dispatches resolve when cells arrive', async () => {
    const df = parquetDataFrame(file, sample.metadata)
    let resolved = 0
    df.eventTarget?.addEventListener('resolve', () => {
      resolved++
    })
    await df.fetch?.({ rowStart: 0, rowEnd: 1, columns: ['label1'] })
    expect(resolved).toBeGreaterThan(0)
  })

  it('does not read the file again for columns that are already fetched or fetching', async () => {
    const counter = countingBuffer(file)
    const df = parquetDataFrame(counter.file, sample.metadata)
    await Promise.all([
      df.fetch?.({ rowStart: 0, rowEnd: 5, columns: ['label1'] }),
      df.fetch?.({ rowStart: 0, rowEnd: 5, columns: ['label1'] }),
    ])
    const afterFirst = counter.reads()
    await df.fetch?.({ rowStart: 0, rowEnd: 5, columns: ['label1'] })
    expect(counter.reads()).toBe(afterFirst)
  })

  it('rejects when the signal is already aborted', async () => {
    const df = parquetDataFrame(file, sample.metadata)
    const controller = new AbortController()
    controller.abort()
    await expect(
      df.fetch?.({ rowStart: 0, rowEnd: 1, columns: ['label1'], signal: controller.signal }),
    ).rejects.toThrow()
  })

  it('retries a chunk after a failed read', async () => {
    let fail = true
    const flaky: AsyncBuffer = {
      byteLength: file.byteLength,
      slice(start, end) {
        if (fail) return Promise.reject(new Error('network'))
        return file.slice(start, end)
      },
    }
    const df = parquetDataFrame(flaky, sample.metadata)
    await expect(df.fetch?.({ rowStart: 0, rowEnd: 1, columns: ['label1'] })).rejects.toThrow('network')
    fail = false
    await df.fetch?.({ rowStart: 0, rowEnd: 1, columns: ['label1'] })
    expect(df.getCell({ row: 0, column: 'label1' })).toEqual({ value: expected[0].label1 })
  })

  it('sorts via sortableDataFrame', async () => {
    const df = sortableDataFrame(parquetDataFrame(file, sample.metadata))
    const orderBy = [{ column: 'label1', direction: 'ascending' as const }]
    await df.fetch?.({ rowStart: 0, rowEnd: df.numRows, columns: ['label1'], orderBy })
    const values = Array.from(
      { length: df.numRows },
      (_, row): unknown => df.getCell({ row, column: 'label1', orderBy })?.value,
    )
    expect(values).toEqual(expected.map(r => r.label1).sort())
  })
})
