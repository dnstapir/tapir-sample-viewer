import type { JSX } from 'solid-js'
import { createUniqueId } from 'solid-js'

export default function SearchHelp(): JSX.Element {
  const titleId = createUniqueId()
  let dialog: HTMLDialogElement | undefined
  let button: HTMLButtonElement | undefined
  let title: HTMLHeadingElement | undefined

  return (
    <>
      <button
        ref={el => {
          button = el
        }}
        type="button"
        class="search-help-button"
        aria-haspopup="dialog"
        onClick={() => {
          dialog?.showModal()
          title?.focus()
        }}
      >
        <span aria-hidden="true">i</span>
        <span class="visually-hidden">Help</span>
      </button>
      <dialog
        ref={el => {
          dialog = el
        }}
        class="search-help"
        aria-labelledby={titleId}
        onClose={() => button?.focus()}
        onClick={event => {
          if (event.target === event.currentTarget) event.currentTarget.close()
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.currentTarget.close()
          }
        }}
      >
        <div class="search-help-content">
          <h2
            ref={el => {
              title = el
            }}
            id={titleId}
            tabIndex={-1}
          >
            Help
          </h2>
          <h3>Search</h3>
          <p>
            Type at least 2 characters and press Enter or click Search. Changed options take effect when you search
            again.
          </p>
          <h3>Domain</h3>
          <p>Type a domain name or part of one:</p>
          <ul>
            <li>
              <code>www.google.com</code>
            </li>
            <li>
              <code>google.com</code>
            </li>
            <li>
              <code>www.docs.google.com</code>
            </li>
          </ul>
          <h3>Columns</h3>
          <p>
            Finds rows where any of the selected columns contains the text. <code>label0</code> is the top-level domain
            (e.g. se), <code>label1</code> the name below it (e.g. svt), and so on.
          </p>
          <h3>Exact match or includes string</h3>
          <p>Choose whether the search should be an exact match or domain/column includes the string.</p>

          <h3>Extended search</h3>
          <p>Searches all files and adds a File column.</p>
          <h3>Table</h3>
          <p>Click or select a column header to sort. Click/select Row number header to restore file order.</p>
          <button type="button" class="search-help-close" onClick={() => dialog?.close()}>
            Close
          </button>
        </div>
      </dialog>
    </>
  )
}
