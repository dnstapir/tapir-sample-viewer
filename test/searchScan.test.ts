import type { AsyncBuffer } from 'hyparquet'
import { parquetReadObjects } from 'hyparquet'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { concatDataFrame, fileColumn } from '../src/lib/concatDataFrame.ts'
import type { DataSet } from '../src/lib/dataset.ts'
import { consecutiveRanges, filteredDataFrame } from '../src/lib/filteredDataFrame.ts'
import { parquetDataFrame } from '../src/lib/parquetDataFrame.ts'
import type { SearchPredicate } from '../src/lib/search.ts'
import { defaultSearchOptions, parseSearch } from '../src/lib/search.ts'
import { scanRows, searchAll, searchDataSet } from '../src/lib/searchScan.ts'
import { sortableDataFrame } from '../src/lib/sortableDataFrame.ts'
import type { Sample } from './samples.ts'
import { loadSamples } from './samples.ts'

interface Loaded {
  sample: Sample
  file: AsyncBuffer
  rows: Record<string, unknown>[]
  dataSet: DataSet
}

function predicate(query: string, options = defaultSearchOptions): SearchPredicate {
  const parsed = parseSearch(query, options)
  if (parsed.kind !== 'search') throw new Error(`expected a search, got ${parsed.kind}`)
  return parsed.predicate
}

describe('search on sample files', () => {
  let loaded: Loaded[]
  beforeAll(async () => {
    loaded = await Promise.all(
      (await loadSamples()).map(async sample => {
        const file = await asyncBufferFromFile(sample.path)
        const rows = await parquetReadObjects({ file, metadata: sample.metadata })
        const df = parquetDataFrame(file, sample.metadata)
        const dataSet = {
          name: sample.name,
          url: sample.path,
          byteLength: sample.byteLength,
          metadata: sample.metadata,
          file,
          rows: df,
          df: sortableDataFrame(df),
        }
        return { sample, file, rows, dataSet }
      }),
    )
  })

  function bruteForce({ rows }: Loaded, search: SearchPredicate): number[] {
    return rows.flatMap((row, i) => (search.matches(row) ? [i] : []))
  }

  it('scanRows finds the same rows as filtering all rows', async () => {
    const [first] = loaded
    const [row] = first.rows
    const domain = [row.label2, row.label1, row.label0].filter(Boolean).join('.')
    const searches = [
      predicate(domain),
      predicate(domain, { ...defaultSearchOptions, match: 'exact' }),
      predicate(String(row.label1).slice(0, 2)),
      predicate('se', { ...defaultSearchOptions, mode: 'columns', columns: ['label0'] }),
      predicate('xx-no-match', { ...defaultSearchOptions, mode: 'columns', columns: ['label1', 'label9'] }),
      predicate(String(row.label1), { ...defaultSearchOptions, mode: 'columns', columns: ['label1'], match: 'exact' }),
    ]
    for (const item of loaded) {
      for (const search of searches) {
        const found = await scanRows({ file: item.file, metadata: item.sample.metadata, predicate: search })
        expect(found).toEqual(bruteForce(item, search))
      }
    }
    expect(await scanRows({ file: first.file, metadata: first.sample.metadata, predicate: searches[0] })).toContain(0)
  })

  it('scanRows rejects when aborted', async () => {
    const [first] = loaded
    const controller = new AbortController()
    controller.abort()
    await expect(
      scanRows({
        file: first.file,
        metadata: first.sample.metadata,
        predicate: predicate('se'),
        signal: controller.signal,
      }),
    ).rejects.toThrow()
  })

  it('searchDataSet returns a view with original row numbers and lazily fetched cells', async () => {
    const [first] = loaded
    const search = predicate(String(first.rows[0].label1))
    const expected = bruteForce(first, search)
    const result = await searchDataSet(first.dataSet, search)
    expect(result.matches).toBe(expected.length)
    expect(result.df.numRows).toBe(expected.length)
    await result.df.fetch?.({ rowStart: 0, rowEnd: result.df.numRows, columns: ['label1'] })
    for (let i = 0; i < expected.length; i++) {
      expect(result.df.getRowNumber({ row: i })?.value).toBe(expected[i])
      expect(result.df.getCell({ row: i, column: 'label1' })?.value).toBe(first.rows[expected[i]].label1)
    }
  })

  it('searchAll stacks matches of every file with a File column and reports progress', async () => {
    const search = predicate('se', { ...defaultSearchOptions, mode: 'columns', columns: ['label0'], extended: true })
    const onProgress = vi.fn()
    const result = await searchAll({
      entries: loaded.map(item => ({ name: item.dataSet.name, url: item.dataSet.url })),
      load: entry => {
        const item = loaded.find(candidate => candidate.dataSet.url === entry.url)
        return item ? Promise.resolve(item.dataSet) : Promise.reject(new Error(`unknown ${entry.url}`))
      },
      predicate: search,
      onProgress,
    })
    const expected = loaded.flatMap(item => bruteForce(item, search).map(row => ({ file: item.dataSet.name, row })))
    expect(result.matches).toBe(expected.length)
    expect(result.files).toBe(loaded.length)
    expect(onProgress).toHaveBeenLastCalledWith(loaded.length, loaded.length)
    expect(result.df.columnDescriptors[0].name).toBe(fileColumn)
    const actual = Array.from({ length: result.df.numRows }, (_, i) => ({
      file: result.df.getCell({ row: i, column: fileColumn })?.value as unknown,
      row: result.df.getRowNumber({ row: i })?.value,
    }))
    expect(actual).toEqual(expected)
  })
})

