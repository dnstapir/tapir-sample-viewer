import type { DataFrame, OrderBy } from 'hightable/dataframe'
import { stringify, toggleColumn } from 'hightable/dataframe'
import type { JSX } from 'solid-js'
import { For, Show, createEffect, createMemo, createSignal, createUniqueId, on, onCleanup, onMount, untrack } from 'solid-js'
import Dropdown from '../components/Dropdown.tsx'
import { isAbortError } from '../lib/abort.ts'
import type { Widths } from '../lib/columnWidths.ts'
import { adjustWidths, loadWidths, minColumnWidth, saveWidths, widthsStorageKey } from '../lib/columnWidths.ts'
import { computeSlice, scrollTopForRow } from '../lib/viewport.ts'
import ColumnResizer from './ColumnResizer.tsx'
import './Table.css'

interface TableProps {
  df: DataFrame
  /** data set name: key for persisted column widths */
  name: string
  /** accessible name of the grid, e.g. "Table" */
  label: string
  onError: (error: unknown) => void
}

/** Focused cell in ARIA coordinates: row 1 is the header, column 1 the row numbers. */
interface Position {
  row: number
  col: number
}

const rowsPerPage = 20
const widthStep = 50
const sortHint = 'Select a column header to sort'

function sortMessage(order: OrderBy): string {
  if (order.length === 0) return 'Sorted by row number (file order)'
  return `Sorted by ${order[0].column}, ${order[0].direction}`
}

function widthStyle(width: number | undefined): JSX.CSSProperties | undefined {
  return width === undefined ? undefined : { 'min-width': `${width}px`, 'max-width': `${width}px` }
}

/** Long values get a tooltip, truncated to 400 characters (as in HighTable). */
function cellTitle(text: string | undefined): string | undefined {
  if (text === undefined || text.length <= 100) return undefined
  return text.length > 400 ? `${text.slice(0, 397)}\u2026` : text
}

function copyOnEvent(event: ClipboardEvent, text: string | undefined) {
  if (text === undefined || !document.getSelection()?.isCollapsed) return
  event.preventDefault()
  navigator.clipboard.writeText(text).catch(() => undefined)
}

/**
 * Virtualized, sortable data grid over a hightable `DataFrame` (Solid port of HighTable's features).
 * Follows the WAI-ARIA APG grid pattern: one tab stop, arrow-key navigation, `aria-rowcount`/`aria-rowindex`.
 * Expects to be recreated when the data frame changes.
 */
