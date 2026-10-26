// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@solidjs/testing-library'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import ParquetGrid from '../src/lenses/ParquetGrid.tsx'
import { gridColumns, rowGroupStats } from '../src/lib/grid.ts'
import type { Sample } from './samples.ts'
import { loadSamples } from './samples.ts'

describe('ParquetGrid', () => {
  let sample: Sample
  beforeAll(async () => {
    ;[sample] = await loadSamples()
  })
  afterEach(cleanup)

  it('hides the visual bars from assistive technology but keeps mouse tooltips', () => {
    const { container } = render(() => <ParquetGrid metadata={sample.metadata} />)
    const grid = container.querySelector('.parquet-grid')
    expect(grid?.getAttribute('aria-hidden')).toBe('true')
    const columns = sample.metadata.row_groups[0].columns.length
    expect(grid?.querySelectorAll('.column-cell[title]')).toHaveLength(columns * sample.metadata.row_groups.length)
  })

  it('offers the same numbers as a table with row and column headers', () => {
    render(() => <ParquetGrid metadata={sample.metadata} />)
    fireEvent.click(screen.getByText('Show as table'))
    const table = screen.getByRole('table', { name: 'Compressed bytes per row group and column' })

    const { names, totals } = gridColumns(sample.metadata)
    const headers = within(table)
      .getAllByRole('columnheader')
      .map(th => th.textContent)
    expect(headers).toEqual(['Row group', 'Rows', 'Compressed', 'Uncompressed', 'Pages', ...names])

    const stats = rowGroupStats(sample.metadata.row_groups[0])
    const firstRow = within(table).getByRole('rowheader', { name: '0' }).closest('tr')
    expect(firstRow?.children[2].textContent).toBe(stats.compressed.toLocaleString())

    const totalRow = within(table).getByRole('rowheader', { name: 'Total' }).closest('tr')
    expect(totalRow?.lastElementChild?.textContent).toBe(totals[totals.length - 1].toLocaleString())
  })
})
