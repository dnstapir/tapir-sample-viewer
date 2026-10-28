/* Ported from HighTable v0.26.4 (MIT, https://github.com/hyparam/hightable): src/helpers/dataframe/sort.ts. */
import type { DataFrame, DataFrameEvents, Obj, OrderBy, ResolvedValue } from './dataframe.ts'
import {
  checkSignal,
  computeRanks,
  createEventTarget,
  deserializeOrderBy,
  serializeOrderBy,
  validateColumn,
  validateFetchParams,
  validateOrderByAgainstSortableColumns,
  validateRow,
} from './dataframe.ts'

/**
 * Wrap a DataFrame to make it sortable on the given columns (default: all). Sorting a column reads the whole
 * column once; the resulting row order is cached per `orderBy` and refreshed on `update` / `numrowschange`.
 */
export function sortableDataFrame<M extends Obj, C extends Obj>(
  data: DataFrame<M, C>,
  options?: { sortableColumns?: Set<string>; exclusiveSort?: boolean },
): DataFrame<M, C> {
  const sortableColumns = options?.sortableColumns ?? new Set(data.columnDescriptors.map(c => c.name))
  const exclusiveSort = options?.exclusiveSort ?? data.exclusiveSort
  for (const column of sortableColumns) {
    validateColumn({ column, data })
  }
  const alreadySortable = data.columnDescriptors.every(({ name, sortable }) =>
    sortableColumns.has(name) ? sortable === true : sortable === false || sortable === undefined,
  )
  if (alreadySortable) {
    if (options && 'exclusiveSort' in options && data.exclusiveSort !== options.exclusiveSort) {
      return { ...data, exclusiveSort: options.exclusiveSort }
    }
    return data
  }

  const columnDescriptors = data.columnDescriptors.map(({ name, metadata }) => ({
    name,
    sortable: sortableColumns.has(name),
    metadata: structuredClone(metadata),
  }))
  const metadata = structuredClone(data.metadata)
  const eventTarget = createEventTarget<DataFrameEvents>()

  const indexesByOrderBy = new Map<string, number[]>()
  async function computeCache({
    orderBy,
    signal,
    refresh,
  }: {
    orderBy: OrderBy
    signal?: AbortSignal
    refresh?: boolean
  }): Promise<number[]> {
    const key = serializeOrderBy(orderBy)
    const cached = refresh ? undefined : indexesByOrderBy.get(key)
    if (cached) return cached
    const indexes = computeIndexes(await fetchOrderByWithRanks({ orderBy, signal, data }))
    indexesByOrderBy.set(key, indexes)
    if (!refresh) eventTarget.dispatchEvent(new CustomEvent('resolve'))
    return indexes
  }
  function refreshCaches() {
    return Promise.all(
      [...indexesByOrderBy.keys()].map(key => computeCache({ orderBy: deserializeOrderBy(key), refresh: true })),
    )
  }
  // during a refresh the cached order may be briefly out of date
  data.eventTarget?.addEventListener('update', async () => {
    await refreshCaches()
    eventTarget.dispatchEvent(new CustomEvent('update'))
  })
  data.eventTarget?.addEventListener('numrowschange', async () => {
    await refreshCaches()
    eventTarget.dispatchEvent(new CustomEvent('numrowschange'))
  })

  // numRows: Infinity in the validations below, because the upstream size can change
  function getUpstreamRow({ row, orderBy }: { row: number; orderBy?: OrderBy }): ResolvedValue<number> | undefined {
    validateRow({ row, data: { numRows: Infinity } })
    validateOrderByAgainstSortableColumns({ orderBy, sortableColumns, exclusiveSort })
    if (!orderBy || orderBy.length === 0) return { value: row }
    const rowNumber = indexesByOrderBy.get(serializeOrderBy(orderBy))?.[row]
    return rowNumber === undefined ? undefined : { value: rowNumber }
  }

  function getRowNumber({ row, orderBy }: { row: number; orderBy?: OrderBy }): ResolvedValue<number> | undefined {
    const upstreamRow = getUpstreamRow({ row, orderBy })
    return upstreamRow && data.getRowNumber({ row: upstreamRow.value })
  }

  function getCell({
    row,
    column,
    orderBy,
  }: {
    row: number
    column: string
    orderBy?: OrderBy
  }): ResolvedValue | undefined {
    validateColumn({ column, data: { columnDescriptors } })
    const upstreamRow = getUpstreamRow({ row, orderBy })
    return upstreamRow && data.getCell({ row: upstreamRow.value, column })
  }

  async function fetch({
    rowStart,
    rowEnd,
    columns,
    orderBy,
    signal,
  }: {
    rowStart: number
    rowEnd: number
    columns?: string[]
    orderBy?: OrderBy
    signal?: AbortSignal
  }): Promise<void> {
    validateFetchParams({ rowStart, rowEnd, columns, orderBy, data: { numRows: Infinity, columnDescriptors } })
    function forward() {
      eventTarget.dispatchEvent(new CustomEvent('resolve'))
    }
    data.eventTarget?.addEventListener('resolve', forward)
    try {
      if (!orderBy || orderBy.length === 0) {
        await data.fetch?.({ rowStart, rowEnd, columns, signal })
        return
      }
      if (rowStart === rowEnd) return
      const indexes = await computeCache({ orderBy, signal })
      if (columns && columns.length > 0 && data.fetch) {
        await fetchFromIndexes({ columns, signal, indexes: indexes.slice(rowStart, rowEnd), fetch: data.fetch })
      }
    } finally {
      data.eventTarget?.removeEventListener('resolve', forward)
    }
  }

  return {
    metadata,
    columnDescriptors,
    getRowNumber,
    getCell,
    fetch,
    eventTarget,
    exclusiveSort,
    get numRows() {
      return data.numRows
    },
  }
}

