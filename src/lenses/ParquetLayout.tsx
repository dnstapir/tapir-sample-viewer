import type { ColumnChunk, FileMetaData } from 'hyparquet'
import type { JSX } from 'solid-js'
import { createMemo, createUniqueId, For, Match, Show, Switch } from 'solid-js'
import type { LayoutItem } from '../lib/layout.ts'
import { collectLayoutItems, columnPages, metadataRange } from '../lib/layout.ts'

interface LayoutProps {
  byteLength: number
  metadata: FileMetaData
}

export default function ParquetLayout(props: LayoutProps): JSX.Element {
  const items = createMemo(() => collectLayoutItems(props.metadata))
  const footer = createMemo(() => metadataRange(props.byteLength, props.metadata))

  // focusable so keyboard users can scroll it
  return (
    <section class="viewer" tabIndex={0} aria-label="File layout">
      <div class="layout">
        <Cell name="PAR1" start={0} end={4} class="magic" />
        <For each={items()}>{item => <Item item={item} />}</For>
        <Cell name="Metadata" start={footer().start} end={footer().end} class="metadata" />
        <Cell name="PAR1" start={footer().end} end={props.byteLength} class="magic" />
      </div>
    </section>
  )
}

function Cell(props: { name: string; start: bigint | number; end: bigint | number; class?: string }): JSX.Element {
  const bytes = () => BigInt(props.end) - BigInt(props.start)
  return (
    <div class={props.class ? `cell ${props.class}` : 'cell'}>
      <span class="cell-name">{props.name}</span>
      <ul>
        <li>start {props.start.toLocaleString()}</li>
        <li>bytes {bytes().toLocaleString()}</li>
        <li>end {props.end.toLocaleString()}</li>
      </ul>
    </div>
  )
}

function Group(props: { name: string; bytes?: bigint; children: JSX.Element }): JSX.Element {
  const nameId = createUniqueId()
  return (
    <div class="group" role="group" aria-labelledby={nameId}>
      <div class="group-header">
        <span class="cell-name" id={nameId}>
          {props.name}
        </span>
        <span>{props.bytes === undefined ? '' : `bytes ${props.bytes.toLocaleString()}`}</span>
      </div>
      {props.children}
    </div>
  )
}

function Item(props: { item: LayoutItem }): JSX.Element {
  return (
    <Switch>
      <Match when={props.item.type === 'rowgroup' && props.item}>
        {item => (
          <Group name={`RowGroup ${item().groupIndex}`} bytes={item().totalByteSize}>
            <For each={item().columns}>{column => <Column column={column} />}</For>
          </Group>
        )}
      </Match>
      <Match when={props.item.type === 'index' && props.item}>
        {item => <Cell name={item().name} start={item().start} end={item().end} class="index" />}
      </Match>
    </Switch>
  )
}

function Column(props: { column: ColumnChunk }): JSX.Element {
  return (
    <Show when={props.column.meta_data}>
      {meta => (
        <Group name={`Column '${meta().path_in_schema.join('.')}'`} bytes={meta().total_compressed_size}>
          <For each={columnPages(meta())}>{page => <Cell name={page.name} start={page.start} end={page.end} />}</For>
        </Group>
      )}
    </Show>
  )
}
