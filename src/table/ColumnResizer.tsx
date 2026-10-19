import type { JSX } from 'solid-js'
import { createSignal } from 'solid-js'

interface ResizerProps {
  width?: number
  resizeTo: (width: number) => void
  autoResize: () => void
}

// pointer only; keyboard and screen-reader users resize from the column menu
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

  return <span
    class="column-resizer"
    aria-hidden="true"
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onDblClick={event => {
      event.stopPropagation()
      if (!drag()) props.autoResize()
    }}
    onClick={event => { event.stopPropagation() }}
  />
}
