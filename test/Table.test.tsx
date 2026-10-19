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
    render(() => <Table df={df} name="sample" onError={onError} />)
    return { grid: screen.getByRole('grid', { name: 'sample' }), onError }
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
    const scroller = screen.getByRole('group', { name: 'sample' })
    fireEvent.keyDown(scroller, { key: 'Enter' })
    expect(document.activeElement?.getAttribute('aria-colindex')).toBe('1')

    fireEvent.keyDown(document.activeElement ?? grid, { key: 'ArrowRight' })
    fireEvent.keyDown(document.activeElement ?? grid, { key: 'ArrowDown' })
    const active = document.activeElement
    expect(active?.getAttribute('role')).toBe('gridcell')
    expect(active?.getAttribute('aria-colindex')).toBe('2')
    expect(active?.parentElement?.getAttribute('aria-rowindex')).toBe('2')
    expect(grid.querySelectorAll('[role=gridcell][tabindex="0"], [role=columnheader][tabindex="0"]')).toHaveLength(1)
  })

  it('hides a column from its menu and shows all columns again', async () => {
    const { grid } = renderTable()
    await loaded(grid)
    fireEvent.click(screen.getByRole('button', { name: 'Column menu for label1' }))
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Hide column'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide column' }))
    expect(within(grid).queryByRole('columnheader', { name: 'label1' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Column menu for label0' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show all columns' }))
    expect(within(grid).getByRole('columnheader', { name: 'label1' })).toBeTruthy()
  })

  it('resizes a column with the keyboard, persists the width, and auto-sizes on Enter', async () => {
    const { grid } = renderTable()
    await loaded(grid)
    const resizer = screen.getByRole('separator', { name: 'Resize column label1' })
    const initial = Number(resizer.getAttribute('aria-valuenow'))
    expect(initial).toBeGreaterThan(0)

    fireEvent.keyDown(resizer, { key: 'ArrowRight' })
    expect(resizer.getAttribute('aria-valuenow')).toBe(String(initial + 10))
    expect(JSON.parse(localStorage.getItem(widthsStorageKey('sample')) ?? '{}')).toEqual({ label1: initial + 10 })

    fireEvent.keyDown(resizer, { key: 'Enter' })
    expect(localStorage.getItem(widthsStorageKey('sample'))).toBeNull()
  })

  it('reports fetch errors', async () => {
    const failing: DataFrame = { ...df, fetch: () => Promise.reject(new Error('boom')) }
    df = failing
    const { onError } = renderTable()
    await waitFor(() => { expect(onError).toHaveBeenCalledWith(new Error('boom')) })
  })
})
