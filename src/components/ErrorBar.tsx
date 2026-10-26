import type { JSX } from 'solid-js'
import { createEffect, createSignal, Show } from 'solid-js'
import './ErrorBar.css'

interface ErrorBarProps {
  error?: Error
}

export default function ErrorBar(props: ErrorBarProps): JSX.Element {
  const [dismissed, setDismissed] = createSignal<Error>()
  const visible = () => props.error !== undefined && props.error !== dismissed()

  createEffect(() => {
    if (props.error) console.error(props.error)
  })

  return (
    <div role="alert" class="error-bar">
      <Show when={visible()}>
        <div>
          <span>{props.error?.toString()}</span>
          <button type="button" aria-label="Close error message" onClick={() => setDismissed(props.error)}>
            &times;
          </button>
        </div>
      </Show>
    </div>
  )
}
