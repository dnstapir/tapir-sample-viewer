import type { DataFrame } from 'hightable/dataframe'
import { sortableDataFrame } from 'hightable/dataframe'
import type { AsyncBuffer, FileMetaData } from 'hyparquet'
import { parquetMetadataAsync } from 'hyparquet'
import { parquetDataFrame } from './parquetDataFrame.ts'
import { openParquetUrl } from './source.ts'

export interface DataSetEntry {
  name: string
  url: string
}

export interface DataSet extends DataSetEntry {
  byteLength: number
  metadata: FileMetaData
  file: AsyncBuffer
  // unsorted; search results are views on it and share its cell cache
  rows: DataFrame
  df: DataFrame
}

const parquetUrls = import.meta.glob<string>('../parquets/*.parquet', {
  eager: true,
  query: '?url',
  import: 'default',
})

export function listDataSets(): DataSetEntry[] {
  return Object.entries(parquetUrls)
    .map(([path, url]) => ({ name: path.split('/').pop() ?? path, url }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function loadDataSet({ name, url }: DataSetEntry): Promise<DataSet> {
  const file = await openParquetUrl(url)
  const metadata = await parquetMetadataAsync(file)
  const rows = parquetDataFrame(file, metadata)
  return { name, url, byteLength: file.byteLength, metadata, file, rows, df: sortableDataFrame(rows) }
}

// failed loads are not cached, so they can be retried
export function createDataSetLoader(load = loadDataSet): (entry: DataSetEntry) => Promise<DataSet> {
  const cache = new Map<string, Promise<DataSet>>()
  return entry => {
    let pending = cache.get(entry.url)
    if (!pending) {
      pending = load(entry)
      cache.set(entry.url, pending)
      pending.catch(() => { cache.delete(entry.url) })
    }
    return pending
  }
}
