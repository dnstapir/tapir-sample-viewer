import type { JSX } from 'solid-js'
import { createUniqueId } from 'solid-js'

/**
 * (i) button with the search help in a native popover (light dismiss, Esc).
 * Text: PLAN.md 4.2 draft, to be reviewed with the client.
 */
export default function SearchHelp(): JSX.Element {
  const id = `search-help-${createUniqueId()}`
  return <>
    <button type="button" class="search-help-button" popovertarget={id}>
      <span aria-hidden="true">i</span>
      <span class="visually-hidden">Search help</span>
    </button>
    <div id={id} class="search-help" popover="auto">
      <h2>Search</h2>
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
    </div>
  </>
}
