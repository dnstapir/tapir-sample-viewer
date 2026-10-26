/* Ported from hyperparam's Json component (MIT). */
import type { JSX } from 'solid-js'
import { createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch, untrack } from 'solid-js'
import { formatHexDump, previewCount, shouldObjectCollapse } from '../lib/json.ts'
import './Json.css'

const defaultPageLimit = 100
const defaultWidth = 320

interface ContentProps {
  json: unknown
  label?: string
  expandRoot?: boolean
}

export default function Json(props: { json: unknown }): JSX.Element {
  return (
    <div class="json">
      <JsonContent json={props.json} expandRoot />
    </div>
  )
}

function Key(props: { label?: string }): JSX.Element {
  return (
    <Show when={props.label}>
      <span class="json-key">{props.label}: </span>
    </Show>
  )
}

function Caret(props: { expanded: boolean }): JSX.Element {
  return (
    <span class="json-caret" aria-hidden="true">
      {props.expanded ? '▼' : '▶'}
    </span>
  )
}

function JsonContent(props: ContentProps): JSX.Element {
  return (
    <Switch
      fallback={
        <>
          <Key label={props.label} />
          <span class="json-other">{JSON.stringify(props.json)}</span>
        </>
      }
    >
      <Match when={Array.isArray(props.json)}>
        <JsonCollection json={props.json as unknown[]} label={props.label} expandRoot={props.expandRoot} />
      </Match>
      <Match when={props.json instanceof Date}>
        <Key label={props.label} />
        <span class="json-string">"{(props.json as Date).toISOString()}"</span>
      </Match>
      <Match when={props.json instanceof Uint8Array || props.json instanceof ArrayBuffer}>
        <ByteArray json={props.json as Uint8Array | ArrayBuffer} label={props.label} expandRoot={props.expandRoot} />
      </Match>
      <Match when={typeof props.json === 'object' && props.json !== null}>
        <JsonCollection json={props.json as object} label={props.label} expandRoot={props.expandRoot} />
      </Match>
      <Match when={typeof props.json === 'string'}>
        <Key label={props.label} />
        <span class="json-string">"{props.json as string}"</span>
      </Match>
      <Match when={typeof props.json === 'number' || typeof props.json === 'bigint'}>
        <Key label={props.label} />
        <span class="json-number">{String(props.json)}</span>
      </Match>
      <Match when={typeof props.json === 'boolean'}>
        <Key label={props.label} />
        <span class="json-boolean">{String(props.json)}</span>
      </Match>
      <Match when={props.json === undefined}>
        <Key label={props.label} />
        <span class="json-other">undefined</span>
      </Match>
    </Switch>
  )
}

function JsonCollection(props: { json: object; label?: string; expandRoot?: boolean }): JSX.Element {
  const isArray = () => Array.isArray(props.json)
  const entries = createMemo((): [string, unknown][] => Object.entries(props.json))
  const [collapsed, setCollapsed] = createSignal(untrack(() => !props.expandRoot && shouldObjectCollapse(props.json)))
  const [limit, setLimit] = createSignal(defaultPageLimit)
  const open = () => (isArray() ? '[' : '{')
  const close = () => (isArray() ? ']' : '}')
  const bracketClass = () => (isArray() ? 'json-array' : 'json-object')

  return (
    <>
      <button type="button" class="json-toggle" aria-expanded={!collapsed()} onClick={() => setCollapsed(c => !c)}>
        <Caret expanded={!collapsed()} />
        <Key label={props.label} />
        <Show when={collapsed()} fallback={<span class={bracketClass()}>{open()}</span>}>
          <CollapsedPreview entries={entries()} isArray={isArray()} />
        </Show>
      </button>
      <Show when={!collapsed()}>
        <ul>
          <For each={entries().slice(0, limit())}>
            {([key, value]) => (
              <li>
                <JsonContent json={value} label={isArray() ? undefined : key} />
              </li>
            )}
          </For>
          <Show when={entries().length > limit()}>
            <li>
              <button type="button" class="json-show-more" onClick={() => setLimit(l => l + defaultPageLimit)}>
                Show more...
              </button>
            </li>
          </Show>
        </ul>
        <div class={bracketClass()}>{close()}</div>
      </Show>
    </>
  )
}

function CollapsedPreview(props: { entries: [string, unknown][]; isArray: boolean }): JSX.Element {
  let element: HTMLSpanElement | undefined
  const [width, setWidth] = createSignal(defaultWidth)

  onMount(() => {
    const container = element?.parentElement
    function update() {
      const containerWidth = container?.clientWidth ?? 0
      setWidth(containerWidth > 0 ? containerWidth : defaultWidth)
    }
    update()
    if (container && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update)
      observer.observe(container)
      onCleanup(() => {
        observer.disconnect()
      })
    }
  })

  const preview = createMemo(() => {
    const keyed = props.entries.map(([key, value]): [string | undefined, unknown] => [
      props.isArray ? undefined : key,
      value,
    ])
    return { keyed, ...previewCount(keyed, Math.max(20, Math.floor(width() / 8))) }
  })
  const bracketClass = () => (props.isArray ? 'json-array' : 'json-object')

  return (
    <>
      <span class={bracketClass()}>{props.isArray ? '[' : '{'}</span>
      <span
        ref={el => {
          element = el
        }}
        class={bracketClass()}
      >
        <For each={preview().keyed.slice(0, preview().count)}>
          {([key, value], index) => (
            <>
              <Show when={index() > 0}>, </Show>
              <JsonContent json={value} label={key} />
            </>
          )}
        </For>
        <Show when={preview().truncated}>{preview().count > 0 ? ', ' : ''}...</Show>
      </span>
      <span class={bracketClass()}>{props.isArray ? ']' : '}'}</span>
      <Show when={preview().truncated}>
        <span class="json-comment">
          {' '}
          {props.isArray ? 'length' : 'entries'}: {props.entries.length}
        </span>
      </Show>
    </>
  )
}

function ByteArray(props: { json: Uint8Array | ArrayBuffer; label?: string; expandRoot?: boolean }): JSX.Element {
  const bytes = () => (props.json instanceof ArrayBuffer ? new Uint8Array(props.json) : props.json)
  const [collapsed, setCollapsed] = createSignal(untrack(() => !props.expandRoot))

  return (
    <>
      <button type="button" class="json-toggle" aria-expanded={!collapsed()} onClick={() => setCollapsed(c => !c)}>
        <Caret expanded={!collapsed()} />
        <Key label={props.label} />
        <span class="json-comment">
          {bytes().constructor.name}({bytes().length})
        </span>
      </button>
      <Show when={!collapsed()}>
        <pre class="json-hex-dump">
          <For each={formatHexDump(bytes())}>
            {line => (
              <div>
                <span class="json-comment">{line.offset}</span>
                {'  '}
                <span class="json-number">{line.hex}</span>
                {'  '}
                <span class="json-string">{line.ascii}</span>
              </div>
            )}
          </For>
        </pre>
      </Show>
    </>
  )
}
