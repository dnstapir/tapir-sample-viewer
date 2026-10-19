// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { messages } from '../src/lib/search.ts'
import type { SubmittedSearch } from '../src/search/SearchBar.tsx'
import SearchBar from '../src/search/SearchBar.tsx'

describe('SearchBar', () => {
  afterEach(cleanup)

  function setup(status = '') {
    const onSubmit = vi.fn<(search: SubmittedSearch) => void>()
    render(() => <SearchBar onSubmit={onSubmit} status={status} />)
    const form = screen.getByRole('search', { name: 'Search' })
    const input = screen.getByRole('searchbox', { name: 'Search' })
    const button = screen.getByRole('button', { name: 'Search' })
    function search(query: string) {
      fireEvent.input(input, { target: { value: query } })
      fireEvent.submit(form)
    }
    return { onSubmit, form, input, button, search }
  }

  it('submits a domain search with the predicate columns from the query', () => {
    const { onSubmit, search } = setup()
    search('svt.se')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    const [submitted] = onSubmit.mock.calls[0]
    expect(submitted.extended).toBe(false)
    expect(submitted.predicate?.columns).toEqual(['label0', 'label1'])
  })

  it('submits no predicate for an empty query, to show the file unfiltered', () => {
    const { onSubmit, search } = setup()
    search('  ')
    expect(onSubmit).toHaveBeenCalledWith({ predicate: undefined, extended: false })
  })

  it('shows a linked validation message for a too short query and does not submit', () => {
    const { onSubmit, input, search } = setup()
    search('a')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(messages.tooShort)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(messages.tooShort)

    search('ab')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(input.getAttribute('aria-invalid')).toBeNull()
  })

  it('requires 2 characters in Extended search, also for an empty query', () => {
    const { onSubmit, search } = setup()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Extended search (all files)' }))
    search('')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(messages.tooShortExtended)
  })

  it('applies changed options only on submit and says so until then', () => {
    const { onSubmit, button, search } = setup()
    expect(screen.queryByText(/Options changed/)).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Extended search (all files)' }))
    expect(onSubmit).not.toHaveBeenCalled()
    const note = screen.getByText('Options changed – press Search to update.')
    expect(button.getAttribute('aria-describedby')).toBe(note.id)

    search('svt')
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ extended: true }))
    expect(screen.queryByText(/Options changed/)).toBeNull()
    expect(button.getAttribute('aria-describedby')).toBeNull()
  })

  it('shows the column checkboxes only in Columns mode, with label1 checked by default', () => {
    setup()
    expect(screen.queryByRole('group', { name: 'Columns' })).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Columns' }))
    const group = screen.getByRole('group', { name: 'Columns' })
    const boxes = within(group).getAllByRole('checkbox')
    expect(boxes.map(box => box.closest('label')?.textContent)).toEqual(Array.from({ length: 10 }, (_, i) => `label${i}`))
    expect(boxes.filter(box => (box as HTMLInputElement).checked).map(box => box.closest('label')?.textContent)).toEqual(['label1'])
  })

  it('tells before submitting that at least one column is needed, and does not search without one', () => {
    const { onSubmit, search } = setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Columns' }))
    const group = screen.getByRole('group', { name: 'Columns' })
    fireEvent.click(within(group).getByRole('checkbox', { name: 'label1' }))

    const note = document.getElementById(group.getAttribute('aria-describedby') ?? '')
    expect(note?.textContent).toBe(messages.noColumns)
    expect(note?.getAttribute('role')).toBe('status')

    search('svt')
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.click(within(group).getByRole('checkbox', { name: 'label2' }))
    fireEvent.click(within(group).getByRole('checkbox', { name: 'label0' }))
    expect(note?.textContent).toBe('')
    search('svt')
    expect(onSubmit.mock.calls[0][0].predicate?.columns).toEqual(['label0', 'label2'])
  })

  it('announces the status politely', () => {
    setup('3 matching rows')
    const statuses = screen.getAllByRole('status').map(element => element.textContent)
    expect(statuses).toContain('3 matching rows')
  })

  it('opens the help in a modal dialog with a Close button, including how to sort the table', () => {
    // jsdom does not implement modal dialogs
    const showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
    const close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
    Object.assign(HTMLDialogElement.prototype, { showModal, close })
    setup()
    const help = screen.getByRole('button', { name: 'Help' })
    expect(help.getAttribute('aria-haspopup')).toBe('dialog')

    fireEvent.click(help)
    expect(showModal).toHaveBeenCalledTimes(1)
    const dialog = screen.getByRole('dialog', { name: 'Help' })
    expect(dialog.textContent).toContain('www.svt.se')
    expect(dialog.textContent).toContain('Click or select a column header to sort. Click/select Row number header to restore file order.')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('places the column choice right after the mode and the Options changed note below the options', () => {
    const { form } = setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Columns' }))
    const order = [...form.querySelectorAll('input, p.search-note')].map(element =>
      element instanceof HTMLInputElement ? element.closest('label')?.textContent.trim() : element.textContent)
    expect(order.slice(1)).toEqual([
      'Domain', 'Columns', ...Array.from({ length: 10 }, (_, i) => `label${i}`),
      'Extended search (all files)', 'Options changed – press Search to update.',
    ])
  })
})
