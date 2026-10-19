import type { JSX } from 'solid-js'
import { For, Show, createSignal, createUniqueId } from 'solid-js'
import type { SearchMode, SearchOptions, SearchPredicate } from '../lib/search.ts'
import { defaultSearchOptions, labelColumns, messages, parseSearch, sameOptions } from '../lib/search.ts'
import SearchHelp from './SearchHelp.tsx'
import './SearchBar.css'

export interface SubmittedSearch {
  /** undefined: show the selected file unfiltered */
  predicate?: SearchPredicate
  extended: boolean
}

interface SearchBarProps {
  onSubmit: (search: SubmittedSearch) => void
  /** the Extended search checkbox changed (applies to the file selector at once) */
  onExtendedChange?: (extended: boolean) => void
  /** result or progress, announced politely */
  status: string
}

/**
 * Search form (PLAN.md 4.2): runs on Enter or the Search button only;
 * changed options take effect on the next submit.
 */
export default function SearchBar(props: SearchBarProps): JSX.Element {
  const id = createUniqueId()
  const [query, setQuery] = createSignal('')
  const [mode, setMode] = createSignal<SearchMode>(defaultSearchOptions.mode)
  const [columns, setColumns] = createSignal<readonly string[]>(defaultSearchOptions.columns)
  const [extended, setExtended] = createSignal(defaultSearchOptions.extended)
  const [submitted, setSubmitted] = createSignal<SearchOptions>(defaultSearchOptions)
  const [queryError, setQueryError] = createSignal<string>()

  const options = (): SearchOptions => ({ mode: mode(), columns: columns(), extended: extended() })
  const optionsChanged = () => !sameOptions(options(), submitted())
  const noColumns = () => mode() === 'columns' && columns().length === 0

  function toggleColumn(column: string, checked: boolean) {
    // keep label order, whatever the click order
    setColumns(current => labelColumns.filter(name => name === column ? checked : current.includes(name)))
  }

  function submit(event: SubmitEvent) {
    event.preventDefault()
    const current = options()
    const parsed = parseSearch(query(), current)
    if (parsed.kind === 'invalid') {
      // the column message is already shown while no column is checked
      setQueryError(parsed.field === 'query' ? parsed.message : undefined)
      return
    }
    setQueryError(undefined)
    setSubmitted(current)
    props.onSubmit({ predicate: parsed.kind === 'search' ? parsed.predicate : undefined, extended: current.extended })
  }

  return <form class="search-bar" role="search" aria-label="Search" onSubmit={submit} noValidate>
    <div class="search-row">
      <label class="search-query-label" for={`${id}-query`}>Search</label>
      <input
        id={`${id}-query`}
        type="search"
        autocomplete="off"
        spellcheck={false}
        value={query()}
        onInput={event => setQuery(event.currentTarget.value)}
        aria-invalid={queryError() ? 'true' : undefined}
        aria-describedby={queryError() ? `${id}-error` : undefined}
      />
      <button type="submit">Search</button>
      <SearchHelp />
    </div>
    <p id={`${id}-error`} class="search-error" role="alert">{queryError()}</p>

    <fieldset class="search-group">
      <legend>Search by</legend>
      <label>
        <input type="radio" name={`${id}-mode`} value="domain" checked={mode() === 'domain'} onChange={() => setMode('domain')} />
        Domain
      </label>
      <label>
        <input type="radio" name={`${id}-mode`} value="columns" checked={mode() === 'columns'} onChange={() => setMode('columns')} />
        Columns
      </label>
    </fieldset>

    {/* directly after the Columns radio, so the next Tab reaches the checkboxes */}
    <Show when={mode() === 'columns'}>
      <fieldset class="search-group" aria-describedby={`${id}-columns-note`}>
        <legend>Columns</legend>
        <For each={labelColumns}>
          {column => <label>
            <input
              type="checkbox"
              checked={columns().includes(column)}
              onChange={event => { toggleColumn(column, event.currentTarget.checked) }}
            />
            {column}
          </label>}
        </For>
      </fieldset>
    </Show>
    {/* rendered while hidden too, so the message is announced when it appears */}
    <p id={`${id}-columns-note`} class="search-error" role="status">{noColumns() ? messages.noColumns : ''}</p>

    <label class="search-extended">
      <input
        type="checkbox"
        checked={extended()}
        onChange={event => {
          setExtended(event.currentTarget.checked)
          props.onExtendedChange?.(event.currentTarget.checked)
        }}
      />
      Extended search (all files)
    </label>

    {/* read where it stands, before the table; not tied to the Search button (client decision 2026-10-19) */}
    <Show when={optionsChanged()}>
      <p class="search-note">Options changed – press Search to update.</p>
    </Show>
    <p class="search-status" role="status">{props.status}</p>
  </form>
}
