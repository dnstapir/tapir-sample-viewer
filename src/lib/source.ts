import type { AsyncBuffer } from 'hyparquet'
import { asyncBufferFromUrl, cachedAsyncBuffer } from 'hyparquet'

/**
 * Opens a parquet file by URL. Uses HTTP range requests when the server supports them,
 * otherwise the whole file is downloaded once. Repeated byte ranges are cached.
 *
 * The file size comes from a 1-byte range request instead of HEAD: GitHub Pages
 * reports the gzip-compressed size in HEAD Content-Length for compressible types.
 */
export async function openParquetUrl(url: string): Promise<AsyncBuffer> {
  const res = await fetch(url, { headers: { Range: 'bytes=0-0' } })
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`)

  if (res.status === 206) {
    await res.body?.cancel()
    const byteLength = Number(res.headers.get('Content-Range')?.split('/')[1])
    if (!Number.isFinite(byteLength)) throw new Error(`missing Content-Range for ${url}`)
    return cachedAsyncBuffer(await asyncBufferFromUrl({ url, byteLength }))
  }

  // server ignored Range and sent the whole file
  const buffer = await res.arrayBuffer()
  return {
    byteLength: buffer.byteLength,
    slice: (start, end) => buffer.slice(start, end),
  }
}
