// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Page from '../src/Page.tsx'

describe('Page', () => {
  afterEach(cleanup)

  it('enables the file selector as soon as Extended search is unchecked, before searching', () => {
    const onSelect = vi.fn()
    const onSearch = vi.fn()
    render(() => <Page
      entries={[{ name: 'a.parquet', url: '/a' }, { name: 'b.parquet', url: '/b' }]}
      selectedIndex={0}
      onSelect={onSelect}
      loading
      onSearch={onSearch}
      searchStatus=""
      searching={false}
      extended
      onError={vi.fn()}
    />)
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Parquet file' })
    const extended = screen.getByRole('checkbox', { name: 'Extended search (all files)' })

    fireEvent.click(extended)
    expect(select.disabled).toBe(true)
    fireEvent.click(extended)
    expect(select.disabled).toBe(false)
    expect(onSearch).not.toHaveBeenCalled()

    fireEvent.change(select, { target: { value: '1' } })
    expect(onSelect).toHaveBeenCalledWith(1)
  })
})
