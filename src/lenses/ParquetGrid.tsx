import type { FileMetaData } from 'hyparquet'
import type { JSX } from 'solid-js'
import { For, createMemo } from 'solid-js'
import { columnCell, columnLabelTitle, gridColumns, rowGroupStats, rowGroupTitle } from '../lib/grid.ts'

function parity(index: number): string {
  return index % 2 === 0 ? 'even' : 'odd'
}

function pagesText(stats: { totalPages: number, dataPages: number, dictPages: number }): string {
  if (stats.totalPages === 0) return ''
  return `${stats.totalPages.toLocaleString()} (${stats.dataPages} data, ${stats.dictPages} dictionary)`
}

/**
 * Row groups × column chunks with widths proportional to compressed size.
 * The bars are hidden from assistive technology; the same numbers are offered as a table below.
 */
export default function ParquetGrid(props: { metadata: FileMetaData }): JSX.Element {
  const columns = createMemo(() => gridColumns(props.metadata))
  const rowGroups = createMemo(() => props.metadata.row_groups.map((rowGroup, i) => ({
    index: i,
    stats: rowGroupStats(rowGroup),
    cells: rowGroup.columns.map((_, j) => columnCell(i, rowGroup, j, columns().maxes[j] ?? 0)),
  })))
  const totals = createMemo(() => rowGroups().reduce((sum, { stats }) => ({
    numRows: sum.numRows + stats.numRows,
    compressed: sum.compressed + stats.compressed,
    uncompressed: sum.uncompressed + stats.uncompressed,
  }), { numRows: 0, compressed: 0, uncompressed: 0 }))

  return <div class="viewer">
    <div class="parquet-grid" aria-hidden="true">
      <div class="grid-label">Row group</div>
      <div class="grid-row" style={{ 'grid-template-columns': columns().template }}>
        <For each={columns().names}>
          {(name, j) => <div class={`column-label ${parity(j())}`} title={columnLabelTitle(name, columns().totals[j()])}>
            {name}
          </div>}
        </For>
      </div>
      <For each={rowGroups()}>
        {rowGroup => <div class="grid-row-wrapper">
          <div class="grid-label" title={rowGroupTitle(rowGroup.index, rowGroup.stats)}>{rowGroup.index}</div>
          <div class="grid-row" style={{ 'grid-template-columns': columns().template }}>
            <For each={rowGroup.cells}>
              {(cell, j) => <div class={`column-cell ${parity(j())}`} title={cell.title}>
                <div class="column-bar" style={{ width: `${cell.widthPercent}%` }} />
              </div>}
            </For>
          </div>
        </div>}
      </For>
    </div>

    <details class="grid-details">
      <summary>Show as table</summary>
      <div class="grid-table-wrapper">
        <table class="grid-table">
          <caption>Compressed bytes per row group and column</caption>
          <thead>
            <tr>
              <th scope="col">Row group</th>
              <th scope="col">Rows</th>
              <th scope="col">Compressed</th>
              <th scope="col">Uncompressed</th>
              <th scope="col">Pages</th>
              <For each={columns().names}>{name => <th scope="col">{name}</th>}</For>
            </tr>
          </thead>
          <tbody>
            <For each={rowGroups()}>
              {rowGroup => <tr>
                <th scope="row">{rowGroup.index}</th>
                <td>{rowGroup.stats.numRows.toLocaleString()}</td>
                <td>{rowGroup.stats.compressed.toLocaleString()}</td>
                <td>{rowGroup.stats.uncompressed.toLocaleString()}</td>
                <td>{pagesText(rowGroup.stats)}</td>
                <For each={rowGroup.cells}>{cell => <td>{cell.bytes.toLocaleString()}</td>}</For>
              </tr>}
            </For>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>{totals().numRows.toLocaleString()}</td>
              <td>{totals().compressed.toLocaleString()}</td>
              <td>{totals().uncompressed.toLocaleString()}</td>
              <td />
              <For each={columns().totals}>{total => <td>{total.toLocaleString()}</td>}</For>
            </tr>
          </tfoot>
        </table>
      </div>
    </details>
  </div>
}
