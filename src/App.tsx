import type { JSX } from 'solid-js'
import { createEffect, createResource, createSignal } from 'solid-js'
import Layout from './Layout.tsx'
import Page from './Page.tsx'
import { isAbortError } from './lib/abort.ts'
import type { DataSet } from './lib/dataset.ts'
import { createDataSetLoader, listDataSets } from './lib/dataset.ts'
import type { SearchPredicate } from './lib/search.ts'
import { searchAll, searchDataSet } from './lib/searchScan.ts'

interface AppliedSearch {
  predicate: SearchPredicate
  extended: boolean
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export default function App(): JSX.Element {
  const entries = listDataSets()
  const load = createDataSetLoader()
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [dataSet] = createResource(() => entries[selectedIndex()], load)
  const [error, setError] = createSignal<Error>()

  // the last submitted search; undefined shows the selected file unfiltered
  const [search, setSearch] = createSignal<AppliedSearch>()
  const [progress, setProgress] = createSignal<{ file: number, files: number }>()
  let running: AbortController | undefined
  const [result] = createResource(
    (): { search: AppliedSearch, dataSet?: DataSet } | false => {
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
      return searchAll({ entries, load, predicate, signal, onProgress: (file, files) => setProgress({ file, files }) })
    },
  )

  function applySearch(next: AppliedSearch | undefined) {
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

  const status = () => {
    if (!search()) return ''
    if (result.loading) {
      const current = progress()
      return current ? `Searching file ${current.file} of ${current.files}…` : 'Searching…'
    }
    if (result.state !== 'ready') return ''
    const { matches, files } = result()
    const rows = matches === 0 ? 'No matching rows' : `${matches.toLocaleString('en-US')} matching ${matches === 1 ? 'row' : 'rows'}`
    return files > 1 ? `${rows} in ${files} files` : rows
  }

  return <Layout error={error()}>
    <Page
      entries={entries}
      selectedIndex={selectedIndex()}
      onSelect={index => {
        // a new file clears the search result (PLAN.md 4.2)
        applySearch(undefined)
        setSelectedIndex(index)
      }}
      // reading a resource in the error state throws, so only read it when ready
      dataSet={dataSet.state === 'ready' ? dataSet() : undefined}
      loading={dataSet.loading}
      onSearch={submitted => {
        applySearch(submitted.predicate ? { predicate: submitted.predicate, extended: submitted.extended } : undefined)
      }}
      searchStatus={status()}
      searching={result.loading}
      // a cleared search keeps the resource's last value, so check search() too
      searchResult={search() && result.state === 'ready' ? result() : undefined}
      extended={search()?.extended ?? false}
      onError={error => setError(toError(error))}
    />
  </Layout>
}