/** Fetch the given upstream rows, grouped into consecutive ranges. */
async function fetchFromIndexes({
  columns,
  indexes,
  signal,
  fetch,
}: {
  columns: string[]
  indexes: number[]
  signal?: AbortSignal
  fetch: NonNullable<DataFrame['fetch']>
}): Promise<void> {
  // numeric sort (upstream sorts as strings, which splits ranges such as 9, 10 into two fetches)
  const rows = indexes.sort((a, b) => a - b)
  const promises: Promise<void>[] = []
  let range: [number, number] | undefined
  for (const row of rows) {
    if (range === undefined) {
      range = [row, row + 1]
    } else if (range[1] === row) {
      range[1] = row + 1
    } else {
      promises.push(fetch({ rowStart: range[0], rowEnd: range[1], columns, signal }))
      range = [row, row + 1]
    }
  }
  if (range) promises.push(fetch({ rowStart: range[0], rowEnd: range[1], columns, signal }))
  await Promise.all(promises)
}

type OrderByWithRanks = { direction: 'ascending' | 'descending'; ranks: number[] }[]

/** Read each sorted column completely and compute its ranks. */
async function fetchOrderByWithRanks<M extends Obj, C extends Obj>({
  orderBy,
  signal,
  data,
}: {
  orderBy: OrderBy
  signal?: AbortSignal
  data: DataFrame<M, C>
}): Promise<OrderByWithRanks> {
  const orderByWithRanks: OrderByWithRanks = []
  await Promise.all(
    orderBy.map(async ({ column, direction }, i) => {
      validateColumn({ column, data })
      await data.fetch?.({ rowStart: 0, rowEnd: data.numRows, columns: [column], signal })
      checkSignal(signal)
      const values = Array.from({ length: data.numRows }, (_, row) => {
        const cell = data.getCell({ row, column })
        if (!cell) throw new Error(`Cell not found for row ${row} and column ${column}`)
        return cell.value
      })
      orderByWithRanks[i] = { direction, ranks: computeRanks(values) }
    }),
  )
  return orderByWithRanks
}

/** Row indexes in sorted order; ties keep the original order. */
function computeIndexes(orderByWithRanks: OrderByWithRanks): number[] {
  if (!(0 in orderByWithRanks)) throw new Error('orderByWithRanks should have at least one element')
  const numRows = orderByWithRanks[0].ranks.length
  return Array.from({ length: numRows }, (_, i) => i).sort((a, b) => {
    for (const { direction, ranks } of orderByWithRanks) {
      const rankA = ranks[a]
      const rankB = ranks[b]
      if (rankA === undefined || rankB === undefined) throw new Error('Invalid ranks')
      const sign = direction === 'ascending' ? 1 : -1
      if (rankA < rankB) return -sign
      if (rankA > rankB) return sign
    }
    return a - b
  })
}
