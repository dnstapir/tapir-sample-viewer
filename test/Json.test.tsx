// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it } from 'vitest'
import Json from '../src/components/Json.tsx'

describe('Json', () => {
  afterEach(cleanup)

  it('renders non-JSON values: bigint, Date, undefined', () => {
    const { container } = render(() => <Json json={{ size: 12n, when: new Date('2026-04-15T09:20:08Z'), none: undefined, nested: { a: 'x' } }} />)
    const text = container.textContent
    expect(text).toContain('size: 12')
    expect(text).toContain('when: "2026-04-15T09:20:08.000Z"')
    expect(text).toContain('none: undefined')
  })

  it('expands the root and collapses primitive-only children, toggled by buttons with aria-expanded', () => {
    render(() => <Json json={{ stats: { min: 1, max: 2 }, names: ['a'] }} />)
    const [root, stats] = screen.getAllByRole('button')
    expect(root.getAttribute('aria-expanded')).toBe('true')
    expect(stats.getAttribute('aria-expanded')).toBe('false')
    expect(stats.textContent).toContain('stats: {min: 1, max: 2}')

    fireEvent.click(stats)
    expect(stats.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(root)
    expect(root.getAttribute('aria-expanded')).toBe('false')
  })

  it('pages long arrays with a Show more button', () => {
    render(() => <Json json={Array.from({ length: 150 }, (_, i) => i)} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(101)
    fireEvent.click(screen.getByRole('button', { name: 'Show more...' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(150)
  })
})
