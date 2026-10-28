/* Ported from HighTable v0.26.4 (MIT, https://github.com/hyparam/hightable): src/utils/stringify.ts. */

/** Robust stringification of any value, including bigints, dates and nested objects. */
export function stringify(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') {
    return value.toLocaleString('en-US', { maximumFractionDigits: 7 })
  }
  if (typeof value === 'boolean') return value.toString()
  if (Array.isArray(value)) {
    return `[\n${value.map(v => indent(stringify(v), 2)).join(',\n')}\n]`
  }
  // JSON.stringify returns undefined (not a string) for undefined
  if (value === null || value === undefined) return JSON.stringify(value)
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) return `${value.name}: ${value.message}`
  if (typeof value === 'object') {
    return `{\n${Object.entries(value)
      .filter(d => d[1] !== undefined)
      .map(([k, v]) => indent(`${k}: ${stringify(v)}`, 2))
      .join(',\n')}\n}`
  }
  return JSON.stringify(value)
}

function indent(text: string | undefined, spaces: number) {
  return text
    ?.split('\n')
    .map(line => ' '.repeat(spaces) + line)
    .join('\n')
}
