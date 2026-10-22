import type { JSX } from 'solid-js'
import { createUniqueId } from 'solid-js'

export default function SearchHelp(): JSX.Element {
  const titleId = createUniqueId()
  let dialog: HTMLDialogElement | undefined
  let button: HTMLButtonElement | undefined
  let title: HTMLHeadingElement | undefined

  return <>
    <button
      ref={el => { button = el }}
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
      ref={el => { dialog = el }}
      class="search-help"
      aria-labelledby={titleId}
      onClose={() => button?.focus()}
      onClick={event => {
        // only the backdrop hits the dialog element itself
        if (event.target === event.currentTarget) event.currentTarget.close()
      }}
    >
      <div class="search-help-content">
        <h2 ref={el => { title = el }} id={titleId} tabIndex={-1}>Help</h2>
        <h3>Search</h3>
        <p>Type at least 2 characters and press Enter or click Search. Changed options take effect when you search again.</p>
        <h3>Domain</h3>
        <p>Type a domain name or part of one:</p>
        <ul>
          <li><code>svt</code> – domains whose name contains “svt” (e.g. svt.se, svtplay.se)</li>
          <li><code>svt.se</code> – as above, but only under .se, including subdomains</li>
          <li><code>www.svt.se</code> – subdomains of svt.se containing “www”</li>
        </ul>
        <p>The first part you type may be partial; the remaining parts must match exactly.</p>
        <h3>Columns</h3>
        <p>Finds rows where any of the selected columns contains the text. <code>label0</code> is the top-level domain (e.g. se), <code>label1</code> the name below it (e.g. svt), and so on.</p>
        <h3>Extended search</h3>
        <p>Searches all files and adds a File column.</p>
        <h3>Table</h3>
        <p>Click or select a column header to sort. Click/select Row number header to restore file order.</p>
        <button type="button" class="search-help-close" onClick={() => dialog?.close()}>Close</button>
      </div>
    </dialog>
  </>
}
