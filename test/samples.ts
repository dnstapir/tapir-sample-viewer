import { parquetMetadataAsync } from 'hyparquet'
import type { FileMetaData } from 'hyparquet'
// explicit subpath: vite-plugin-solid makes vitest resolve hyparquet's browser entry
import { asyncBufferFromFile } from 'hyparquet/src/node.js'

export interface Sample {
  name: string
  path: string
  byteLength: number
  metadata: FileMetaData
}

// glob keys only; the parquet modules are never imported
const samplePaths = Object.keys(import.meta.glob('../src/parquets/*.parquet'))

/**
 * Metadata of every bundled sample parquet file, read from disk.
 */
export function loadSamples(): Promise<Sample[]> {
  return Promise.all(samplePaths.map(async relative => {
    const path = new URL(relative, import.meta.url).pathname
    const file = await asyncBufferFromFile(path)
    const metadata = await parquetMetadataAsync(file)
    const name = relative.split('/').pop() ?? relative
    return { name, path, byteLength: file.byteLength, metadata }
  }))
}
