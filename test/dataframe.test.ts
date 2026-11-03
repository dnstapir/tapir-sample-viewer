// Ported from HighTable v0.26.4 (MIT): test/helpers/dataframe/helpers.test.ts and test/helpers/sort.test.ts.
import { describe, expect, it } from 'vitest'
import {
  checkSignal,
  computeRanks,
  partitionOrderBy,
  toggleColumn,
  validateColumn,
  validateFetchParams,
  validateOrderByAgainstSortableColumns,
  validateRow,
} from '../src/lib/dataframe.ts'

const nameAsc = { column: 'name', direction: 'ascending' as const }
const nameDesc = { column: 'name', direction: 'descending' as const }
const ageAsc = { column: 'age', direction: 'ascending' as const }
const idAsc = { column: 'id', direction: 'ascending' as const }

describe('validateRow', () => {
  it('accepts valid row indices', () => {
    expect(() => validateRow({ row: 0, data: { numRows: 5 } })).not.toThrow()
    expect(() => validateRow({ row: 4, data: { numRows: 5 } })).not.toThrow()
  })
  it('rejects invalid row indices', () => {
    expect(() => validateRow({ row: -1, data: { numRows: 5 } })).toThrow('Invalid row index: -1, numRows: 5')
    expect(() => validateRow({ row: 5, data: { numRows: 5 } })).toThrow('Invalid row index: 5, numRows: 5')
    expect(() => validateRow({ row: 2.5, data: { numRows: 5 } })).toThrow('Invalid row index: 2.5, numRows: 5')
  })
  it('reads numRows at call time', () => {
    const data = { numRows: 5 }
    expect(() => validateRow({ row: 6, data })).toThrow('Invalid row index: 6, numRows: 5')
    data.numRows = 10
    expect(() => validateRow({ row: 6, data })).not.toThrow()
  })
})

describe('validateColumn', () => {
  const data = { columnDescriptors: [{ name: 'col1' }, { name: 'col2' }, { name: 'col3' }] }
  it('accepts known columns', () => {
    for (const column of ['col1', 'col2', 'col3']) {
      expect(() => validateColumn({ column, data })).not.toThrow()
    }
  })
  it('rejects unknown columns', () => {
    expect(() => validateColumn({ column: 'col4', data })).toThrow(
      'Invalid column: col4. Available columns: col1, col2, col3',
    )
    expect(() => validateColumn({ column: '', data })).toThrow('Invalid column: . Available columns: col1, col2, col3')
  })
})

describe('validateFetchParams', () => {
  const data = { numRows: 5, columnDescriptors: [{ name: 'a', sortable: true }, { name: 'b' }] }
  it('accepts a valid range, columns and orderBy', () => {
    expect(() =>
      validateFetchParams({
        rowStart: 0,
        rowEnd: 5,
        columns: ['a', 'b'],
        orderBy: [{ column: 'a', direction: 'ascending' }],
        data,
      }),
    ).not.toThrow()
    expect(() => validateFetchParams({ rowStart: 2, rowEnd: 2, data })).not.toThrow()
  })
  it('rejects invalid ranges, unknown columns and unsortable columns', () => {
    expect(() => validateFetchParams({ rowStart: 3, rowEnd: 2, data })).toThrow('Invalid row range: 3 - 2, numRows: 5')
    expect(() => validateFetchParams({ rowStart: 0, rowEnd: 6, data })).toThrow('Invalid row range: 0 - 6, numRows: 5')
    expect(() => validateFetchParams({ rowStart: 0, rowEnd: 1, columns: ['c'], data })).toThrow('Invalid columns: c')
    expect(() =>
      validateFetchParams({ rowStart: 0, rowEnd: 1, orderBy: [{ column: 'b', direction: 'ascending' }], data }),
    ).toThrow('Unsortable columns in orderBy field: b')
  })
})

describe('checkSignal', () => {
  it('throws an AbortError only when the signal is aborted', () => {
    const controller = new AbortController()
    expect(() => checkSignal(controller.signal)).not.toThrow()
    expect(() => checkSignal()).not.toThrow()
    controller.abort()
    expect(() => checkSignal(controller.signal)).toThrow(expect.objectContaining({ name: 'AbortError' }))
  })
})

describe('partitionOrderBy', () => {
  it('returns the prefix, item and suffix', () => {
    expect(partitionOrderBy([], 'name')).toEqual({ prefix: [], item: undefined, suffix: [] })
    expect(partitionOrderBy([nameAsc], 'name')).toEqual({ prefix: [], item: nameAsc, suffix: [] })
    expect(partitionOrderBy([nameAsc, ageAsc], 'name')).toEqual({ prefix: [], item: nameAsc, suffix: [ageAsc] })
    expect(partitionOrderBy([nameAsc, ageAsc], 'age')).toEqual({ prefix: [nameAsc], item: ageAsc, suffix: [] })
    expect(partitionOrderBy([nameAsc, ageAsc, idAsc], 'age')).toEqual({
      prefix: [nameAsc],
      item: ageAsc,
      suffix: [idAsc],
    })
    expect(partitionOrderBy([nameAsc, nameAsc], 'name')).toEqual({ prefix: [], item: nameAsc, suffix: [nameAsc] })
    expect(partitionOrderBy([nameDesc, nameAsc], 'name')).toEqual({ prefix: [], item: nameDesc, suffix: [nameAsc] })
  })
})

