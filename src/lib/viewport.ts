export const rowHeight = 33

// browsers cap element heights (Firefox ≈ 17.9M px), so tall tables scroll a capped canvas proportionally
export const maxCanvasHeight = 8_000_000

export const overscanRows = 20

interface SliceInput {
  numRows: number
  scrollTop: number
  viewportHeight: number
  headerHeight: number
}

interface Slice {
  canvasHeight: number
  visibleStart: number
  visibleEnd: number
  renderStart: number
  renderEnd: number
  top: number
}

function fullHeight(numRows: number, headerHeight: number): number {
  return numRows * rowHeight + headerHeight
}

function scrollScale(numRows: number, viewportHeight: number, headerHeight: number): number {
  const full = fullHeight(numRows, headerHeight)
  const canvas = Math.min(full, maxCanvasHeight)
  const canvasScrollable = canvas - viewportHeight
  const fullScrollable = full - viewportHeight
  return canvasScrollable > 0 && fullScrollable > 0 ? fullScrollable / canvasScrollable : 1
}

export function computeSlice({ numRows, scrollTop, viewportHeight, headerHeight }: SliceInput): Slice {
  const canvasHeight = Math.min(fullHeight(numRows, headerHeight), maxCanvasHeight)
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
