export const labelColumns: readonly string[] = Array.from({ length: 10 }, (_, i) => `label${i}`)

export type SearchMode = 'domain' | 'columns'

export interface SearchOptions {
  mode: SearchMode
  columns: readonly string[]
  extended: boolean
}

export const defaultSearchOptions: SearchOptions = { mode: 'domain', columns: ['label1'], extended: false }

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
  | { kind: 'invalid', field: 'query' | 'columns', message: string }
  | { kind: 'search', predicate: SearchPredicate }

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
  const value = query.trim().toLowerCase()
  return mode === 'domain' && value.endsWith('.') ? value.slice(0, -1) : value
}

// labels are read right to left (`se` → label0); only the leftmost typed label is a substring match
function domainConditions(normalised: string): LabelCondition[] {
  const labels = normalised.split('.')
  if (labels.length === 1) return [{ column: 'label1', value: normalised, substring: true }]
  const reversed = labels.reverse()
  return reversed.map((value, i) => ({ column: `label${i}`, value, substring: i === reversed.length - 1 }))
}

export function parseSearch(query: string, options: SearchOptions): ParsedSearch {
  if (options.mode === 'columns' && options.columns.length === 0) {
    return { kind: 'invalid', field: 'columns', message: messages.noColumns }
  }
  const normalised = normaliseQuery(query, options.mode)
  if (normalised === '' && !options.extended) return { kind: 'none' }
  if (normalised.length < minQueryLength) {
    return { kind: 'invalid', field: 'query', message: options.extended ? messages.tooShortExtended : messages.tooShort }
  }

  if (options.mode === 'columns') {
    const columns = [...options.columns]
    return {
      kind: 'search',
      predicate: { columns, matches: row => columns.some(column => text(row[column]).includes(normalised)) },
    }
  }

  const conditions = domainConditions(normalised)
  if (conditions.some(condition => condition.value === '')) {
    return { kind: 'invalid', field: 'query', message: messages.emptyLabel }
  }
  if (conditions.length > labelColumns.length) {
    return { kind: 'invalid', field: 'query', message: messages.tooManyLabels }
  }
  return {
    kind: 'search',
    predicate: {
      columns: conditions.map(condition => condition.column),
      matches: row => conditions.every(({ column, value, substring }) => {
        const cell = text(row[column])
        return substring ? cell.includes(value) : cell === value
      }),
    },
  }
}

export function sameOptions(a: SearchOptions, b: SearchOptions): boolean {
  if (a.mode !== b.mode || a.extended !== b.extended) return false
  if (a.mode === 'domain') return true
  return a.columns.length === b.columns.length && a.columns.every(column => b.columns.includes(column))
}
