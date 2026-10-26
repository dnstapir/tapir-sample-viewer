// @vitest-environment jsdom
import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import ParquetLayout from '../src/lenses/ParquetLayout.tsx'
import type { Sample } from './samples.ts'
import { loadSamples } from './samples.ts'

describe('ParquetLayout', () => {
  let sample: Sample
  beforeAll(async () => {
    ;[sample] = await loadSamples()
  })
  afterEach(cleanup)

  it('shows magic bytes, row groups with labelled column groups, and the footer', () => {
    const { container } = render(() => <ParquetLayout byteLength={sample.byteLength} metadata={sample.metadata} />)
    const names = Array.from(container.querySelectorAll('.cell-name'), el => el.textContent)

    expect(names[0]).toBe('PAR1')
    expect(names[1]).toBe('RowGroup 0')
    expect(names.at(-2)).toBe('Metadata')
    expect(names.at(-1)).toBe('PAR1')

    const columns = sample.metadata.row_groups[0].columns.length
    expect(screen.getAllByRole('group', { name: /^Column '/ })).toHaveLength(columns)
    expect(screen.getByRole('group', { name: 'RowGroup 0' })).toBeTruthy()
  })

  it('ends with the trailing magic at the end of the file', () => {
    const { container } = render(() => <ParquetLayout byteLength={sample.byteLength} metadata={sample.metadata} />)
    const lastCell = container.querySelector('.layout > .cell:last-child')
    expect(lastCell?.textContent).toContain(`end ${sample.byteLength.toLocaleString()}`)
    expect(lastCell?.textContent).toContain('bytes 4')
  })
})