describe('toggleColumn', () => {
  it('puts a column that is not in orderBy first, ascending', () => {
    expect(toggleColumn('name', [])).toEqual([nameAsc])
    expect(toggleColumn('name', [ageAsc])).toEqual([nameAsc, ageAsc])
    expect(toggleColumn('name', [ageAsc, idAsc])).toEqual([nameAsc, ageAsc, idAsc])
  })
  it('moves a secondary column first, ascending', () => {
    expect(toggleColumn('name', [ageAsc, nameAsc])).toEqual([nameAsc, ageAsc])
    expect(toggleColumn('name', [ageAsc, nameDesc])).toEqual([nameAsc, ageAsc])
    expect(toggleColumn('name', [ageAsc, nameDesc, nameDesc])).toEqual([nameAsc, ageAsc, nameDesc])
  })
  it('switches the primary column from ascending to descending', () => {
    expect(toggleColumn('name', [nameAsc])).toEqual([nameDesc])
    expect(toggleColumn('name', [nameAsc, ageAsc])).toEqual([nameDesc, ageAsc])
    expect(toggleColumn('name', [nameAsc, nameDesc])).toEqual([nameDesc, nameDesc])
  })
  it('removes the primary column when it is descending', () => {
    expect(toggleColumn('name', [nameDesc])).toEqual([])
    expect(toggleColumn('name', [nameDesc, ageAsc])).toEqual([ageAsc])
    expect(toggleColumn('name', [nameDesc, nameAsc])).toEqual([nameAsc])
  })
})

describe('validateOrderByAgainstSortableColumns', () => {
  const sortableColumns = new Set(['name', 'age'])
  it('accepts sortable columns', () => {
    expect(() => validateOrderByAgainstSortableColumns({ sortableColumns, orderBy: [nameAsc, ageAsc] })).not.toThrow()
    expect(() => validateOrderByAgainstSortableColumns({ sortableColumns, orderBy: [nameDesc, ageAsc] })).not.toThrow()
  })
  it('rejects unsortable columns', () => {
    expect(() => validateOrderByAgainstSortableColumns({ sortableColumns, orderBy: [idAsc] })).toThrow(
      'Unsortable columns in orderBy field: id',
    )
    expect(() =>
      validateOrderByAgainstSortableColumns({ sortableColumns: new Set(['age']), orderBy: [nameAsc, idAsc] }),
    ).toThrow('Unsortable columns in orderBy field: name, id')
  })
  it('rejects several columns when exclusiveSort is set', () => {
    expect(() =>
      validateOrderByAgainstSortableColumns({ sortableColumns, orderBy: [nameAsc, ageAsc], exclusiveSort: true }),
    ).toThrow('DataFrame is exclusiveSort, but orderBy contains multiple columns')
  })
})

describe('computeRanks', () => {
  it('ranks distinct values', () => {
    expect(computeRanks([3, 1, 2, 4])).toEqual([2, 0, 1, 3])
  })
  it('gives equal values the same rank', () => {
    expect(computeRanks([2, 3, 1, 1])).toEqual([2, 3, 0, 0])
    expect(computeRanks(['b', 'c', 'a', 'a'])).toEqual([2, 3, 0, 0])
  })
  it('ranks bigints and dates', () => {
    expect(computeRanks([3n, 1n, 2n])).toEqual([2, 0, 1])
    expect(computeRanks([new Date(3000), new Date(1000), new Date(2000)])).toEqual([2, 0, 1])
  })
  it('sorts null and undefined last', () => {
    expect(computeRanks([null, 1, 2])).toEqual([2, 0, 1])
    expect(computeRanks([1, null, 2])).toEqual([0, 2, 1])
    expect(computeRanks([1, 2, null])).toEqual([0, 1, 2])
    expect(computeRanks([undefined, 1, 2])).toEqual([2, 0, 1])
    expect(computeRanks([null, undefined, 1])).toEqual([1, 2, 0])
    expect(computeRanks([1, null, undefined])).toEqual([0, 1, 2])
  })
  it('keeps null apart from false and zero', () => {
    expect(computeRanks([null, false, true])).toEqual([2, 0, 1])
    expect(computeRanks([false, null, true])).toEqual([0, 2, 1])
    expect(computeRanks([null, 0, 1])).toEqual([2, 0, 1])
    expect(computeRanks([0, null, 1])).toEqual([0, 2, 1])
  })
})