export default function Table(props: TableProps): JSX.Element {
  const df = untrack(() => props.df)
  const storageKey = untrack(() => widthsStorageKey(props.name))
  const captionId = createUniqueId()
  const hintId = createUniqueId()
  const numRows = () => df.numRows

  // data version: bumped whenever the data frame resolves cells, so cell reads re-run
  const [version, setVersion] = createSignal(0)
  onMount(() => {
    function bump() { setVersion(v => v + 1) }
    const events = ['resolve', 'update', 'numrowschange'] as const
    for (const type of events) df.eventTarget?.addEventListener(type, bump)
    onCleanup(() => { for (const type of events) df.eventTarget?.removeEventListener(type, bump) })
  })

  const [orderBy, setOrderBy] = createSignal<OrderBy>([])
  const [hidden, setHidden] = createSignal<ReadonlySet<string>>(new Set())
  const allColumns = df.columnDescriptors.map(c => c.name)
  const columns = createMemo(() => allColumns.filter(name => !hidden().has(name)))

  // viewport
  let scroller: HTMLDivElement | undefined
  let headerRow: HTMLTableRowElement | undefined
  const [scrollTop, setScrollTop] = createSignal(0)
  const [viewport, setViewport] = createSignal({ width: 0, height: 0 })
  const [header, setHeader] = createSignal({ height: 33, cornerWidth: 0 })
  const slice = createMemo(() => computeSlice({
    numRows: numRows(),
    scrollTop: scrollTop(),
    viewportHeight: viewport().height,
    headerHeight: header().height,
  }))
  const range = createMemo(() => ({ start: slice().renderStart, end: slice().renderEnd }), undefined, {
    equals: (a, b) => a.start === b.start && a.end === b.end,
  })
  const rows = createMemo(() => {
    const { start, end } = range()
    return Array.from({ length: end - start }, (_, i) => start + i)
  })

  onMount(() => {
    const element = scroller
    if (!element) return
    function measure() {
      if (!element) return
      setViewport({ width: element.clientWidth, height: element.clientHeight })
      const corner = headerRow?.firstElementChild as HTMLElement | null
      const headerHeight = headerRow?.offsetHeight ?? 0
      setHeader({ height: headerHeight > 0 ? headerHeight : 33, cornerWidth: corner?.offsetWidth ?? 0 })
    }
    function onScroll() {
      if (element) setScrollTop(element.scrollTop)
    }
    measure()
    element.addEventListener('scroll', onScroll)
    onCleanup(() => { element.removeEventListener('scroll', onScroll) })
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure)
      observer.observe(element)
      if (headerRow) observer.observe(headerRow)
      onCleanup(() => { observer.disconnect() })
    }
  })

  // fetch the rendered rows (visible + overscan); a newer request aborts the previous one
  createEffect(() => {
    const { start, end } = range()
    const fetchColumns = columns()
    const order = orderBy()
    if (!df.fetch || end <= start) return
    const controller = new AbortController()
    df.fetch({ rowStart: start, rowEnd: end, columns: fetchColumns, orderBy: order, signal: controller.signal })
      .catch((error: unknown) => {
        if (!isAbortError(error)) props.onError(error)
      })
    onCleanup(() => { controller.abort() })
  })

  function getCell(row: number, column: string) {
    version()
    return df.getCell({ row, column, orderBy: orderBy() })
  }

  function getRowNumber(row: number): number | undefined {
    version()
    return df.getRowNumber({ row, orderBy: orderBy() })?.value
  }

  // column widths: user-set (persisted) > adjusted to fit > measured from content
  const [fixed, setFixed] = createSignal<Widths>(loadWidths(localStorage, storageKey))
  const [measured, setMeasured] = createSignal<Widths>({})
  createEffect(on(fixed, value => { saveWidths(localStorage, storageKey, value) }, { defer: true }))
  const adjusted = createMemo(() => adjustWidths({
    columns: columns(),
    fixed: fixed(),
    measured: measured(),
    maxTotalWidth: viewport().width > 0 ? viewport().width - header().cornerWidth : undefined,
  }))
  function width(column: string): number | undefined {
    return fixed()[column] ?? adjusted()[column] ?? measured()[column]
  }
  const headerCells = new Map<string, HTMLTableCellElement>()

  // measure a column once some of its cells have data, so widths stop jumping while scrolling
  createEffect(() => {
    const visibleRows = rows()
    const updates: Widths = {}
    for (const column of columns()) {
      if (fixed()[column] !== undefined || measured()[column] !== undefined) continue
      const cell = headerCells.get(column)
      if (!cell || !visibleRows.some(row => getCell(row, column) !== undefined)) continue
      updates[column] = Math.max(cell.offsetWidth + 1, minColumnWidth)
    }
    if (Object.keys(updates).length > 0) setMeasured(current => ({ ...current, ...updates }))
  })

  function resizeTo(column: string, value: number) {
    setFixed(current => ({ ...current, [column]: Math.max(Math.round(value), minColumnWidth) }))
  }

  function autoResize(column: string) {
    setFixed(current => withoutKey(current, column))
    setMeasured(current => withoutKey(current, column))
  }

  function resizeBy(column: string, delta: number) {
    resizeTo(column, (width(column) ?? headerCells.get(column)?.offsetWidth ?? minColumnWidth) + delta)
  }

  // keyboard navigation (roving tabindex)
  const [position, setPosition] = createSignal<Position>({ row: 1, col: 1 })
  const rowCount = () => numRows() + 1
  const colCount = () => columns().length + 1

  function cellElement({ row, col }: Position): HTMLElement | null {
    return scroller?.querySelector<HTMLElement>(`tr[aria-rowindex="${row}"] > [aria-colindex="${col}"]`) ?? null
  }

  function goTo(target: Position) {
    const next = {
      row: Math.min(Math.max(target.row, 1), rowCount()),
      col: Math.min(Math.max(target.col, 1), colCount()),
    }
    setPosition(next)
    if (next.row > 1 && scroller) {
      const top = scrollTopForRow({
        row: next.row - 2,
        numRows: numRows(),
        scrollTop: scroller.scrollTop,
        viewportHeight: viewport().height,
        headerHeight: header().height,
      })
      if (top !== undefined) {
        scroller.scrollTop = top
        setScrollTop(scroller.scrollTop)
      }
    }
    const element = cellElement(next)
    if (element) {
      element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      element.focus({ preventScroll: true })
    }
  }

  function tabIndexFor(row: number, col: number): number {
    const current = position()
    return current.row === row && current.col === col ? 0 : -1
  }

  // the scroll area is a tab stop only while the focusable cell is scrolled out of the DOM
  const activeCellRendered = () => {
    const { row } = position()
    return row === 1 || row - 2 >= range().start && row - 2 < range().end
  }

  // focus can also arrive from a screen reader or a click; keep the roving position in sync
  function onGridFocusIn(event: FocusEvent) {
    const cell = event.target as HTMLElement
    const row = Number(cell.parentElement?.getAttribute('aria-rowindex'))
    const col = Number(cell.getAttribute('aria-colindex'))
    if (!row || !col) return
    const current = position()
    if (current.row !== row || current.col !== col) {
      setPosition({ row, col })
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }

  function onGridKeyDown(event: KeyboardEvent) {
    if (event.altKey || event.metaKey || event.shiftKey) return
    const { row, col } = position()
    const ctrl = event.ctrlKey
    const moves: Record<string, Position | undefined> = {
      ArrowRight: { row, col: ctrl ? colCount() : col + 1 },
      ArrowLeft: { row, col: ctrl ? 1 : col - 1 },
      ArrowDown: { row: ctrl ? rowCount() : row + 1, col },
      ArrowUp: { row: ctrl ? 1 : row - 1, col },
      Home: ctrl ? { row: 1, col: 1 } : { row, col: 1 },
      End: ctrl ? { row: rowCount(), col: colCount() } : { row, col: colCount() },
      PageDown: { row: row + rowsPerPage, col },
      PageUp: { row: row - rowsPerPage, col },
    }
    const target = moves[event.key]
    // Space is captured to keep the page from scrolling while navigating
    if (!target && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    if (target) goTo(target)
  }

  function onScrollerKeyDown(event: KeyboardEvent) {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Tab' && !event.shiftKey || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      goTo(position())
    }
  }

  // sorting and column visibility; screen readers do not reliably announce aria-sort changes
  const [sortStatus, setSortStatus] = createSignal('')
  function sortBy(order: OrderBy) {
    setOrderBy(order)
    setSortStatus(sortMessage(order))
  }

  function toggleSort(column: string) {
    sortBy(toggleColumn(column, orderBy()))
  }

  function hideColumn(column: string) {
    setHidden(current => new Set([...current, column]))
    // the focused header may disappear; restart from the first cell
    goTo({ row: 1, col: 1 })
  }

  const rowNumberCharacters = () => Math.max(numRows().toLocaleString('en-US').length, 3)

  return <div class="table" style={{ '--row-number-characters': String(rowNumberCharacters()), '--column-header-height': `${header().height}px` }}>
    <div
      ref={el => { scroller = el }}
      class="table-scroll"
      role={activeCellRendered() ? undefined : 'group'}
      aria-label={activeCellRendered() ? undefined : props.label}
      tabIndex={activeCellRendered() ? -1 : 0}
      onKeyDown={onScrollerKeyDown}
    >
      <div class="table-canvas" style={{ height: `${slice().canvasHeight}px` }}>
        <table
          role="grid"
          aria-readonly="true"
          aria-rowcount={rowCount()}
          aria-colcount={colCount()}
          style={{ top: `${slice().top}px` }}
          onKeyDown={onGridKeyDown}
          onFocusIn={onGridFocusIn}
        >
          <caption id={captionId} class="visually-hidden">{props.label}</caption>
          <thead>
            <tr ref={el => { headerRow = el }} aria-rowindex={1} aria-label="Column headers">
              <th
                class="table-corner"
                scope="col"
                role="columnheader"
                aria-colindex={1}
                aria-sort={orderBy().length === 0 ? 'ascending' : 'none'}
                aria-describedby={hintId}
                title={orderBy().length === 0 ? 'Sorted by row number (file order)' : 'Press to reset sorting to row number (file order)'}
                tabIndex={tabIndexFor(1, 1)}
                onMouseDown={() => setPosition({ row: 1, col: 1 })}
                onClick={() => { sortBy([]) }}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    event.stopPropagation()
                    sortBy([])
                  }
                }}
              >
                <span class="visually-hidden">Row number</span>
                <span aria-hidden="true">{orderBy().length === 0 ? '\u2b61' : '\u21c5'}</span>
              </th>
              <For each={columns()}>
                {(column, index) => <ColumnHeader
                  column={column}
                  colIndex={index() + 2}
                  orderBy={orderBy()}
                  width={width(column)}
                  fixedWidth={fixed()[column] !== undefined}
                  tabIndex={tabIndexFor(1, index() + 2)}
                  hintId={hintId}
                  canHide={columns().length > 1}
                  canShowAll={hidden().size > 0}
                  ref={el => { headerCells.set(column, el) }}
                  onFocusCell={() => setPosition({ row: 1, col: index() + 2 })}
                  onToggleSort={() => { toggleSort(column) }}
                  onHide={() => { hideColumn(column) }}
                  onShowAll={() => setHidden(new Set<string>())}
                  onResize={value => { resizeTo(column, value) }}
                  onResizeBy={delta => { resizeBy(column, delta) }}
                  onAutoResize={() => { autoResize(column) }}
                />}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={rows()}>
              {row => {
                const rowNumber = () => getRowNumber(row)
                const rowLabel = () => {
                  const value = rowNumber()
                  return value === undefined ? undefined : (value + 1).toLocaleString('en-US')
                }
                return <tr aria-rowindex={row + 2} aria-label={rowLabel() === undefined ? undefined : `Row ${rowLabel()}`}>
                  <th
                    scope="row"
                    role="rowheader"
                    aria-colindex={1}
                    aria-busy={rowNumber() === undefined}
                    tabIndex={tabIndexFor(row + 2, 1)}
                    onMouseDown={() => setPosition({ row: row + 2, col: 1 })}
                    onCopy={event => { copyOnEvent(event, rowLabel()) }}
                  >
                    {rowLabel()}
                  </th>
                  <For each={columns()}>
                    {(column, index) => {
                      const cell = () => getCell(row, column)
                      const text = () => {
                        const resolved = cell()
                        return resolved === undefined ? undefined : stringify(resolved.value)
                      }
                      return <td
                        role="gridcell"
                        aria-colindex={index() + 2}
                        aria-busy={cell() === undefined}
                        tabIndex={tabIndexFor(row + 2, index() + 2)}
                        style={widthStyle(width(column))}
                        title={cellTitle(text())}
                        onMouseDown={() => setPosition({ row: row + 2, col: index() + 2 })}
                        onCopy={event => { copyOnEvent(event, text()) }}
                      >
                        <Show when={cell() === undefined} fallback={text()}>
                          <span class="visually-hidden">Loading</span>
                        </Show>
                      </td>
                    }}
                  </For>
                </tr>
              }}
            </For>
          </tbody>
        </table>
      </div>
    </div>
    <span id={hintId} class="visually-hidden">{sortHint}</span>
    <p class="visually-hidden" role="status">{sortStatus()}</p>
  </div>
}

