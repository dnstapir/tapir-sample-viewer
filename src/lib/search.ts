export const labelColumns: readonly string[] = Array.from({ length: 10 }, (_, i) => `label${i}`)

export type SearchMode = 'domain' | 'columns'

export type SearchMatch = 'subdomains' | 'exact'

export interface SearchOptions {
  mode: SearchMode
  columns: readonly string[]
  match: SearchMatch
  extended: boolean
}

export const defaultSearchOptions: SearchOptions = {
  mode: 'domain',
  columns: ['label1'],
  match: 'subdomains',
  extended: false,
}

const minQueryLength = 2

export const messages = {
  noColumns: 'Choose at least one column to search.',
  tooShort: `Enter at least ${minQueryLength} characters.`,
  tooShortExtended: `Enter at least ${minQueryLength} characters to search all files.`,
  emptyLabel: 'Domain parts between dots cannot be empty.',
  tooManyLabels: `Enter at most ${labelColumns.length} domain parts.`,
} as const

export interface SearchPredicate {
  columns: string[]
  matches: (row: Record<string, unknown>) => boolean
}

export interface SubmittedSearch {
  predicate: SearchPredicate
  extended: boolean
}

type ParsedSearch =
  | { kind: 'none' }
  | { kind: 'invalid'; field: 'query' | 'columns'; message: string }
  | { kind: 'search'; predicate: SearchPredicate }

interface LabelCondition {
  column: string
  value: string
  substring: boolean
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.toLowerCase()
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  return ''
}

function normaliseQuery(query: string, mode: SearchMode): string {
  let value = query.trim().toLowerCase()
  if (mode !== 'domain') return value
  if (value.endsWith('.')) value = value.slice(0, -1)
  if (value.startsWith('www.')) value = value.slice('www.'.length)
  return value
}

function searchConditions(labels: string[], match: SearchMatch): LabelCondition[] {
  const exact = match === 'exact'
  // a query without a dot is matched against label1, the name below the top-level domain
  const offset = labels.length === 1 ? 1 : 0
  const conditions = labels.map((value, i) => ({
    column: `label${i + offset}`,
    value,
    substring: !exact && i === labels.length - 1,
  }))
  const next = labels.length + offset
  if (exact && next < labelColumns.length) {
    conditions.push({ column: `label${next}`, value: '', substring: false })
  }
  return conditions
}

export function parseSearch(query: string, options: SearchOptions): ParsedSearch {
  if (options.mode === 'columns' && options.columns.length === 0) {
    return { kind: 'invalid', field: 'columns', message: messages.noColumns }
  }

  const normalised = normaliseQuery(query, options.mode)
  if (normalised === '' && !options.extended) return { kind: 'none' }
  if (normalised.length < minQueryLength) {
    return {
      kind: 'invalid',
      field: 'query',
      message: options.extended ? messages.tooShortExtended : messages.tooShort,
    }
  }

  if (options.mode === 'columns') {
    const columns = [...options.columns]
    const exact = options.match === 'exact'
    return {
      kind: 'search',
      predicate: {
        columns,
        matches: row =>
          columns.some(column => {
            const cell = text(row[column])
            return exact ? cell === normalised : cell.includes(normalised)
          }),
      },
    }
  }

  const labels = normalised.split('.').reverse()
  if (labels.includes('')) {
    return { kind: 'invalid', field: 'query', message: messages.emptyLabel }
  }
  if (labels.length > labelColumns.length) {
    return { kind: 'invalid', field: 'query', message: messages.tooManyLabels }
  }

  const conditions = searchConditions(labels, options.match)

  return {
    kind: 'search',
    predicate: {
      columns: conditions.map(condition => condition.column),
      matches: row =>
        conditions.every(({ column, value, substring }) => {
          const cell = text(row[column])
          return substring ? cell.includes(value) : cell === value
        }),
    },
  }
}

export function sameOptions(a: SearchOptions, b: SearchOptions): boolean {
  if (a.mode !== b.mode || a.extended !== b.extended || a.match !== b.match) return false
  if (a.mode === 'domain') return true
  return a.columns.length === b.columns.length && a.columns.every(column => b.columns.includes(column))
}
