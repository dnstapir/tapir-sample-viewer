import type { AsyncBuffer, FileMetaData } from 'hyparquet'
import { asyncBufferFromUrl, cachedAsyncBuffer, parquetMetadataAsync } from 'hyparquet'
import type { DataFrame } from './dataframe.ts'
import { parquetDataFrame } from './parquetDataFrame.ts'
import { sortableDataFrame } from './sortableDataFrame.ts'

export interface DataSetEntry {
  name: string
  url: string
}

export interface DataSet extends DataSetEntry {
  byteLength: number
  metadata: FileMetaData
  file: AsyncBuffer
  rows: DataFrame
  df: DataFrame
}
const baseUrl = 'https://public.test.dnstapir.se/parquet-samples/'

export async function listDataSets(signal?: AbortSignal): Promise<DataSetEntry[]> {
  const res = await fetch(new URL('index.json', baseUrl), { signal })
  if (!res.ok) throw new Error(`Failed to fetch index.json: ${res.status}`)

  const data: unknown = await res.json()
  const files = typeof data === 'object' && data !== null && 'files' in data ? data.files : undefined
  const fileName = /^[\w.-]+\.parquet$/
  if (
    !Array.isArray(files) ||
    !files.every((name): name is string => typeof name === 'string' && fileName.test(name))
  ) {
    throw new Error('Invalid index.json format')
  }

  return files.map(name => ({ name, url: new URL(name, baseUrl).href })).sort((a, b) => a.name.localeCompare(b.name))
}

export async function loadDataSet({ name, url }: DataSetEntry): Promise<DataSet> {
  const file = cachedAsyncBuffer(await asyncBufferFromUrl({ url }))
  const metadata = await parquetMetadataAsync(file)
  const rows = parquetDataFrame(file, metadata)
  return {
    name,
    url,
    byteLength: file.byteLength,
    metadata,
    file,
    rows,
    df: sortableDataFrame(rows),
  }
}

export function createDataSetLoader(load = loadDataSet): (entry: DataSetEntry) => Promise<DataSet> {
  const cache = new Map<string, Promise<DataSet>>()
  return entry => {
    let pending = cache.get(entry.url)
    if (!pending) {
      pending = load(entry)
      cache.set(entry.url, pending)
      pending.catch(() => {
        cache.delete(entry.url)
      })
    }
    return pending
  }
}
