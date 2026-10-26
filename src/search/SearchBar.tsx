import type { JSX } from 'solid-js'
import { createSignal, createUniqueId, For, Show } from 'solid-js'
import type { SearchMatch, SearchMode, SearchOptions, SubmittedSearch } from '../lib/search.ts'
import { defaultSearchOptions, labelColumns, messages, parseSearch, sameOptions } from '../lib/search.ts'
import SearchHelp from './SearchHelp.tsx'
import './SearchBar.css'

interface SearchBarProps {
  onSubmit: (search: SubmittedSearch | undefined) => void
  onExtendedChange?: (extended: boolean) => void
  status: string
}

export default function SearchBar(props: SearchBarProps): JSX.Element {
  const id = createUniqueId()
  const [query, setQuery] = createSignal('')
  const [mode, setMode] = createSignal<SearchMode>(defaultSearchOptions.mode)
  const [columns, setColumns] = createSignal<readonly string[]>(defaultSearchOptions.columns)
  const [match, setMatch] = createSignal<SearchMatch>(defaultSearchOptions.match)
  const [extended, setExtended] = createSignal(defaultSearchOptions.extended)
  const [submitted, setSubmitted] = createSignal<SearchOptions>(defaultSearchOptions)
  const [queryError, setQueryError] = createSignal<string>()

  const options = (): SearchOptions => ({ mode: mode(), columns: columns(), match: match(), extended: extended() })
  const optionsChanged = () => !sameOptions(options(), submitted())
  const noColumns = () => mode() === 'columns' && columns().length === 0

  function toggleColumn(column: string, checked: boolean) {
    setColumns(current => labelColumns.filter(name => (name === column ? checked : current.includes(name))))
  }

  function submit(event: SubmitEvent) {
    event.preventDefault()
    const current = options()
    const parsed = parseSearch(query(), current)
    if (parsed.kind === 'invalid') {
      setQueryError(parsed.field === 'query' ? parsed.message : undefined)
      return
    }
    setQueryError(undefined)
    setSubmitted(current)
    props.onSubmit(parsed.kind === 'search' ? { predicate: parsed.predicate, extended: current.extended } : undefined)
  }

  return (
    <search aria-label="Search">
      <form class="search-bar" onSubmit={submit} noValidate>
        <div class="search-row">
          <label class="search-query-label" for={`${id}-query`}>
            Search
          </label>
          <input
            id={`${id}-query`}
            type="search"
            placeholder="Enter at least two characters to search"
            spellcheck={false}
            value={query()}
            onInput={event => setQuery(event.currentTarget.value)}
            aria-invalid={queryError() ? 'true' : undefined}
            aria-describedby={queryError() ? `${id}-error` : undefined}
          />
          <button type="submit">Search</button>
          <SearchHelp />
        </div>
        <p id={`${id}-error`} class="search-error" role="alert">
          {queryError()}
        </p>

        <fieldset class="search-group">
          <legend>Search by</legend>
          <label>
            <input
              type="radio"
              name={`${id}-mode`}
              value="domain"
              checked={mode() === 'domain'}
              onChange={() => setMode('domain')}
            />
            Domain
          </label>
          <label>
            <input
              type="radio"
              name={`${id}-mode`}
              value="columns"
              checked={mode() === 'columns'}
              onChange={() => setMode('columns')}
            />
            Columns
          </label>
        </fieldset>

        <fieldset class="search-group">
          <legend>Match</legend>
          <label>
            <input
              type="radio"
              name={`${id}-match`}
              value="subdomains"
              checked={match() === 'subdomains'}
              onChange={() => setMatch('subdomains')}
            />
            Includes string
          </label>
          <label>
            <input
              type="radio"
              name={`${id}-match`}
              value="exact"
              checked={match() === 'exact'}
              onChange={() => setMatch('exact')}
            />
            Exact match
          </label>
        </fieldset>

        <Show when={mode() === 'columns'}>
          <fieldset class="search-group" aria-describedby={`${id}-columns-note`}>
            <legend>Columns</legend>
            <For each={labelColumns}>
              {column => (
                <label>
                  <input
                    type="checkbox"
                    checked={columns().includes(column)}
                    onChange={event => {
                      toggleColumn(column, event.currentTarget.checked)
                    }}
                  />
                  {column}
                </label>
              )}
            </For>
          </fieldset>
        </Show>
        <p id={`${id}-columns-note`} class="search-error" role="status">
          {noColumns() ? messages.noColumns : ''}
        </p>

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

        <Show when={optionsChanged()}>
          <p class="search-note">Options changed – press Search to update.</p>
        </Show>
        <p class="search-status" role="status">
          {props.status}
        </p>
      </form>
    </search>
  )
}
