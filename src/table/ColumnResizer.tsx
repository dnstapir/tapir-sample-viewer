import type { JSX } from 'solid-js'
import { createSignal } from 'solid-js'
import { minColumnWidth } from '../lib/columnWidths.ts'

const smallStep = 10
const bigStep = 100

interface ResizerProps {
  column: string
  width?: number
  tabIndex: number
  resizeTo: (width: number) => void
  autoResize: () => void
  /** move focus back to the header cell */
  exit: () => void
}

/**
 * Column resize handle: a focusable vertical separator (APG window splitter pattern).
 * Drag with the pointer, or use arrows (10px), PageUp/PageDown (100px), Home (minimum),
 * Enter/Space or double-click (fit to content), Escape (back to the header).
 */
export default function ColumnResizer(props: ResizerProps): JSX.Element {
  const [drag, setDrag] = createSignal<{ pointerId: number, startX: number, startWidth: number }>()

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey) return
    event.stopPropagation()
    const startWidth = props.width
    if (startWidth === undefined) return
    setDrag({ pointerId: event.pointerId, startX: event.clientX, startWidth })
    const target = event.currentTarget as HTMLElement
    if ('setPointerCapture' in target) target.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent) {
    const state = drag()
    if (state?.pointerId === event.pointerId) {
      props.resizeTo(state.startWidth + event.clientX - state.startX)
    }
  }

  function onPointerUp(event: PointerEvent) {
    event.stopPropagation()
    if (drag()?.pointerId === event.pointerId) setDrag(undefined)
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Tab') return
    event.stopPropagation()
    if (drag()) return
    const current = props.width
    const handled = (() => {
      switch (event.key) {
      case 'Escape': props.exit(); return true
      case 'Enter':
      case ' ': props.autoResize(); props.exit(); return true
      case 'Home': props.resizeTo(minColumnWidth); return true
      }
      if (current === undefined) return false
      switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp': props.resizeTo(current + smallStep); return true
      case 'ArrowLeft':
      case 'ArrowDown': props.resizeTo(current - smallStep); return true
      case 'PageUp': props.resizeTo(current + bigStep); return true
      case 'PageDown': props.resizeTo(current - bigStep); return true
      }
      return false
    })()
    if (handled) event.preventDefault()
  }

  return <span
    class="column-resizer"
    role="separator"
    aria-orientation="vertical"
    aria-label={`Resize column ${props.column}`}
    aria-valuemin={minColumnWidth}
    aria-valuenow={props.width}
    aria-valuetext={props.width === undefined ? 'automatic width' : `${props.width} pixels`}
    tabIndex={props.tabIndex}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onDblClick={event => {
      event.stopPropagation()
      if (!drag()) props.autoResize()
    }}
    onClick={event => { event.stopPropagation() }}
    onKeyDown={onKeyDown}
  />
}