function withoutKey(widths: Widths, key: string): Widths {
  return Object.fromEntries(Object.entries(widths).filter(([name]) => name !== key))
}

interface ColumnHeaderProps {
  column: string
  colIndex: number
  orderBy: OrderBy
  width?: number
  fixedWidth: boolean
  tabIndex: number
  hintId: string
  canHide: boolean
  canShowAll: boolean
  ref: (element: HTMLTableCellElement) => void
  onFocusCell: () => void
  onToggleSort: () => void
  onHide: () => void
  onShowAll: () => void
  onResize: (width: number) => void
  onResizeBy: (delta: number) => void
  onAutoResize: () => void
}

function ColumnHeader(props: ColumnHeaderProps): JSX.Element {
  const orderIndex = () => props.orderBy.findIndex(item => item.column === props.column)
  const direction = () => orderIndex() >= 0 ? props.orderBy[orderIndex()].direction : undefined
  const ariaSort = () => orderIndex() === 0 ? direction() : 'none'
  const indicator = () => direction() === 'ascending' ? '\u2b61' : direction() === 'descending' ? '\u2b63' : '\u21c5'
  const description = () => {
    if (orderIndex() > 0 || direction() === undefined) return `Press to sort by ${props.column} in ascending order`
    if (direction() === 'ascending') return `Press to sort by ${props.column} in descending order`
    return `Press to stop sorting by ${props.column}`
  }
  const menuItems = () => [
    { label: 'Wider', onSelect: () => { props.onResizeBy(widthStep) } },
    { label: 'Narrower', onSelect: () => { props.onResizeBy(-widthStep) } },
    { label: 'Fit to content', onSelect: () => { props.onAutoResize() } },
    ...props.canHide ? [{ label: 'Hide column', onSelect: () => { props.onHide() } }] : [],
    ...props.canShowAll ? [{ label: 'Show all columns', onSelect: () => { props.onShowAll() } }] : [],
  ]

  return <th
    ref={el => { props.ref(el) }}
    scope="col"
    role="columnheader"
    aria-colindex={props.colIndex}
    aria-sort={ariaSort()}
    aria-label={props.column}
    aria-describedby={props.hintId}
    title={description()}
    tabIndex={props.tabIndex}
    style={widthStyle(props.width)}
    data-order-index={orderIndex() >= 0 ? orderIndex() : undefined}
    data-fixed-width={props.fixedWidth ? 'true' : undefined}
    onMouseDown={() => { props.onFocusCell() }}
    onClick={() => { props.onToggleSort() }}
    onKeyDown={event => {
      if (event.target !== event.currentTarget) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        event.stopPropagation()
        props.onToggleSort()
      }
    }}
    onCopy={event => { copyOnEvent(event, props.column) }}
  >
    {/* the name comes from aria-label; hidden here so it is not read twice */}
    <span class="column-name" aria-hidden="true">{props.column}</span>
    <span class="sort-indicator" aria-hidden="true">{indicator()}</span>
    <Dropdown
      label={<span aria-hidden="true">{'\u22ee'}</span>}
      ariaLabel="Column menu"
      noCaret
      buttonClass="column-menu-button"
      tabIndex={props.tabIndex}
      portal
      items={menuItems()}
    />
    <ColumnResizer
      width={props.width}
      resizeTo={value => { props.onResize(value) }}
      autoResize={() => { props.onAutoResize() }}
    />
  </th>
}
