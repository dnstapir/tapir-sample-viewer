import type { JSX } from 'solid-js'
import { createEffect, createResource, createSignal } from 'solid-js'
import Layout from './Layout.tsx'
import { isAbortError } from './lib/abort.ts'
import type { DataSet } from './lib/dataset.ts'
import { createDataSetLoader, listDataSets } from './lib/dataset.ts'
import type { SubmittedSearch } from './lib/search.ts'
import { searchAll, searchDataSet } from './lib/searchScan.ts'
import Page from './Page.tsx'

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export default function App(): JSX.Element {
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [entries] = createResource(() => listDataSets())
  const entryList = () => (entries.state === 'ready' ? entries() : [])

  const load = createDataSetLoader()
  const [dataSet] = createResource(() => entryList()[selectedIndex()], load)
  const [error, setError] = createSignal<Error>()

  const [search, setSearch] = createSignal<SubmittedSearch>()
  const [progress, setProgress] = createSignal<{ file: number; files: number }>()
  let running: AbortController | undefined
  const [result] = createResource(
    (): { search: SubmittedSearch; dataSet?: DataSet } | false => {
      const current = search()
      if (!current) return false
      if (current.extended) return { search: current }
      return dataSet.state === 'ready' ? { search: current, dataSet: dataSet() } : false
    },
    ({ search: { predicate }, dataSet: selected }) => {
      running = new AbortController()
      const { signal } = running
      setProgress(undefined)
      if (selected) return searchDataSet(selected, predicate, signal)
      return searchAll({
        entries: entryList(),
        load,
        predicate,
        signal,
        onProgress: (file, files) => setProgress({ file, files }),
      })
    },
  )

  function applySearch(next: SubmittedSearch | undefined) {
    running?.abort()
    setSearch(next)
  }

  createEffect(() => {
    if (dataSet.error) setError(toError(dataSet.error))
  })
  createEffect(() => {
    const searchError: unknown = result.error
    if (searchError && !isAbortError(searchError)) setError(toError(searchError))
  })
  createEffect(() => {
    if (entries.error) setError(toError(entries.error))
  })

  const status = () => {
    if (!search()) return ''
    if (result.loading) {
      const current = progress()
      return current ? `Searching file ${current.file} of ${current.files}…` : 'Searching…'
    }
    if (result.state !== 'ready') return ''
    const { matches, files } = result()
    const rows =
      matches === 0
        ? 'No matching rows'
        : `${matches.toLocaleString('en-US')} matching ${matches === 1 ? 'row' : 'rows'}`
    return files > 1 ? `${rows} in ${files} files` : rows
  }

  return (
    <Layout error={error()}>
      <Page
        entries={entryList()}
        selectedIndex={selectedIndex()}
        onSelect={index => {
          applySearch(undefined)
          setSelectedIndex(index)
        }}
        dataSet={dataSet.state === 'ready' ? dataSet() : undefined}
        loading={entries.loading || dataSet.loading}
        onSearch={applySearch}
        searchStatus={status()}
        searching={result.loading}
        searchResult={search() && result.state === 'ready' ? result() : undefined}
        extended={search()?.extended ?? false}
        onError={error => setError(toError(error))}
      />
    </Layout>
  )
}
