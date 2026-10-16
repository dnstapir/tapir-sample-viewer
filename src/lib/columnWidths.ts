/* Column width rules ported from HighTable's ColumnWidthsProvider (MIT), keyed by column name instead of index. */

/** Widths in px, keyed by column name. */
export type Widths = Partial<Record<string, number>>

export const minColumnWidth = 50
/** Adjusted columns are not shrunk below this, nor below a third of their measured width. */
const minAdjustedWidth = 150
const maxAdjustmentRatio = 3
/** Leftover space smaller than this is spread over the columns so the table ends at the right border. */
const snapDistance = 10
/** Kept free to avoid an unneeded horizontal scrollbar. */
const underfillMargin = 3

export function isValidWidth(width: unknown): width is number {
  return typeof width === 'number' && Number.isFinite(width) && width >= 0
}

export function widthsStorageKey(dataSetName: string): string {
  return `tapir-hyparquet:${dataSetName}:column-widths`
}

/**
 * Reads user-set widths. Invalid or too small entries are dropped.
 */
export function loadWidths(storage: Pick<Storage, 'getItem'>, key: string): Widths {
  let value: unknown
  try {
    value = JSON.parse(storage.getItem(key) ?? '{}')
  } catch {
    return {}
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] =>
    isValidWidth(entry[1]) && entry[1] >= minColumnWidth))
}

export function saveWidths(storage: Pick<Storage, 'setItem' | 'removeItem'>, key: string, widths: Widths): void {
  if (Object.keys(widths).length === 0) storage.removeItem(key)
  else storage.setItem(key, JSON.stringify(widths))
}

interface AdjustInput {
  /** visible columns, in display order */
  columns: string[]
  fixed: Widths
  measured: Widths
  /** space available for the data columns; undefined = unknown, no adjustment */
  maxTotalWidth?: number
}

/**
 * Shrinks the widest measured columns (never fixed ones) so the table fits `maxTotalWidth`.
 * Columns without a width count as `minColumnWidth`. Returns only the columns whose width changed.
 */
export function adjustWidths({ columns, fixed, measured, maxTotalWidth }: AdjustInput): Widths {
  if (maxTotalWidth === undefined) return {}
  const measuredColumns = columns.filter(name => fixed[name] === undefined && measured[name] !== undefined)
  if (measuredColumns.length === 0) return {}

  const totalWidth = columns.reduce((sum, name) => sum + (fixed[name] ?? measured[name] ?? minColumnWidth), 0)
  let surplus = totalWidth - Math.max(0, maxTotalWidth - underfillMargin)
  if (surplus <= 0) return {}

  const adjusted: Widths = {}

  // group shrinkable columns by measured width, narrowest first
  const groupsByWidth = new Map<number, { name: string, minWidth: number }[]>()
  for (const name of measuredColumns) {
    const width = measured[name]
    if (width === undefined) continue
    const minWidth = Math.max(minColumnWidth, Math.floor(width / maxAdjustmentRatio), minAdjustedWidth)
    if (width < minWidth) continue
    const group = groupsByWidth.get(width) ?? []
    group.push({ name, minWidth })
    groupsByWidth.set(width, group)
  }
  const groups = [...groupsByWidth.entries()]
    .map(([width, members]) => ({ width, members }))
    .sort((a, b) => a.width - b.width)

  // shrink the widest group towards the next widest, repeatedly, until the surplus is gone
  while (groups.length > 0 && surplus > 0) {
    const widest = groups.pop()
    if (!widest) break
    const next = groups.pop()
    const groupMin = Math.max(...widest.members.map(m => m.minWidth))
    const floor = next === undefined ? groupMin : Math.max(groupMin, next.width)
    const ideal = Math.ceil(widest.width - surplus / widest.members.length)

    if (ideal >= floor) {
      for (const { name } of widest.members) adjusted[name] = ideal
      surplus -= (widest.width - ideal) * widest.members.length
      break
    }

    for (const { name } of widest.members) adjusted[name] = floor
    surplus -= (widest.width - floor) * widest.members.length
    const remaining = widest.members.filter(m => m.minWidth < floor)
    if (next?.width === floor) {
      groups.push({ width: floor, members: [...next.members, ...remaining] })
    } else {
      if (next) groups.push(next)
      if (remaining.length > 0) groups.push({ width: floor, members: remaining })
    }
  }

  // a small gap left over: widen the measured columns slightly to reach the right border
  if (surplus < 0 && surplus > -snapDistance) {
    const growable = measuredColumns.map(name => ({ name, width: adjusted[name] ?? measured[name] ?? minColumnWidth }))
    const base = Math.floor(-surplus / growable.length)
    const rest = -surplus % growable.length
    growable.forEach(({ name, width }, i) => {
      adjusted[name] = width + base + (i < rest ? 1 : 0)
    })
  }

  return adjusted
}
