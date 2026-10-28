/* Ported from HighTable v0.26.4 (MIT, https://github.com/hyparam/hightable): src/helpers/dataframe/{types,helpers}.ts,
 * src/helpers/sort.ts and src/helpers/typedEventTarget.ts. */

export type Direction = 'ascending' | 'descending'

export interface ColumnOrderBy {
  column: string
  direction: Direction
}

/** Sort criteria: the first item is the primary sort column, the second the secondary, and so on. */
export type OrderBy = ColumnOrderBy[]

export type Obj = Record<string, unknown>

/** Boxed value, so that a resolved `undefined` can be told apart from "not loaded yet". */
export interface ResolvedValue<T = unknown> {
  value: T
}

export interface DataFrameEvents {
  numrowschange: undefined
  resolve: undefined
  update: undefined
}

export interface ColumnDescriptor<C extends Obj = Obj> {
  name: string
  sortable?: boolean
  metadata?: C
}

export type Fetch = (params: {
  rowStart: number
  rowEnd: number
  columns?: string[]
  orderBy?: OrderBy
  signal?: AbortSignal
}) => Promise<void>

/**
 * A table of data that is fetched in chunks. `getCell` and `getRowNumber` only return already loaded data;
 * `fetch` loads it and dispatches `resolve` events. A column in `orderBy` that is not sortable must throw.
 */
export interface DataFrame<M extends Obj = Obj, C extends Obj = Obj> {
  numRows: number
  columnDescriptors: ColumnDescriptor<C>[]
  metadata?: M
  /** If true, only one column can be sorted at a time. */
  exclusiveSort?: boolean
  getCell(params: { row: number; column: string; orderBy?: OrderBy }): ResolvedValue | undefined
  /** Index of the row in the underlying data. */
  getRowNumber(params: { row: number; orderBy?: OrderBy }): ResolvedValue<number> | undefined
  /** Rejects with an `AbortError` when the signal is aborted. */
  fetch?: Fetch
  eventTarget?: CustomEventTarget<DataFrameEvents>
}

// EventTarget is not generic in TypeScript; see https://github.com/microsoft/TypeScript/issues/28357
export interface CustomEventTarget<TDetails> {
  addEventListener<TType extends keyof TDetails>(
    type: TType,
    listener: (ev: CustomEvent<TDetails[TType]>) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void
  removeEventListener<TType extends keyof TDetails>(
    type: TType,
    listener: (ev: CustomEvent<TDetails[TType]>) => unknown,
    options?: boolean | EventListenerOptions,
  ): void
  dispatchEvent<TType extends keyof TDetails>(ev: TypedCustomEvent<TDetails, TType>): void
}

declare class TypedCustomEvent<TDetails, TType extends keyof TDetails> extends CustomEvent<TDetails[TType]> {
  constructor(type: TType, eventInitDict: { detail: TDetails[TType] } & EventInit)
}

export function createEventTarget<TDetails>(): CustomEventTarget<TDetails> {
  return new EventTarget() as CustomEventTarget<TDetails>
}

export function checkSignal(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }
}

export function validateRow({ row, data }: { row: number; data: Pick<DataFrame, 'numRows'> }): void {
  if (row < 0 || row >= data.numRows || !Number.isInteger(row)) {
    throw new Error(`Invalid row index: ${row}, numRows: ${data.numRows}`)
  }
}

export function validateColumn({ column, data }: { column: string; data: Pick<DataFrame, 'columnDescriptors'> }): void {
  const columnNames = data.columnDescriptors.map(c => c.name)
  if (!columnNames.includes(column)) {
    throw new Error(`Invalid column: ${column}. Available columns: ${columnNames.join(', ')}`)
  }
}

export function validateOrderByAgainstSortableColumns({
  sortableColumns,
  orderBy,
  exclusiveSort,
}: {
  sortableColumns?: Set<string>
  orderBy?: OrderBy
  exclusiveSort?: boolean
}): void {
  if (!orderBy) return
  const unsortableColumns = orderBy.map(({ column }) => column).filter(column => !sortableColumns?.has(column))
  if (unsortableColumns.length > 0) {
    throw new Error(`Unsortable columns in orderBy field: ${unsortableColumns.join(', ')}`)
  }
  if (exclusiveSort && orderBy.length > 1) {
    throw new Error('DataFrame is exclusiveSort, but orderBy contains multiple columns')
  }
}

