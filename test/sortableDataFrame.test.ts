// Ported from HighTable v0.26.4 (MIT): test/helpers/dataframe/{index,sort}.test.ts.
import { describe, expect, it } from 'vitest'
import type { DataFrame, DataFrameEvents } from '../src/lib/dataframe.ts'
import { createEventTarget, validateGetCellParams, validateGetRowNumberParams } from '../src/lib/dataframe.ts'
import { sortableDataFrame } from '../src/lib/sortableDataFrame.ts'

type Row = Record<string, unknown>

// minimal in-memory DataFrame (upstream tests use HighTable's arrayDataFrame)
function arrayFrame(rows: Row[]): DataFrame & { push(row: Row): void } {
  const columnDescriptors = Object.keys(rows[0] ?? {}).map(name => ({ name }))
  const eventTarget = createEventTarget<DataFrameEvents>()
  return {
    columnDescriptors,
    eventTarget,
    get numRows() {
      return rows.length
    },
    getRowNumber({ row, orderBy }) {
      validateGetRowNumberParams({ row, orderBy, data: { numRows: rows.length, columnDescriptors } })
      return { value: row }
    },
    getCell({ row, column, orderBy }) {
      validateGetCellParams({ row, column, orderBy, data: { numRows: rows.length, columnDescriptors } })
      return { value: rows[row]?.[column] }
    },
    push(row) {
      rows.push(row)
      eventTarget.dispatchEvent(new CustomEvent('numrowschange'))
    },
  }
}

function people() {
  return arrayFrame([
    { id: 3, name: 'Charlie', age: 25 },
    { id: 1, name: 'Alice', age: 30 },
    { id: 2, name: 'Bob', age: 20 },
    { id: 4, name: 'Dani', age: 20 },
  ])
}

function names(df: DataFrame, orderBy?: { column: string; direction: 'ascending' | 'descending' }[]) {
  return Array.from({ length: df.numRows }, (_, row) => df.getCell({ row, column: 'name', orderBy })?.value)
}

describe('sortableDataFrame', () => {
  it('makes all columns sortable and keeps names and numRows', () => {
    const data = people()
    const df = sortableDataFrame(data)
    expect(df.columnDescriptors.every(({ sortable }) => sortable)).toBe(true)
    expect(df.columnDescriptors.map(({ name }) => name)).toEqual(['id', 'name', 'age'])
    expect(df.numRows).toBe(data.numRows)
  })

  it('makes only the given columns sortable', () => {
    const df = sortableDataFrame(people(), { sortableColumns: new Set(['age']) })
    expect(df.columnDescriptors.map(({ name, sortable }) => [name, sortable])).toEqual([
      ['id', false],
      ['name', false],
      ['age', true],
    ])
  })

  it('returns data in file order without orderBy or with an empty orderBy', () => {
    const df = sortableDataFrame(people())
    expect(names(df)).toEqual(['Charlie', 'Alice', 'Bob', 'Dani'])
    expect(names(df, [])).toEqual(['Charlie', 'Alice', 'Bob', 'Dani'])
  })

  it('sorts ascending, keeping file order for ties', async () => {
    const df = sortableDataFrame(people())
    const orderBy = [{ column: 'age', direction: 'ascending' as const }]
    await df.fetch?.({ orderBy, rowStart: 0, rowEnd: 4, columns: ['name'] })
    expect(names(df, orderBy)).toEqual(['Bob', 'Dani', 'Charlie', 'Alice'])
    expect(df.getRowNumber({ row: 0, orderBy })?.value).toBe(2)
  })

  it('sorts descending, keeping file order for ties', async () => {
    const df = sortableDataFrame(people())
    const orderBy = [{ column: 'age', direction: 'descending' as const }]
    await df.fetch?.({ orderBy, rowStart: 0, rowEnd: 4, columns: ['name'] })
    expect(names(df, orderBy)).toEqual(['Alice', 'Charlie', 'Bob', 'Dani'])
  })

  it('sorts by several columns', async () => {
    const df = sortableDataFrame(people())
    const orderBy = [
      { column: 'age', direction: 'ascending' as const },
      { column: 'name', direction: 'descending' as const },
    ]
    await df.fetch?.({ orderBy, rowStart: 0, rowEnd: 4, columns: ['name'] })
    expect(names(df, orderBy)).toEqual(['Dani', 'Bob', 'Charlie', 'Alice'])
  })

  it('returns undefined for a sorted row before it is fetched', () => {
    const df = sortableDataFrame(people())
    const orderBy = [{ column: 'age', direction: 'ascending' as const }]
    expect(df.getCell({ row: 0, column: 'name', orderBy })).toBeUndefined()
    expect(df.getRowNumber({ row: 0, orderBy })).toBeUndefined()
  })

  it('rejects an unknown orderBy column', async () => {
    const df = sortableDataFrame(people())
    const orderBy = [{ column: 'invalid', direction: 'ascending' as const }]
    await expect(df.fetch?.({ orderBy, rowStart: 0, rowEnd: 4, columns: ['name'] })).rejects.toThrow(
      'Unsortable columns in orderBy field: invalid',
    )
  })

  it('rejects with an AbortError when the signal is aborted', async () => {
    const df = sortableDataFrame(people())
    const controller = new AbortController()
    controller.abort()
    const orderBy = [{ column: 'age', direction: 'ascending' as const }]
    await expect(df.fetch?.({ orderBy, rowStart: 0, rowEnd: 4, signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('keeps the data sorted when rows are added', async () => {
    const data = people()
    const df = sortableDataFrame(data)
    const orderBy = [{ column: 'age', direction: 'ascending' as const }]
    await df.fetch?.({ orderBy, rowStart: 0, rowEnd: df.numRows })
    const changed = new Promise<void>(resolve => {
      df.eventTarget?.addEventListener('numrowschange', () => resolve())
    })
    data.push({ id: 5, name: 'Eve', age: 10 })
    await changed
    expect(names(df, orderBy)).toEqual(['Eve', 'Bob', 'Dani', 'Charlie', 'Alice'])
  })
})
