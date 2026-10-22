// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it } from 'vitest'
import Dropdown from '../src/components/Dropdown.tsx'

function renderLensMenu() {
  const [lens, setLens] = createSignal('table')
  const items = () => ['table', 'metadata', 'grid'].map(name => ({
    label: name,
    checked: lens() === name,
    onSelect: () => setLens(name),
  }))
  render(() => <Dropdown label={lens()} items={items()} />)
  return { lens, button: screen.getByRole('button', { name: 'table' }) }
}

describe('Dropdown', () => {
  afterEach(cleanup)

  it('is a closed menu button initially', () => {
    const { button } = renderLensMenu()
    expect(button.getAttribute('aria-haspopup')).toBe('menu')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens on click, focuses the first item, and marks the checked item', () => {
    const { button } = renderLensMenu()
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    const items = screen.getAllByRole('menuitemradio')
    expect(items.map(item => item.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
    expect(document.activeElement).toBe(items[0])
  })

  it('moves focus with arrow keys, Home and End, wrapping around', () => {
    const { button } = renderLensMenu()
    fireEvent.keyDown(button, { key: 'ArrowUp' })
    const items = screen.getAllByRole('menuitemradio')
    expect(document.activeElement).toBe(items[2])
    fireEvent.keyDown(items[2], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(items[0], { key: 'End' })
    expect(document.activeElement).toBe(items[2])
    fireEvent.keyDown(items[2], { key: 'Home' })
    expect(document.activeElement).toBe(items[0])
  })

  it('selects an item, closes, and returns focus to the button', () => {
    const { button, lens } = renderLensMenu()
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'grid' }))
    expect(lens()).toBe('grid')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('closes on Escape and returns focus to the button', () => {
    const { button } = renderLensMenu()
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getAllByRole('menuitemradio')[0], { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('closes when clicking outside', () => {
    const { button } = renderLensMenu()
    fireEvent.click(button)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
