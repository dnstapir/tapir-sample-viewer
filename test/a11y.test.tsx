// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library'
import axe from 'axe-core'
import { sortableDataFrame } from 'hightable/dataframe'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import Layout from '../src/Layout.tsx'
import type { DataSet } from '../src/lib/dataset.ts'
import { parquetDataFrame } from '../src/lib/parquetDataFrame.ts'
import Page from '../src/Page.tsx'
import { loadSamples, openFile } from './samples.ts'

// colour contrast needs a real layout engine; it is checked in the browser
async function violations(): Promise<string[]> {
  const results = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
  })
  return results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)
}

describe('accessibility (axe-core)', () => {
  let dataSet: DataSet
  beforeAll(async () => {
    const [sample] = await loadSamples()
    const file = await openFile(sample.path)
    const rows = parquetDataFrame(file, sample.metadata)
    dataSet = {
      name: sample.name,
      url: sample.path,
      byteLength: sample.byteLength,
      metadata: sample.metadata,
      file,
      rows,
      df: sortableDataFrame(rows),
    }
  })
  afterEach(cleanup)

  function renderPage(status = '') {
    const main = document.body.appendChild(document.createElement('main'))
    render(
      () => (
        <Layout>
          <Page
            entries={[{ name: dataSet.name, url: dataSet.url }]}
            selectedIndex={0}
            onSelect={vi.fn()}
            dataSet={dataSet}
            loading={false}
            onSearch={vi.fn()}
            searchStatus={status}
            searching={false}
            extended={false}
            onError={vi.fn()}
          />
        </Layout>
      ),
      { container: main },
    )
  }

  async function showLens(name: string) {
    fireEvent.click(screen.getByRole('button', { name: /^View:/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: new RegExp(`^View:\\s*${name}$`) })).toBeTruthy()
    })
  }

  it('reports violations (the check is not vacuous)', async () => {
    renderPage()
    document.querySelector('main')?.appendChild(document.createElement('img'))
    expect((await violations()).some(v => v.startsWith('image-alt'))).toBe(true)
  })

  it('Table lens with data has no violations', async () => {
    renderPage('2 matching rows')
    await waitFor(() => {
      expect(document.querySelector('td[aria-busy="true"]')).toBeNull()
    })
    expect(await violations()).toEqual([])
  })

  it('Table lens with the column menu open has no violations', async () => {
    renderPage()
    fireEvent.click(
      within(screen.getByRole('columnheader', { name: 'label1' })).getByRole('button', { name: 'Column menu' }),
    )
    expect(await violations()).toEqual([])
  })

  it('search in Columns mode with a validation message has no violations', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('radio', { name: 'Columns' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'label1' }))
    fireEvent.submit(document.querySelector('search form') as HTMLFormElement)
    expect(await violations()).toEqual([])
  })

  it.each(['Metadata', 'Layout', 'Grid'])('%s lens has no violations', async lens => {
    renderPage()
    await showLens(lens)
    expect(await violations()).toEqual([])
  })
})
