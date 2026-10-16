import type { DataFrame } from 'hightable/dataframe'
import { sortableDataFrame } from 'hightable/dataframe'
import type { FileMetaData } from 'hyparquet'
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
  df: DataFrame
}

// URLs only; file contents are fetched in loadDataSet
const parquetUrls = import.meta.glob<string>('../parquets/*.parquet', {
  eager: true,
  query: '?url',
  import: 'default',
})

/**
 * Bundled parquet files, sorted by name. Nothing is downloaded.
 */
export function listDataSets(): DataSetEntry[] {
  return Object.entries(parquetUrls)
    .map(([path, url]) => ({ name: path.split('/').pop() ?? path, url }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Reads the footer metadata and returns a lazily loaded, sortable DataFrame.
 */
export async function loadDataSet({ name, url }: DataSetEntry): Promise<DataSet> {
  const file = await openParquetUrl(url)
  const metadata = await parquetMetadataAsync(file)
  const df = sortableDataFrame(parquetDataFrame(file, metadata))
  return { name, url, byteLength: file.byteLength, metadata, df }
}
