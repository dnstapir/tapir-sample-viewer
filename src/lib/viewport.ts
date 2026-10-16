/** Height of a table row in px (32px cell + 1px border), same as HighTable. */
export const rowHeight = 33

/**
 * Browsers cap element heights (about 17.9M px in Firefox, 33.5M px in Chrome/Safari),
 * so tall tables use a capped canvas and map the scroll position proportionally (same limit as HighTable).
 */
export const maxCanvasHeight = 8_000_000

/** Rows rendered and fetched beyond the visible ones, in each direction (HighTable defaults). */
export const overscanRows = 20

export interface SliceInput {
  numRows: number
  scrollTop: number
  viewportHeight: number
  headerHeight: number
}

export interface Slice {
  /** height of the scrollable canvas in px */
  canvasHeight: number
  /** first row (partly) visible below the header */
  visibleStart: number
  /** row after the last (partly) visible row */
  visibleEnd: number
  /** rows to render and fetch: visible rows plus overscan */
  renderStart: number
  renderEnd: number
  /** top of the rendered table in canvas coordinates */
  top: number
}

function fullHeight(numRows: number, headerHeight: number): number {
  return numRows * rowHeight + headerHeight
}

/**
 * Factor between scroll distance in the canvas and in the full (uncapped) table. 1 unless the canvas is capped.
 */
function scrollScale(numRows: number, viewportHeight: number, headerHeight: number): number {
  const full = fullHeight(numRows, headerHeight)
  const canvas = Math.min(full, maxCanvasHeight)
  const canvasScrollable = canvas - viewportHeight
  const fullScrollable = full - viewportHeight
  return canvasScrollable > 0 && fullScrollable > 0 ? fullScrollable / canvasScrollable : 1
}

/**
 * Which rows to render for a scroll position, and where to place them.
 * Without capping this is the usual `row = scrollTop / rowHeight`.
 */
export function computeSlice({ numRows, scrollTop, viewportHeight, headerHeight }: SliceInput): Slice {
  const canvasHeight = Math.min(fullHeight(numRows, headerHeight), maxCanvasHeight)
  // scroll position in the full table
  const virtualTop = Math.max(0, scrollTop * scrollScale(numRows, viewportHeight, headerHeight))
  const visibleStart = Math.min(numRows, Math.floor(virtualTop / rowHeight))
  const rowsInView = Math.ceil(Math.max(0, viewportHeight - headerHeight) / rowHeight) + 1
  const visibleEnd = Math.min(numRows, visibleStart + rowsInView)
  const renderStart = Math.max(0, visibleStart - overscanRows)
  const renderEnd = Math.min(numRows, visibleEnd + overscanRows)
  return {
    canvasHeight,
    visibleStart,
    visibleEnd,
    renderStart,
    renderEnd,
    top: scrollTop + renderStart * rowHeight - virtualTop,
  }
}

/**
 * Scroll position that brings `row` fully into view with minimal movement, or undefined if it already is.
 */
export function scrollTopForRow({ row, numRows, scrollTop, viewportHeight, headerHeight }: SliceInput & { row: number }): number | undefined {
  const scale = scrollScale(numRows, viewportHeight, headerHeight)
  const virtualTop = scrollTop * scale
  const rowTop = row * rowHeight
  const rowBottom = rowTop + rowHeight
  const rowsAreaHeight = viewportHeight - headerHeight
  if (rowTop < virtualTop) return rowTop / scale
  if (rowBottom > virtualTop + rowsAreaHeight) return (rowBottom - rowsAreaHeight) / scale
  return undefined
}