function validateOrderBy({
  orderBy,
  data,
}: {
  orderBy?: OrderBy
  data: Pick<DataFrame, 'columnDescriptors' | 'exclusiveSort'>
}): void {
  const sortableColumns = new Set(data.columnDescriptors.filter(c => c.sortable).map(c => c.name))
  validateOrderByAgainstSortableColumns({ orderBy, sortableColumns, exclusiveSort: data.exclusiveSort })
}

export function validateGetRowNumberParams({
  row,
  orderBy,
  data,
}: {
  row: number
  orderBy?: OrderBy
  data: Pick<DataFrame, 'numRows' | 'columnDescriptors'>
}): void {
  validateRow({ row, data })
  validateOrderBy({ orderBy, data })
}

export function validateGetCellParams({
  row,
  column,
  orderBy,
  data,
}: {
  row: number
  column: string
  orderBy?: OrderBy
  data: Pick<DataFrame, 'numRows' | 'columnDescriptors'>
}): void {
  validateRow({ row, data })
  validateColumn({ column, data })
  validateOrderBy({ orderBy, data })
}

export function validateFetchParams({
  rowStart,
  rowEnd,
  columns,
  orderBy,
  data,
}: {
  rowStart: number
  rowEnd: number
  columns?: string[]
  orderBy?: OrderBy
  data: Pick<DataFrame, 'numRows' | 'columnDescriptors'>
}): void {
  if (
    rowStart < 0 ||
    rowEnd > data.numRows ||
    !Number.isInteger(rowStart) ||
    !Number.isInteger(rowEnd) ||
    rowStart > rowEnd
  ) {
    throw new Error(`Invalid row range: ${rowStart} - ${rowEnd}, numRows: ${data.numRows}`)
  }
  const columnNames = data.columnDescriptors.map(c => c.name)
  if (columns?.some(column => !columnNames.includes(column))) {
    throw new Error(`Invalid columns: ${columns.join(', ')}. Available columns: ${columnNames.join(', ')}`)
  }
  validateOrderBy({ orderBy, data })
}

export function serializeOrderBy(orderBy: OrderBy): string {
  return JSON.stringify(orderBy)
}

export function deserializeOrderBy(serialized: string): OrderBy {
  return JSON.parse(serialized)
}

export function partitionOrderBy(
  orderBy: OrderBy,
  column: string,
): { prefix: OrderBy; item?: ColumnOrderBy; suffix: OrderBy } {
  const prefix: OrderBy = []
  let item: ColumnOrderBy | undefined
  const suffix: OrderBy = []
  for (const current of orderBy) {
    if (item) {
      suffix.push(current)
    } else if (current.column === column) {
      item = current
    } else {
      prefix.push(current)
    }
  }
  return { prefix, item, suffix }
}

/** Primary column cycles ascending → descending → none; any other column becomes primary, ascending. */
export function toggleColumn(column: string, orderBy: OrderBy): OrderBy {
  const { prefix, item, suffix } = partitionOrderBy(orderBy, column)
  if (item && prefix.length === 0) {
    if (item.direction === 'ascending') {
      return [{ column, direction: 'descending' }, ...suffix]
    }
    return [...suffix]
  }
  return [{ column, direction: 'ascending' }, ...prefix, ...suffix]
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  // JavaScript relational comparison (numbers, bigints, strings, dates); the casts only satisfy TypeScript
  if ((a as number) < (b as number)) return -1
  if ((a as number) > (b as number)) return 1
  return 0
}

/** Ascending rank of each value; ties share the rank of the first of them, null/undefined sort last. */
export function computeRanks(values: unknown[]): number[] {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => compareValues(a.value, b.value))
  const ranks: number[] = Array(sorted.length).fill(-1)
  let lastRank = 0
  let lastValue: unknown
  for (const [rank, { value, index }] of sorted.entries()) {
    if (value === lastValue) {
      ranks[index] = lastRank
    } else {
      ranks[index] = rank
      lastRank = rank
      lastValue = value
    }
  }
  return ranks
}
