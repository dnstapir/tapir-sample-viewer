import type { FileMetaData } from 'hyparquet'
import type { JSX } from 'solid-js'
import Json from '../components/Json.tsx'

export default function ParquetMetadata(props: { metadata: FileMetaData }): JSX.Element {
  return (
    <div class="viewer json-view">
      <Json json={props.metadata} />
    </div>
  )
}