describe('consecutiveRanges', () => {
  it('groups consecutive rows', () => {
    expect(consecutiveRanges([0, 1, 2, 5, 7, 8])).toEqual([
      { rowStart: 0, rowEnd: 3 },
      { rowStart: 5, rowEnd: 6 },
      { rowStart: 7, rowEnd: 9 },
    ])
    expect(consecutiveRanges([])).toEqual([])
  })
})

describe('filteredDataFrame and concatDataFrame', () => {
  let samples: Sample[]
  let files: AsyncBuffer[]
  beforeAll(async () => {
    samples = (await loadSamples()).slice(0, 2)
    files = await Promise.all(samples.map(sample => asyncBufferFromFile(sample.path)))
  })

  it('filteredDataFrame fetches only the source rows it shows', async () => {
    const source = parquetDataFrame(files[0], samples[0].metadata)
    const fetch = vi.spyOn(source, 'fetch')
    const view = filteredDataFrame(source, [1, 2, 4])
    await view.fetch?.({ rowStart: 1, rowEnd: 3, columns: ['label1'] })
    expect(fetch.mock.calls.map(([params]) => [params.rowStart, params.rowEnd])).toEqual([
      [2, 3],
      [4, 5],
    ])
    expect(view.getCell({ row: 1, column: 'label1' })).toEqual(source.getCell({ row: 2, column: 'label1' }))
    expect(view.getRowNumber({ row: 2 })?.value).toBe(4)
  })

  it('concatDataFrame maps rows across parts, including empty parts', async () => {
    const [a, b] = samples.map((sample, i) => parquetDataFrame(files[i], sample.metadata))
    const df = concatDataFrame([
      { name: 'a', df: filteredDataFrame(a, [0, 3]) },
      { name: 'empty', df: filteredDataFrame(b, []) },
      { name: 'b', df: filteredDataFrame(b, [1]) },
    ])
    expect(df.numRows).toBe(3)
    await df.fetch?.({ rowStart: 0, rowEnd: 3, columns: [fileColumn, 'label1'] })
    expect([0, 1, 2].map(row => df.getCell({ row, column: fileColumn })?.value as unknown)).toEqual(['a', 'a', 'b'])
    expect([0, 1, 2].map(row => df.getRowNumber({ row })?.value)).toEqual([0, 3, 1])
    expect(df.getCell({ row: 2, column: 'label1' })).toEqual(b.getCell({ row: 1, column: 'label1' }))
  })

  it('concatDataFrame forwards event listeners to every part', () => {
    const [a, b] = samples.map((sample, i) => parquetDataFrame(files[i], sample.metadata))
    const df = concatDataFrame([
      { name: 'a', df: a },
      { name: 'b', df: b },
    ])
    const listener = vi.fn()
    df.eventTarget?.addEventListener('resolve', listener)
    b.eventTarget?.dispatchEvent(new CustomEvent('resolve'))
    expect(listener).toHaveBeenCalledTimes(1)
    df.eventTarget?.removeEventListener('resolve', listener)
    a.eventTarget?.dispatchEvent(new CustomEvent('resolve'))
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
