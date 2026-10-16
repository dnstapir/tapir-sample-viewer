import type { JSX } from 'solid-js'
import { For, Show, createEffect, createSignal, createUniqueId, onCleanup } from 'solid-js'
import './Dropdown.css'

export interface DropdownItem {
  label: string
  onSelect: () => void
  /** set to render a radio item (`menuitemradio` with `aria-checked`) */
  checked?: boolean
}

interface DropdownProps {
  label: JSX.Element
  items: DropdownItem[]
  align?: 'left' | 'right'
}

/**
 * Menu button following the WAI-ARIA APG menu button pattern:
 * https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/
 */
export default function Dropdown(props: DropdownProps): JSX.Element {
  const buttonId = createUniqueId()
  const menuId = createUniqueId()
  const [open, setOpen] = createSignal(false)
  const [active, setActive] = createSignal(0)
  let root: HTMLDivElement | undefined
  let button: HTMLButtonElement | undefined
  const itemRefs: HTMLButtonElement[] = []

  function openAt(index: number) {
    setActive((index + props.items.length) % props.items.length)
    setOpen(true)
  }

  function close(focusButton: boolean) {
    setOpen(false)
    if (focusButton) button?.focus()
  }

  createEffect(() => {
    if (open()) itemRefs[active()]?.focus()
  })

  createEffect(() => {
    if (!open()) return
    function onPointerDown(event: PointerEvent) {
      if (!root?.contains(event.target as Node)) close(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    onCleanup(() => { document.removeEventListener('pointerdown', onPointerDown) })
  })

  function onButtonKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      openAt(0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openAt(props.items.length - 1)
    }
  }

  function onMenuKeyDown(event: KeyboardEvent) {
    const last = props.items.length - 1
    switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      setActive(i => i === last ? 0 : i + 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      setActive(i => i === 0 ? last : i - 1)
      break
    case 'Home':
      event.preventDefault()
      setActive(0)
      break
    case 'End':
      event.preventDefault()
      setActive(last)
      break
    case 'Escape':
      event.preventDefault()
      close(true)
      break
    case 'Tab':
      close(false)
      break
    }
  }

  return <div ref={el => { root = el }} class={`dropdown dropdown-${props.align ?? 'left'}`}>
    <button
      ref={el => { button = el }}
      id={buttonId}
      type="button"
      class="dropdown-button"
      aria-haspopup="menu"
      aria-expanded={open()}
      aria-controls={menuId}
      onClick={() => { if (open()) close(false); else openAt(0) }}
      onKeyDown={onButtonKeyDown}
    >
      <span class="dropdown-caret" aria-hidden="true">{'\u25bc'}</span>
      {props.label}
    </button>
    <Show when={open()}>
      <div id={menuId} role="menu" aria-labelledby={buttonId} class="dropdown-menu" onKeyDown={onMenuKeyDown}>
        <For each={props.items}>
          {(item, index) =>
            <button
              ref={el => { itemRefs[index()] = el }}
              type="button"
              role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={item.checked}
              tabIndex={-1}
              onClick={() => {
                item.onSelect()
                close(true)
              }}
            >
              {item.label}
            </button>
          }
        </For>
      </div>
    </Show>
  </div>
}
