// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library'
import type { DataFrame } from 'hightable/dataframe'
import { sortableDataFrame, stringify } from 'hightable/dataframe'
import { parquetReadObjects } from 'hyparquet'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { widthsStorageKey } from '../src/lib/columnWidths.ts'
import { parquetDataFrame } from '../src/lib/parquetDataFrame.ts'
import Table from '../src/table/Table.tsx'
import type { Sample } from './samples.ts'
import { loadSamples, openFile } from './samples.ts'

describe('Table', () => {
  let sample: Sample
  let expected: Record<string, unknown>[]
  let df: DataFrame

  beforeAll(async () => {
    [sample] = await loadSamples()
    expected = await parquetReadObjects({ file: await openFile(sample.path), metadata: sample.metadata })
    // jsdom has no layout: scrollIntoView is missing
    Element.prototype.scrollIntoView = vi.fn()
  })
  beforeEach(async () => {
    localStorage.clear()
    df = sortableDataFrame(parquetDataFrame(await openFile(sample.path), sample.metadata))
  })
  afterEach(cleanup)

  function renderTable(onError = vi.fn()) {
    render(() => <Table df={df} name="sample" label="Table" onError={onError} />)
    return { grid: screen.getByRole('grid', { name: 'Table' }), onError }
  }

  function columnMenu(grid: HTMLElement, column: string): HTMLElement {
    return within(within(grid).getByRole('columnheader', { name: column })).getByRole('button', { name: 'Column menu' })
  }

  async function loaded(grid: HTMLElement) {
    await waitFor(() => {
      expect(within(grid).getAllByRole('gridcell').length).toBeGreaterThan(0)
      expect(grid.querySelector('td[aria-busy="true"]')).toBeNull()
    })
  }

  function firstRowValue(grid: HTMLElement, column: string): string | null {
    const colIndex = df.columnDescriptors.findIndex(c => c.name === column) + 2
    return grid.querySelector(`tr[aria-rowindex="2"] > [aria-colindex="${colIndex}"]`)?.textContent ?? null
  }

  it('exposes grid semantics with full row and column counts', () => {
    const { grid } = renderTable()
    expect(grid.getAttribute('aria-rowcount')).toBe(String(df.numRows + 1))
    expect(grid.getAttribute('aria-colcount')).toBe(String(df.columnDescriptors.length + 1))
    const [corner, ...headers] = within(grid).getAllByRole('columnheader')
    expect(corner).toBe(within(grid).getByRole('columnheader', { name: 'Row number' }))
    expect(headers.map(th => th.getAttribute('aria-label'))).toEqual(df.columnDescriptors.map(c => c.name))
  })

  it('fetches and shows cell values, with 1-based row numbers', async () => {
    const { grid } = renderTable()
    await loaded(grid)
    expect(firstRowValue(grid, 'label1')).toBe(stringify(expected[0].label1))
    expect(within(grid).getAllByRole('rowheader')[0].textContent).toBe('1')
  })

  it('sorts when a header is clicked, and cycles ascending, descending, none', async () => {
    const { grid } = renderTable()
    await loaded(grid)
    const header = within(grid).getByRole('columnheader', { name: 'label1' })
    const values = expected.map(row => String(row.label1)).sort()

    fireEvent.click(header)
    await waitFor(() => { expect(firstRowValue(grid, 'label1')).toBe(values[0]) })
    expect(header.getAttribute('aria-sort')).toBe('ascending')

    fireEvent.click(header)
    await waitFor(() => { expect(firstRowValue(grid, 'label1')).toBe(values[values.length - 1]) })
    expect(header.getAttribute('aria-sort')).toBe('descending')

    fireEvent.click(header)
    expect(header.getAttribute('aria-sort')).toBe('none')
  })

  it('describes headers as sortable and announces sort changes', async () => {
    const { grid } = renderTable()
    await loaded(grid)
    const header = within(grid).getByRole('columnheader', { name: 'label1' })
    const corner = within(grid).getByRole('columnheader', { name: 'Row number' })
    for (const cell of [header, corner]) {
      expect(document.getElementById(cell.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Select to sort')
    }
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('')
    fireEvent.click(header)
    expect(status.textContent).toBe('Sorted by label1, ascending')
    fireEvent.click(corner)
    expect(status.textContent).toBe('Sorted by row number (file order)')
  })

  it('resets a multi-column sort to file order from the row number header', async () => {
    const { grid } = renderTable()
    await loaded(grid)
    const corner = within(grid).getByRole('columnheader', { name: 'Row number' })
    const label1 = within(grid).getByRole('columnheader', { name: 'label1' })
    expect(corner.getAttribute('aria-sort')).toBe('ascending')

    fireEvent.click(within(grid).getByRole('columnheader', { name: 'label0' }))
    fireEvent.click(label1)
    await waitFor(() => { expect(firstRowValue(grid, 'label1')).toBe(expected.map(row => String(row.label1)).sort()[0]) })
    expect(corner.getAttribute('aria-sort')).toBe('none')

    fireEvent.click(corner)
    expect(corner.getAttribute('aria-sort')).toBe('ascending')
    expect(label1.getAttribute('aria-sort')).toBe('none')
    await waitFor(() => { expect(within(grid).getAllByRole('rowheader')[0].textContent).toBe('1') })
    expect(firstRowValue(grid, 'label1')).toBe(stringify(expected[0].label1))

    fireEvent.click(label1)
    fireEvent.keyDown(corner, { key: 'Enter' })
    expect(corner.getAttribute('aria-sort')).toBe('ascending')
  })

  it('has one tab stop and moves it with the arrow keys', async () => {
    const { grid } = renderTable()
    await loaded(grid)
    // the scroll area is no extra tab stop while the focusable cell is rendered
    expect(grid.closest('.table-scroll')?.getAttribute('tabindex')).toBe('-1')
    const corner = within(grid).getByRole('columnheader', { name: 'Row number' })
    expect(corner.getAttribute('tabindex')).toBe('0')
    corner.focus()

    fireEvent.keyDown(document.activeElement ?? grid, { key: 'ArrowRight' })
    fireEvent.keyDown(document.activeElement ?? grid, { key: 'ArrowDown' })
    const active = document.activeElement
    expect(active?.getAttribute('role')).toBe('gridcell')
    expect(active?.getAttribute('aria-colindex')).toBe('2')
    expect(active?.parentElement?.getAttribute('aria-rowindex')).toBe('2')
    expect(grid.querySelectorAll('[role=gridcell][tabindex="0"], [role=columnheader][tabindex="0"]')).toHaveLength(1)
  })

  it('continues from a cell focused by other means, e.g. a screen reader', async () => {
    const { grid } = renderTable()
    await loaded(grid)
    const label3 = within(grid).getByRole('columnheader', { name: 'label3' })
    label3.focus()
    expect(label3.getAttribute('tabindex')).toBe('0')
    fireEvent.keyDown(label3, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(within(grid).getByRole('columnheader', { name: 'label4' }))
  })

  it('names rows briefly instead of by their content', async () => {
    const { grid } = renderTable()
    await loaded(grid)
    const [headerRow, firstRow] = within(grid).getAllByRole('row')
    expect(headerRow.getAttribute('aria-label')).toBe('Column headers')
    expect(firstRow.getAttribute('aria-label')).toBe('Row 1')
  })

  it('hides a column from its menu and shows all columns again', async () => {
    const { grid } = renderTable()
    await loaded(grid)
    fireEvent.click(columnMenu(grid, 'label1'))
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Wider', 'Narrower', 'Fit to content', 'Hide column'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide column' }))
    expect(within(grid).queryByRole('columnheader', { name: 'label1' })).toBeNull()

    fireEvent.click(columnMenu(grid, 'label0'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show all columns' }))
    expect(within(grid).getByRole('columnheader', { name: 'label1' })).toBeTruthy()
  })

  it('resizes a column from its menu, persists the width, and fits to content', async () => {
    const { grid } = renderTable()
    await loaded(grid)
    const header = within(grid).getByRole('columnheader', { name: 'label1' })
    const initial = parseFloat(header.style.minWidth)
    expect(initial).toBeGreaterThan(0)

    fireEvent.click(columnMenu(grid, 'label1'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Wider' }))
    expect(header.style.minWidth).toBe(`${initial + 50}px`)
    expect(JSON.parse(localStorage.getItem(widthsStorageKey('sample')) ?? '{}')).toEqual({ label1: initial + 50 })

    fireEvent.click(columnMenu(grid, 'label1'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Narrower' }))
    expect(header.style.minWidth).toBe(`${initial}px`)

    fireEvent.click(columnMenu(grid, 'label1'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Fit to content' }))
    expect(localStorage.getItem(widthsStorageKey('sample'))).toBeNull()
  })

  it('keeps the drag handle out of the accessibility tree and tab order', () => {
    const { grid } = renderTable()
    const handle = grid.querySelector('.column-resizer')
    expect(handle?.getAttribute('aria-hidden')).toBe('true')
    expect(handle?.hasAttribute('tabindex')).toBe(false)
  })

  it('reports fetch errors', async () => {
    const failing: DataFrame = { ...df, fetch: () => Promise.reject(new Error('boom')) }
    df = failing
    const { onError } = renderTable()
    await waitFor(() => { expect(onError).toHaveBeenCalledWith(new Error('boom')) })
  })
})
