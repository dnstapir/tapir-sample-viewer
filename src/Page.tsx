import type { JSX } from 'solid-js'
import { For, Match, Show, Switch, createSignal } from 'solid-js'
import Dropdown from './components/Dropdown.tsx'
import ParquetMetadata from './lenses/ParquetMetadata.tsx'
import type { DataSet, DataSetEntry } from './lib/dataset.ts'
import { formatFileSize } from './lib/format.ts'

type Lens = 'table' | 'metadata' | 'layout' | 'grid'

const lenses: Lens[] = ['table', 'metadata', 'layout', 'grid']
const lensLabels: Record<Lens, string> = { table: 'Table', metadata: 'Metadata', layout: 'Layout', grid: 'Grid' }

interface PageProps {
  entries: DataSetEntry[]
  selectedIndex: number
  onSelect: (index: number) => void
  dataSet?: DataSet
  loading: boolean
}

/**
 * Header with file picker, file summary, lens picker and the selected lens.
 */
export default function Page(props: PageProps): JSX.Element {
  const [lens, setLens] = createSignal<Lens>('table')
  const lensItems = () => lenses.map(name => ({
    label: lensLabels[name],
    checked: lens() === name,
    onSelect: () => setLens(name),
  }))

  return <Show when={props.entries.length > 0} fallback={<p class="placeholder">No parquet files found</p>}>
    <header class="top-header">
      <h1>
        <img class="tapir-logo" src="TAPIR-positiv.svg" alt="" />
        DNS Tapir
      </h1>
      <select aria-label="Parquet file" onChange={event => { props.onSelect(Number(event.currentTarget.value)) }}>
        <For each={props.entries}>
          {(entry, index) => <option value={index()} selected={index() === props.selectedIndex}>{entry.name}</option>}
        </For>
      </select>
    </header>
    <Show when={props.dataSet} fallback={<p role="status" class="placeholder">{props.loading ? 'Loading…' : ''}</p>}>
      {dataSet => <>
        <div class="view-header">
          <span title={`${dataSet().byteLength.toLocaleString()} bytes`}>{formatFileSize(dataSet().byteLength)}</span>
          <span>{dataSet().df.numRows.toLocaleString()} rows</span>
          <Dropdown
            label={<><span class="visually-hidden">View: </span>{lensLabels[lens()]}</>}
            items={lensItems()}
          />
        </div>
        <Switch>
          <Match when={lens() === 'table'}>
            <p class="placeholder">The table view is being ported (phase 5).</p>
          </Match>
          <Match when={lens() === 'metadata'}>
            <ParquetMetadata metadata={dataSet().metadata} />
          </Match>
          <Match when={lens() === 'layout'}>
            <p class="placeholder">The layout view is being ported (phase 4).</p>
          </Match>
          <Match when={lens() === 'grid'}>
            <p class="placeholder">The grid view is being ported (phase 4).</p>
          </Match>
        </Switch>
      </>}
    </Show>
  </Show>
}
