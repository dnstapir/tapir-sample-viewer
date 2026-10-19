// Writes a large test file from the sample rows (gitignored, never deployed).
// Usage: pnpm generate:large [rows]   (default 200000 rows, row groups of 50000)
import { readFileSync, readdirSync } from 'node:fs'
import { parquetMetadata, parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { parquetWriteFile } from 'hyparquet-writer'

const dir = new URL('../src/parquets/', import.meta.url)
const numRows = Number(process.argv[2] ?? 200_000)
const rowGroupSize = 50_000
if (!Number.isInteger(numRows) || numRows <= 0) throw new Error(`invalid row count: ${process.argv[2]}`)

const samples = readdirSync(dir).filter(name => name.endsWith('.parquet') && !name.startsWith('large-')).sort()
if (samples.length === 0) throw new Error('no sample parquet files found')

let schema
const sampleRows = []
for (const name of samples) {
  const bytes = readFileSync(new URL(name, dir))
  const file = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const metadata = parquetMetadata(file)
  schema ??= metadata.schema
  sampleRows.push(...await parquetReadObjects({ file, metadata, compressors }))
}

const firstTime = sampleRows[0].start_time.getTime()
const columns = schema.slice(1).map(element => element.name)
const columnData = columns.map(name => ({
  name,
  data: Array.from({ length: numRows }, (_, row) => {
    if (name === 'start_time') return BigInt(firstTime + Math.floor(row / 1000) * 60_000) * 1000n
    return sampleRows[row % sampleRows.length][name] ?? null
  }),
}))

const filename = new URL(`large-${numRows}.parquet`, dir).pathname
parquetWriteFile({ filename, columnData, schema, rowGroupSize })
console.log(`wrote ${filename}: ${numRows} rows, ${Math.ceil(numRows / rowGroupSize)} row groups`)
