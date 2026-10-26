import type { JSX } from 'solid-js'
import ErrorBar from './components/ErrorBar.tsx'

interface LayoutProps {
  children: JSX.Element
  error?: Error
}

export default function Layout(props: LayoutProps): JSX.Element {
  return (
    <div class="content-container">
      <div class="content">{props.children}</div>
      <ErrorBar error={props.error} />
    </div>
  )
}
