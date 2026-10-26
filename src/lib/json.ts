/* Ported from hyperparam's Json component (MIT). */

export function isPrimitive(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (!Array.isArray(value) && typeof value !== 'object' && typeof value !== 'function' && typeof value !== 'string')
  )
}

export function stringifyPrimitive(value: unknown): string {
  if (typeof value === 'bigint') return value.toString()
  if (value === undefined) return 'undefined'
  return JSON.stringify(value)
}

export function shouldObjectCollapse(obj: object): boolean {
  const values = Object.values(obj)
  return values.every(isPrimitive) || values.length >= 100
}

export function previewCount(
  entries: [string | undefined, unknown][],
  maxCharacters: number,
): { count: number; truncated: boolean } {
  const separator = ', '
  const keySeparator = ': '
  let characters = 0
  for (const [index, [key, value]] of entries.entries()) {
    if (index > 0) characters += separator.length
    if (!isPrimitive(value)) return { count: index, truncated: true }
    characters += (key === undefined ? 0 : key.length + keySeparator.length) + stringifyPrimitive(value).length
    if (characters >= maxCharacters) return { count: index, truncated: true }
  }
  return { count: entries.length, truncated: false }
}

export function formatHexDump(bytes: Uint8Array): { offset: string; hex: string; ascii: string }[] {
  const lines: { offset: string; hex: string; ascii: string }[] = []
  for (let i = 0; i < bytes.length; i += 16) {
    const slice = Array.from(bytes.slice(i, i + 16))
    lines.push({
      offset: i.toString(16).padStart(8, '0'),
      hex: slice
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ')
        .padEnd(47),
      ascii: slice.map(b => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.')).join(''),
    })
  }
  return lines
}
