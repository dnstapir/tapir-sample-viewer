import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DataSet } from '../src/lib/dataset.ts'
import { createDataSetLoader, listDataSets, loadDataSet } from '../src/lib/dataset.ts'
import type { Sample } from './samples.ts'
import { loadSamples } from './samples.ts'

interface FakeServer {
  fetch: typeof globalThis.fetch
  requests: { method: string; range: string | null }[]
}

function fakeServer({ ranges }: { ranges: boolean }): FakeServer {
  const requests: FakeServer['requests'] = []
  async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const file = await asyncBufferFromFile(new URL(`..${url}`, import.meta.url).pathname)
    const method = init?.method ?? 'GET'
    const range = new Headers(init?.headers).get('Range')
    requests.push({ method, range })
    if (method === 'HEAD') {
      return new Response(null, { status: 200, headers: { 'Content-Length': String(file.byteLength) } })
    }
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

const baseUrl = 'https://public.test.dnstapir.se/parquet-samples/'

function stubIndex(body: unknown, status = 200) {
  vi.stubGlobal('fetch', () => Promise.resolve(Response.json(body, { status })))
}

describe('dataset', () => {
  let samples: Sample[] = []
  beforeAll(async () => {
    samples = await loadSamples()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists the files in index.json, sorted by name, under the base URL', async () => {
    stubIndex({ files: ['b.parquet', 'a.parquet'] })
    expect(await listDataSets()).toEqual([
      { name: 'a.parquet', url: `${baseUrl}a.parquet` },
      { name: 'b.parquet', url: `${baseUrl}b.parquet` },
    ])
  })

  it.each([
    ['null', null],
    ['missing files', {}],
    ['files not an array', { files: 'a.parquet' }],
    ['nested array', { files: [['a.parquet']] }],
    ['non-string entry', { files: [1] }],
    ['not a parquet file', { files: ['index.html'] }],
    ['absolute URL', { files: ['https://evil.example/x.parquet'] }],
    ['protocol-relative URL', { files: ['//evil.example/x.parquet'] }],
    ['path traversal', { files: ['../x.parquet'] }],
  ])('rejects an invalid index.json (%s)', async (_, body) => {
    stubIndex(body)
    await expect(listDataSets()).rejects.toThrow('Invalid index.json format')
  })

  it('rejects a failed index.json request', async () => {
    stubIndex(null, 500)
    await expect(listDataSets()).rejects.toThrow('500')
  })

  it.each([true, false])('loads metadata and a sortable DataFrame (range requests: %s)', async ranges => {
    const server = fakeServer({ ranges })
    vi.stubGlobal('fetch', server.fetch)
    const [sample] = samples
    const entry = { name: sample.name, url: `/src/parquets/${sample.name}` }

    const dataSet = await loadDataSet(entry)

    expect(dataSet.name).toBe(entry.name)
    expect(dataSet.byteLength).toBe(sample.byteLength)
    expect(dataSet.metadata.num_rows).toBe(sample.metadata.num_rows)
    expect(dataSet.df.columnDescriptors.every(c => c.sortable)).toBe(true)

    await dataSet.df.fetch?.({ rowStart: 0, rowEnd: 1, columns: ['label1'] })
    expect(typeof dataSet.df.getCell({ row: 0, column: 'label1' })?.value).toBe('string')
    expect(server.requests[0]).toEqual({ method: 'HEAD', range: null })
    expect(server.requests.some(request => request.range === 'bytes=0-0')).toBe(false)
    expect(server.requests).toHaveLength(2)
  })

  it('createDataSetLoader loads each URL once and retries failed loads', async () => {
    const dataSet = { name: 'a' } as DataSet
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(dataSet)
    const cached = createDataSetLoader(load)
    const entry = { name: 'a', url: '/a.parquet' }

    await expect(cached(entry)).rejects.toThrow('offline')
    expect(await cached(entry)).toBe(dataSet)
    expect(await cached(entry)).toBe(dataSet)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
