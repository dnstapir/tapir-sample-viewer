import type { JSX } from 'solid-js'
import { onMount } from 'solid-js'
import ErrorBar from './components/ErrorBar.tsx'

interface LayoutProps {
  children: JSX.Element
  error?: Error
}

/**
 * Page frame: content area plus the error bar below it.
 */
export default function Layout(props: LayoutProps): JSX.Element {
  onMount(() => {
    document.title = 'DNS Tapir hyparquet'
  })

  return <div class="content-container">
    <div class="content">
      {props.children}
    </div>
    <ErrorBar error={props.error} />
  </div>
}
