import { parquetMetadataAsync } from 'hyparquet'
import type { AsyncBuffer, FileMetaData } from 'hyparquet'
// explicit subpath: vite-plugin-solid makes vitest resolve hyparquet's browser entry
import { asyncBufferFromFile } from 'hyparquet/src/node.js'

export interface Sample {
  name: string
  path: string
  byteLength: number
  metadata: FileMetaData
}

// glob keys only; the parquet modules are never imported. Generated large files are not samples.
const samplePaths = Object.keys(import.meta.glob(['../src/parquets/*.parquet', '!../src/parquets/large-*.parquet']))

/**
 * Reads a file from disk. Bytes are copied into this realm's ArrayBuffer:
 * under jsdom, hyparquet's `instanceof ArrayBuffer` rejects Node's buffers.
 */
export async function openFile(path: string): Promise<AsyncBuffer> {
  const file = await asyncBufferFromFile(path)
  return {
    byteLength: file.byteLength,
    slice: async (start, end) => new Uint8Array(await file.slice(start, end)).slice().buffer,
  }
}

/**
 * Metadata of every bundled sample parquet file, read from disk.
 * Throws if none are found, so sample-based tests cannot pass vacuously.
 */
export function loadSamples(): Promise<Sample[]> {
  if (samplePaths.length === 0) {
    return Promise.reject(new Error('no sample parquet files found in src/parquets/'))
  }
  return Promise.all(samplePaths.map(async relative => {
    const path = new URL(relative, import.meta.url).pathname
    const file = await openFile(path)
    const metadata = await parquetMetadataAsync(file)
    const name = relative.split('/').pop() ?? relative
    return { name, path, byteLength: file.byteLength, metadata }
  }))
}
