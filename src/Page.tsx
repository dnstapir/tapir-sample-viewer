import type { JSX } from 'solid-js'
import { createSignal, createUniqueId, For, Match, Show, Switch } from 'solid-js'
import Dropdown from './components/Dropdown.tsx'
import ParquetGrid from './lenses/ParquetGrid.tsx'
import ParquetLayout from './lenses/ParquetLayout.tsx'
import ParquetMetadata from './lenses/ParquetMetadata.tsx'
import type { DataSet, DataSetEntry } from './lib/dataset.ts'
import { formatFileSize } from './lib/format.ts'
import type { SubmittedSearch } from './lib/search.ts'
import type { SearchResult } from './lib/searchScan.ts'
import SearchBar from './search/SearchBar.tsx'
import Table from './table/Table.tsx'

type Lens = 'table' | 'metadata' | 'layout' | 'grid'

const lenses: Lens[] = ['table', 'metadata', 'layout', 'grid']
const lensLabels: Record<Lens, string> = { table: 'Table', metadata: 'Metadata', layout: 'Layout', grid: 'Grid' }

interface PageProps {
  entries: DataSetEntry[]
  selectedIndex: number
  onSelect: (index: number) => void
  dataSet?: DataSet
  loading: boolean
  onSearch: (search: SubmittedSearch | undefined) => void
  searchStatus: string
  searching: boolean
  searchResult?: SearchResult
  extended: boolean
  onError: (error: unknown) => void
}

export default function Page(props: PageProps): JSX.Element {
  const [lens, setLens] = createSignal<Lens>('table')
  const [extendedChecked, setExtendedChecked] = createSignal(false)
  const fileSelectId = createUniqueId()
  const lensItems = () =>
    lenses.map(name => ({
      label: lensLabels[name],
      checked: lens() === name,
      onSelect: () => setLens(name),
    }))

  function rowSummary(dataSet: DataSet): string {
    const total = dataSet.df.numRows.toLocaleString('en-US')
    const result = props.searchResult
    if (!result) return `${total} rows`
    const matches = result.matches.toLocaleString('en-US')
    return props.extended
      ? `${matches} ${result.matches === 1 ? 'row' : 'rows'} from ${result.files} files`
      : `${matches} of ${total} rows`
  }

  return (
    <Show when={props.entries.length > 0} fallback={<p class="placeholder">No parquet files found</p>}>
      <header class="top-header">
        <h1>
          <img class="tapir-logo" src="TAPIR-positiv.svg" alt="" />
          DNS Tapir Parquet Parser
        </h1>
      </header>
      <div class="file-chooser">
        <label for={fileSelectId}>Choose file</label>
        <select
          id={fileSelectId}
          disabled={extendedChecked()}
          onChange={event => {
            props.onSelect(Number(event.currentTarget.value))
          }}
        >
          <For each={props.entries}>
            {(entry, index) => (
              <option value={index()} selected={index() === props.selectedIndex}>
                {entry.name}
              </option>
            )}
          </For>
        </select>
      </div>
      <SearchBar
        onSubmit={search => {
          props.onSearch(search)
        }}
        onExtendedChange={setExtendedChecked}
        status={props.searchStatus}
      />
      <Show
        when={props.dataSet}
        fallback={
          <p role="status" class="placeholder">
            {props.loading ? 'Loading…' : ''}
          </p>
        }
      >
        {dataSet => (
          <>
            <div class="view-header">
              <Show when={!props.extended}>
                <span title={`${dataSet().byteLength.toLocaleString()} bytes`}>
                  {formatFileSize(dataSet().byteLength)}
                </span>
              </Show>
              <span>{rowSummary(dataSet())}</span>
              <Dropdown
                label={
                  <>
                    <span class="visually-hidden">View: </span>
                    {lensLabels[lens()]}
                  </>
                }
                items={lensItems()}
              />
            </div>
            <Switch>
              <Match when={lens() === 'table'}>
                <Show when={!props.searching} fallback={<p class="placeholder">Searching…</p>}>
                  <Show when={props.searchResult ?? dataSet()} keyed>
                    {current => (
                      <Table
                        df={current.df}
                        name={current.name}
                        label={props.searchResult ? 'Search results' : 'Table'}
                        onError={props.onError}
                      />
                    )}
                  </Show>
                </Show>
              </Match>
              <Match when={lens() === 'metadata'}>
                <ParquetMetadata metadata={dataSet().metadata} />
              </Match>
              <Match when={lens() === 'layout'}>
                <ParquetLayout byteLength={dataSet().byteLength} metadata={dataSet().metadata} />
              </Match>
              <Match when={lens() === 'grid'}>
                <ParquetGrid metadata={dataSet().metadata} />
              </Match>
            </Switch>
          </>
        )}
      </Show>
    </Show>
  )
}
