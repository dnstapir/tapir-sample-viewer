import type { JSX } from 'solid-js'
import { createEffect, createResource, createSignal } from 'solid-js'
import Layout from './Layout.tsx'
import Page from './Page.tsx'
import { listDataSets, loadDataSet } from './lib/dataset.ts'

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export default function App(): JSX.Element {
  const entries = listDataSets()
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [dataSet] = createResource(() => entries[selectedIndex()], loadDataSet)
  const [error, setError] = createSignal<Error>()

  createEffect(() => {
    if (dataSet.error) setError(toError(dataSet.error))
  })

  return <Layout error={error()}>
    <Page
      entries={entries}
      selectedIndex={selectedIndex()}
      onSelect={setSelectedIndex}
      // reading a resource in the error state throws, so only read it when ready
      dataSet={dataSet.state === 'ready' ? dataSet() : undefined}
      loading={dataSet.loading}
    />
  </Layout>
}
