// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ErrorBar from '../src/components/ErrorBar.tsx'

describe('ErrorBar', () => {
  afterEach(cleanup)

  it('renders an empty alert region without an error', () => {
    render(() => <ErrorBar />)
    expect(screen.getByRole('alert').textContent).toBe('')
  })

  it('shows the error, hides it on close, and shows a new error again', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const [error, setError] = createSignal<Error | undefined>(new Error('first'))
    render(() => <ErrorBar error={error()} />)

    expect(screen.getByRole('alert').textContent).toContain('Error: first')

    fireEvent.click(screen.getByRole('button', { name: 'Close error message' }))
    expect(screen.getByRole('alert').textContent).toBe('')

    setError(new Error('second'))
    expect(screen.getByRole('alert').textContent).toContain('Error: second')
  })
})
