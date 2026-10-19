import type { JSX } from 'solid-js'
import { For, Show, createEffect, createSignal, createUniqueId, onCleanup } from 'solid-js'
import { Portal } from 'solid-js/web'
import './Dropdown.css'

interface DropdownItem {
  label: string
  onSelect: () => void
  // set for a radio item
  checked?: boolean
}

interface DropdownProps {
  label: JSX.Element
  items: DropdownItem[]
  ariaLabel?: string
  noCaret?: boolean
  buttonClass?: string
  tabIndex?: number
  // fixed position in a portal, for containers that clip overflow
  portal?: boolean
}

// WAI-ARIA APG menu button pattern
export default function Dropdown(props: DropdownProps): JSX.Element {
  const buttonId = createUniqueId()
  const menuId = createUniqueId()
  const [open, setOpen] = createSignal(false)
  const [active, setActive] = createSignal(0)
  const [position, setPosition] = createSignal({ top: 0, left: 0 })
  let root: HTMLDivElement | undefined
  let button: HTMLButtonElement | undefined
  let menu: HTMLDivElement | undefined
  const itemRefs: HTMLButtonElement[] = []

  function openAt(index: number) {
    if (props.portal && button) {
      const rect = button.getBoundingClientRect()
      setPosition({ top: rect.bottom, left: rect.left })
    }
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
      const target = event.target as Node
      if (!root?.contains(target) && !menu?.contains(target)) close(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    onCleanup(() => { document.removeEventListener('pointerdown', onPointerDown) })
  })

  function onButtonKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      openAt(0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      openAt(props.items.length - 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      // keep the key from the sortable table header around the button
      event.stopPropagation()
    }
  }

  function onMenuKeyDown(event: KeyboardEvent) {
    const last = props.items.length - 1
    event.stopPropagation()
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

  const menuContent = () => <div
    ref={el => { menu = el }}
    id={menuId}
    role="menu"
    aria-labelledby={buttonId}
    class="dropdown-menu"
    style={props.portal ? { position: 'fixed', top: `${position().top}px`, left: `${position().left}px` } : undefined}
    onKeyDown={onMenuKeyDown}
  >
    <For each={props.items}>
      {(item, index) =>
        <button
          ref={el => { itemRefs[index()] = el }}
          type="button"
          role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
          aria-checked={item.checked}
          tabIndex={-1}
          onClick={event => {
            event.stopPropagation()
            item.onSelect()
            close(true)
          }}
        >
          {item.label}
        </button>
      }
    </For>
  </div>

  return <div ref={el => { root = el }} class="dropdown">
    <button
      ref={el => { button = el }}
      id={buttonId}
      type="button"
      class={props.buttonClass ?? 'dropdown-button'}
      aria-label={props.ariaLabel}
      aria-haspopup="menu"
      aria-expanded={open()}
      aria-controls={open() ? menuId : undefined}
      tabIndex={props.tabIndex}
      onClick={event => {
        event.stopPropagation()
        if (open()) close(false)
        else openAt(0)
      }}
      onKeyDown={onButtonKeyDown}
    >
      <Show when={!props.noCaret}>
        <span class="dropdown-caret" aria-hidden="true">{'\u25bc'}</span>
      </Show>
      {props.label}
    </button>
    <Show when={open()}>
      <Show when={props.portal} fallback={menuContent()}>
        <Portal mount={root?.closest('main') ?? document.body}>{menuContent()}</Portal>
      </Show>
    </Show>
  </div>
}
