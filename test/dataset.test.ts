import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { listDataSets, loadDataSet } from '../src/lib/dataset.ts'
import type { Sample } from './samples.ts'
import { loadSamples } from './samples.ts'

interface FakeServer {
  fetch: typeof globalThis.fetch
  requests: { method: string, range: string | null }[]
}

/**
 * Serves files from disk like a static host. `ranges: false` mimics a server without range support.
 */
function fakeServer({ ranges }: { ranges: boolean }): FakeServer {
  const requests: FakeServer['requests'] = []
  async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const file = await asyncBufferFromFile(new URL(`..${url}`, import.meta.url).pathname)
    const method = init?.method ?? 'GET'
    const range = new Headers(init?.headers).get('Range')
    requests.push({ method, range })
    const match = ranges && range ? /^bytes=(\d+)-(\d*)$/.exec(range) : null
    if (!match) {
      return new Response(await file.slice(0), { status: 200 })
    }
    const start = Number(match[1])
    const end = match[2] ? Number(match[2]) + 1 : file.byteLength
    return new Response(await file.slice(start, end), {
      status: 206,
      headers: { 'Content-Range': `bytes ${start}-${end - 1}/${file.byteLength}` },
    })
  }
  return { fetch: fakeFetch, requests }
}

describe('dataset', () => {
  let samples: Sample[] = []
  beforeAll(async () => {
    samples = await loadSamples()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists every bundled parquet file, sorted by name', () => {
    const names = listDataSets().map(entry => entry.name)
    expect(names).toEqual(samples.map(sample => sample.name).sort((a, b) => a.localeCompare(b)))
  })

  it.each([true, false])('loads metadata and a sortable DataFrame (range requests: %s)', async ranges => {
    const server = fakeServer({ ranges })
    vi.stubGlobal('fetch', server.fetch)
    const [entry] = listDataSets()
    const sample = samples.find(s => s.name === entry.name)

    const dataSet = await loadDataSet(entry)

    expect(dataSet.name).toBe(entry.name)
    expect(dataSet.byteLength).toBe(sample?.byteLength)
    expect(dataSet.metadata.num_rows).toBe(sample?.metadata.num_rows)
    expect(dataSet.df.columnDescriptors.every(c => c.sortable)).toBe(true)

    await dataSet.df.fetch?.({ rowStart: 0, rowEnd: 1, columns: ['label1'] })
    expect(typeof dataSet.df.getCell({ row: 0, column: 'label1' })?.value).toBe('string')
    expect(server.requests[0]).toEqual({ method: 'GET', range: 'bytes=0-0' })
    expect(server.requests.some(request => request.method === 'HEAD')).toBe(false)
    if (!ranges) {
      // whole file came with the size probe; nothing else is downloaded
      expect(server.requests).toHaveLength(1)
    }
  })
})
