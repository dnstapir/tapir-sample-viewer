import type { JSX } from 'solid-js'
import { Show, createEffect, createSignal } from 'solid-js'
import './ErrorBar.css'

interface ErrorBarProps {
  error?: Error
}

/**
 * Dismissable error message. A new error object shows the bar again.
 */
export default function ErrorBar(props: ErrorBarProps): JSX.Element {
  const [dismissed, setDismissed] = createSignal<Error>()
  const visible = () => props.error !== undefined && props.error !== dismissed()

  createEffect(() => {
    if (props.error) console.error(props.error)
  })

  // the alert region stays in the DOM so screen readers announce content added to it
  return <div role="alert" class="error-bar">
    <Show when={visible()}>
      <div>
        <span>{props.error?.toString()}</span>
        <button type="button" aria-label="Close error message" onClick={() => setDismissed(props.error)}>
          &times;
        </button>
      </div>
    </Show>
  </div>
}
