# Migration plan: tapir-hyparquet (React) → tapir-hyparquet-solid (Solid)

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

## 1. Goal

Port the DNS Tapir parquet viewer from React to SolidJS with **feature parity** and **no React dependency** (direct or transitive in the bundle). The app must handle large parquet files (100k+ rows, multiple row groups).

Reference project (read-only): `../tapir-hyparquet/`

## 2. Inventory

### 2.1 Source: `tapir-hyparquet/` (React 19, npm)

| File | Role | React/hyperparam coupling |
| --- | --- | --- |
| `src/main.tsx` | Entry; imports `hightable/src/HighTable.css`, `hyperparam/global.css`, `hyperparam/hyperparam.css`, `index.css`; mounts `<App/>` in `#app` | `react-dom/client`, `StrictMode` |
| `src/App.tsx` | Globs `src/parquets/*.parquet` (`?url`), fetches **all** files fully, builds `DataSet[]` (metadata + `sortableDataFrame(parquetDataFrame(...))`) | `useState/useEffect/useCallback`; `hyperparam.asyncBufferFrom`, `hyperparam.parquetDataFrame` |
| `src/Layout.tsx` | Sets `document.title`, content wrapper, `ErrorBar`, optional progress bar | `hyperparam.ErrorBar`, `hyperparam.cn` |
| `src/Page.tsx` | Header (logo, file `<select>`), view header (size, row count, lens `Dropdown`), lens switch; `formatFileSize()` | `hightable.HighTable`, `hyperparam.Dropdown` |
| `src/ParquetMetadata.tsx` | JSON view of `FileMetaData` | `hyperparam.Json` |
| `src/ParquetLayout.tsx` | Byte layout: magic, row groups → columns → pages, column/offset indexes, footer; `collectLayoutItems()`, `getColumnRange()` | Plain JSX only |
| `src/ParquetGrid.tsx` | CSS-grid visualisation of row groups × column chunks with tooltips | Plain JSX only |
| `src/index.css` | App styles (includes unused rules: dropzone, sidebar, welcome, quick-links, `.brand`) | — |
| `src/assets/*` | `demo.png`, provider SVGs — referenced only by unused CSS | — |
| `src/parquets/*.parquet` | 5 sample files: 46–71 rows, 1 row group, 27 columns, SNAPPY, written by `parquet-cpp-arrow 21.0.0` | — |
| `public/TAPIR-*.svg` | Logo + favicon | — |
| `index.html` | `main#content > div#app`, Mulish font, meta tags, unused `#file-input` | — |
| `vite.config.ts` | `@vitejs/plugin-react`, `optimizeDeps.exclude: ['hyperparam']`, `lightningcss.errorRecovery`, `base: './'` | React plugin |
| `eslint.config.js` | typescript-eslint strictTypeChecked + style rules + React plugins | React plugins |
| `test/package.test.js` | Asserts name `hyparquet-demo`, semver version, MIT, **exact** dependency versions | — |
| `.github/workflows/deploy.yaml` | GitHub Pages deploy, Node 24, `npm ci && npm run build` | — |

### 2.2 Target: `tapir-hyparquet-solid/tapir-hyparquet-solid/` (Solid template, pnpm)

Unmodified `vite-template-solid`: `App.tsx`/`Comp.tsx` hello world, `index.tsx` with `solid-devtools`, `#root` mount, `vite ^7.1.4`, `typescript ^5.7.2`, caret ranges, no lint, no tests, no git repo.

## 3. Key findings

1. **`hightable` (0.26.4) is React-only** for its UI (peer deps `react`, `react-dom`), and no Solid port exists on npm (registry search "hightable" returns 1 package). Its subpath **`hightable/dataframe` is framework-agnostic** ("without React dependencies", per `node_modules/hightable/dist/types/dataframe.d.ts`) and exports `DataFrame`, `sortableDataFrame`, `arrayDataFrame`, `stringify`, `OrderBy` helpers.
2. **`hyperparam` (0.4.14) cannot be used for JS**: its single bundle `lib/index.es.min.js` imports `react`, `react-dom`, `react/jsx-runtime`, and the package depends on `@aws-sdk/*`, `icebird`, `squirreling`, `ws`. Even non-UI helpers (`asyncBufferFrom`, `parquetDataFrame`) would pull React into the bundle.
3. **`hyparquet` (1.27.1)** already provides what is needed: `parquetMetadataAsync`, `parquetReadObjects`, `asyncBufferFromUrl`, `cachedAsyncBuffer`, `toJson` (BigInt-safe JSON).
4. Sample data uses `INT64` (→ `bigint`) and `TIMESTAMP` (→ `Date`) columns; display must stringify BigInt/Date safely.
5. Current `App` downloads **every** parquet file completely before rendering. This does not scale to large files.
6. Minor bugs in the original (do not port): CSS selector `logo-header` lacks a `.`; `.brand::before` references a non-existent `logo.svg`; ESLint `settings.react.version` is `18.3` while React is 19.
7. Domain names are stored **reversed, one label per column**: `label0` = TLD (`se`, `com`, …), `label1` = name under the TLD (`svt`), `label2`+ = subdomains. Sample data: all lowercase, depth 2–5, only `label0`–`label4` are strings (`label5`–`label9` are `INT32/NULL`, always null). Label columns are dictionary-encoded with row-group min/max statistics, but **no bloom filters and no column index**.
8. hyparquet's `filter` option (`$eq`, `$in`, `$gt`, … – no substring/regex operator) decodes all requested columns of a row group before filtering and does not return original row numbers (`hyparquet/src/read.js`, `src/types.d.ts`). Row-group skipping via min/max is ineffective on unsorted label data.

## 4. Decisions

| ID | Topic | Decision | Status |
| --- | --- | --- | --- |
| D1 | Package manager | pnpm | Decided |
| D2 | Folder layout | Flatten to `tapir-hyparquet-solid/` | Decided |
| D3 | `hyperparam` | Remove entirely; reimplement used parts in Solid / on top of `hyparquet` | Decided |
| D4 | Table implementation | **Option A** (see 4.1); full HighTable feature parity (see Phase 5) | Decided |
| D5 | Data loading | Load metadata lazily for the selected file only; read row data on demand via range requests | Decided |
| D6 | Dependency versions | Caret ranges (`^x.y.z`) in `package.json`; reproducibility via committed `pnpm-lock.yaml` + `--frozen-lockfile` in CI. Drop the exact-version assertion from `package.test.js` | Decided |
| D7 | Docs language | English | Decided |
| D8 | Search | DNS-structured domain search, see 4.2 | Decided |
| D9 | UI language | English for all UI text (column names from parquet are English) | Decided |
| D10 | Accessibility | Comply with EU accessibility law: EN 301 549 (WCAG 2.1 AA for web); build to WCAG 2.2 AA, see 4.3 | Decided |
| D11 | Data source | Parquet files bundled in `src/parquets/` for now; all file access goes through `src/lib/dataset.ts` / `source.ts` so the source can change later | Interim – final source deferred |

### 4.1 D4 – table options (no React)

Requirement driver: files may reach 100k+ rows and several row groups.

| | A. `hightable/dataframe` + `@tanstack/solid-virtual` + own Solid rendering | B. `@tanstack/solid-table` (+ `@tanstack/solid-virtual`) | C. Plain `<table>` + `<For>` |
| --- | --- | --- | --- |
| Data in memory | Only fetched row chunks | Entire file as JS objects | Entire file as JS objects |
| Initial load, 100k+ rows | Metadata + first visible chunk | Full decode of all rows before first paint | Full decode + full DOM |
| DOM size | Visible rows only | Visible rows only (with virtual) | All rows |
| Sorting | `sortableDataFrame` (same semantics as today) | Built-in, in-memory | Hand-written |
| Extra features | Hand-written (column resize etc.) | Filtering, resizing, grouping built in | None |
| Reuse of current data model | Full (`DataFrame` contract unchanged) | None – new row model | None |
| Own code | Most (cell loading states, header, scroll sync) | Medium | Least |

**Decision: A** (rationale):
- Only A keeps lazy, row-group-chunked reads, which is the property that makes large files workable; B and C must decode the whole file up front (27 columns × 100k+ rows of objects, BigInt included) before showing anything.
- A keeps the exact `DataFrame` / `sortableDataFrame` contract the React app already relies on, so sorting behaviour stays identical and the data layer is testable without UI.
- `@tanstack/solid-virtual` is headless and Solid-native (peer `solid-js ^1.3.0`, v3.13.47 on npm), so rendering stays fully under our control and styling can reuse HighTable-like CSS.
- B becomes preferable only if built-in filtering/grouping matters more than large-file performance.

**Amendment (phase 5):** rows have a fixed height (33px, as in HighTable), so windowing is plain arithmetic in `src/lib/viewport.ts` instead of `@tanstack/solid-virtual` (dependency removed). This also allows capping the canvas at 8M px with proportional scroll mapping, like HighTable; a fixed-height list library would exceed browser element-height limits above ~240k rows.

Sources: npm registry (`@tanstack/solid-virtual/latest` 3.13.47, `@tanstack/solid-table/latest` 9.3.1, `solid-js/latest` 1.9.17, `vite-plugin-solid/latest` 2.11.14 with peer `vite ^…^8 || ^9`), checked 2026-10-16; local `node_modules` of `tapir-hyparquet`.

### 4.2 D8 – search specification

Requirement (client): `label1` is the primary search target; searching on a full domain name (`www.svt.se`) is desired.

**Trigger**
- `<input type="search">` + **Search** button. A search runs only on **Enter** or button click; no search-as-you-type.
- Minimum query length: **2 characters** (normalised query) in both modes; shorter input shows a validation message.
- Submitting an empty query in normal mode shows the unfiltered selected file.
- A new submit aborts a running search (`AbortController`).
- Changing the selected file or toggling Extended search **clears the result**; the user must submit again.

**Normalisation**: trim, lowercase, strip one trailing `.`.

**Matching (follows DNS structure)**
1. Split the query on `.` and reverse: last part → `label0`, next → `label1`, …
2. The **leftmost typed label** is a **substring** match; **all other** labels must match **exactly**.
3. Labels deeper than the query are unconstrained → **subdomains are included**.
4. Query without a dot → substring match on `label1`.

| Query | Predicate | Matches e.g. | Does not match |
| --- | --- | --- | --- |
| `svt` | `label1` ⊇ `svt` | `svt.se`, `svtplay.se`, `www.svt.se` | `svt.example.com` |
| `svt.se` | `label0 = se` ∧ `label1` ⊇ `svt` | `svt.se`, `www.svt.se`, `svtplay.se` | `svt.com` |
| `www.svt.se` | `label0 = se` ∧ `label1 = svt` ∧ `label2` ⊇ `www` | `www.svt.se`, `a.www.svt.se` | `api.svt.se` |

**Results**: the table is **filtered to matching rows only**; sorting works on the filtered view.

**Scope – "Extended search" toggle**

| Toggle | Query | Shown |
| --- | --- | --- |
| Off | empty | Selected file, unfiltered |
| Off | ≥ 2 chars | Matches in the selected file |
| On | empty / < 2 chars | No table, no file loaded; hint "Enter at least 2 characters to search all files." |
| On | ≥ 2 chars | Matches from **all files** in one table with an extra **File** column |

- While Extended search is on, the file selector is disabled.
- Progress indicator "Searching file N of M…" during multi-file scans.
- Metadata per file is loaded on first search and cached.
- All files share the same schema (confirmed by client), so results are simply stacked.

**Help**: an **(i)** button next to the search field opens a native `popover="auto"` (light dismiss, Esc; Baseline 2024: Chrome/Edge 114, Firefox 125, Safari 17 – [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/popover)). Draft text:

> **Search by domain**
> - `svt` – domains whose name contains "svt" (e.g. svt.se, svtplay.se)
> - `svt.se` – as above, but only under .se, including subdomains
> - `www.svt.se` – subdomains of svt.se containing "www"
>
> The first part you type may be partial; the remaining parts must match exactly. Press Enter or click Search.
>
> **Extended search** searches all files and requires at least 2 characters.

**Implementation (two-step, fits D4 option A)**
1. Scan only the label columns the query needs (`label0`…`labelN`), row group by row group, via `parquetRead` with `onChunk` (`rowStart` gives original row numbers). Keep only matching row indexes; discard values.
2. `filteredDataFrame(df, indexes)` maps view row `i` → source row `indexes[i]`; other columns stay lazily loaded. For Extended search, `concatDataFrame` stacks per-file filtered views and adds the `File` column. Wrap with `sortableDataFrame`.

Not using hyparquet `filter` (see finding 8).

**Known limits**
- Only `label0`–`label4` hold strings in sample data → domains with > 5 labels cannot be fully matched.
- "All domains under a TLD" (e.g. all `.se`) is not expressible; `se` without a dot searches `label1`.

### 4.3 D10 – accessibility

Legal basis (EU):
- The EU's legal accessibility requirements are underpinned by the harmonised standard **EN 301 549 v3.2.1** ([European Commission – Web accessibility](https://digital-strategy.ec.europa.eu/en/policies/web-accessibility)).
- EN 301 549 v3.2.1 includes **WCAG 2.1 level AA** verbatim for web content ([W3C WAI – EU policies](https://www.w3.org/WAI/policies/european-union/)).
- Web Accessibility Directive (EU) 2016/2102 applies to **public sector bodies** and additionally requires an **accessibility statement** and a **feedback mechanism**. The European Accessibility Act (EU) 2019/882 covers listed products/services, also in the private sector (same sources).
- The client is **not a public sector body**, so the Directive's statement/feedback obligations do not apply. The technical target below is kept regardless (client decision).

Target: build to **WCAG 2.2 level AA** ([W3C](https://www.w3.org/TR/WCAG22/)), which covers the WCAG 2.1 AA criteria required by EN 301 549 plus the newer 2.2 criteria. Key requirements per area:

**Table** – follow the WAI-ARIA APG data grid pattern ([APG Grid](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)):
- `role="grid"` with `aria-rowcount` / `aria-colcount` = full counts; each rendered row has `aria-rowindex` (virtualization hides rows from the DOM, so screen readers need the real position).
- Sortable headers are buttons; the sorted header has `aria-sort="ascending"`.
- One tab stop into the grid (roving `tabindex`); Arrow keys, Home/End, Ctrl+Home/End, PageUp/PageDown move focus; focused cell scrolls into view.
- Loading cells expose a text alternative (e.g. visually hidden "Loading"), not only an animation.
- Column resize handles are keyboard operable and labelled.

**Search**
- Visible `<label>` for the input; Extended search is a native checkbox with label.
- Result count and progress announced via a `role="status"` live region ("12 results", "Searching file 3 of 5…").
- Validation message linked with `aria-describedby`; `aria-invalid` on the input when too short.
- (i) button has an accessible name ("Search help"); popover content reachable by keyboard.
- Disabled file selector uses the native `disabled` attribute.

**Other UI**
- Lens dropdown follows the APG menu button pattern (or uses a native `<select>`).
- `ParquetGrid` / `ParquetLayout` information currently only in `title` tooltips must also be available to keyboard and screen-reader users.
- Visible focus indicator everywhere; text contrast ≥ 4.5:1 (check grid/layout colours and dark header).
- `ErrorBar` uses `role="alert"`.
- `<html lang="en">`, meaningful page title, logo `alt`.

**Verification**: automated checks with `axe-core` in tests, plus manual keyboard-only and screen-reader passes (VoiceOver on macOS).

## 5. File mapping (React → Solid)

| React | Solid | Notes |
| --- | --- | --- |
| `main.tsx` | `src/index.tsx` | `render(() => <App/>, #app)`; drop hyperparam CSS imports |
| `App.tsx` | `src/App.tsx` | `createResource` for file list / selected dataset |
| `Layout.tsx` | `src/Layout.tsx` | `onMount` for title; own `ErrorBar` |
| `Page.tsx` | `src/Page.tsx` | `<Switch>/<Match>` for lens; `<For>` for options |
| `ParquetMetadata.tsx` | `src/lenses/ParquetMetadata.tsx` | Uses own `Json` |
| `ParquetLayout.tsx` | `src/lenses/ParquetLayout.tsx` | Logic → `src/lib/layout.ts` |
| `ParquetGrid.tsx` | `src/lenses/ParquetGrid.tsx` | Stats → `src/lib/grid.ts` |
| `hightable.HighTable` | `src/table/Table.tsx` | Virtualized, sortable |
| `hyperparam.Dropdown` | `src/components/Dropdown.tsx` | |
| `hyperparam.ErrorBar` | `src/components/ErrorBar.tsx` | |
| `hyperparam.Json` | `src/components/Json.tsx` | BigInt-safe, collapsible |
| `hyperparam.asyncBufferFrom` | `src/lib/source.ts` | `asyncBufferFromUrl` + `cachedAsyncBuffer` |
| `hyperparam.parquetDataFrame` | `src/lib/parquetDataFrame.ts` | Implements `hightable/dataframe` `DataFrame` |
| `formatFileSize` (in Page) | `src/lib/format.ts` | |
| – (new) | `src/lib/search.ts` | Query parsing + label predicate (pure) |
| – (new) | `src/lib/searchScan.ts` | Label-column scan → matching row indexes |
| – (new) | `src/lib/filteredDataFrame.ts`, `src/lib/concatDataFrame.ts` | Filtered / multi-file `DataFrame` views |
| – (new) | `src/search/SearchBar.tsx`, `src/search/SearchHelp.tsx` | Input, button, Extended search toggle, (i) popover |

## 6. Phases

### Phase 0 – Project setup
- [x] Flatten `tapir-hyparquet-solid/tapir-hyparquet-solid/*` into `tapir-hyparquet-solid/`; remove the empty inner folder.
- [x] `git init`; keep template `.gitignore`.
- [x] `package.json`: name `tapir-hyparquet-solid`, `version` 0.1.0, `license: MIT`, `private: true`; scripts `dev`, `build` (`tsc && vite build`), `preview`, `lint`, `test`, `typecheck`.
- [x] Dependencies (caret ranges): `solid-js`, `hyparquet`, `hyparquet-compressors`, `hightable` (dataframe subpath only). (`@tanstack/solid-virtual` removed in phase 5, see D4 amendment.)
- [x] Dev deps: `vite` 8, `vite-plugin-solid`, `typescript` 6, `vitest`, `eslint` 10, `@eslint/js`, `typescript-eslint`, `eslint-plugin-solid`, `globals`. `@solidjs/testing-library` deferred until component tests are added.
- [x] `solid-devtools` removed: its peer range is `vite` ≤ 7 (npm registry, 0.34.5). Vite 8 kept (current supported line, same major as the original); re-add devtools when it supports Vite 8.
- [x] `pnpm-workspace.yaml`: `autoInstallPeers: false` + `peerDependencyRules.ignoreMissing: [react, react-dom]` so `hightable`'s React peers are not installed.
- [x] `vite.config.ts`: `solidPlugin()`, `base: './'`, `css.lightningcss.errorRecovery: true`, `test.environment: 'node'` (vite-plugin-solid otherwise selects jsdom).
- [x] `tsconfig.json`: Solid JSX settings (`jsx: preserve`, `jsxImportSource: solid-js`) + original strictness flags; includes `src` and `test`.
- [x] `eslint.config.js`: original style rules + `eslint-plugin-solid/configs/typescript`; `defineConfig` from `eslint/config`; `projectService`.
- [x] `index.html`: original title, meta, Mulish font, favicon, `main#content > div#app`; `#file-input` dropped; script `/src/index.tsx`.
- [x] Copy `public/TAPIR-*.svg`, `src/parquets/*.parquet`, `LICENSE`.
- [x] Port package test as `test/package.test.ts`: keeps the MIT license check; name/version checks dropped (they block valid changes); React guard reads `pnpm-lock.yaml` and fails if `react`/`react-dom` are installed, directly or transitively.
- [x] Verify: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass; `pnpm dev` serves the placeholder `App`; no `react` in `dist/`.

### Phase 1 – Pure logic (no UI) + tests
- [x] `src/lib/format.ts`: `formatFileSize`. Cell values use `stringify` from `hightable/dataframe` directly (handles BigInt, Date as ISO, nested objects), so no own wrapper.
- [x] `src/lib/layout.ts`: `collectLayoutItems`, `getColumnRange`, `columnPages` (moved out of the `Column` component), `metadataRange`, layout item types.
- [x] `src/lib/grid.ts`: `gridColumns` (names, totals, maxes, grid template), `rowGroupStats`, `rowGroupTitle`, `columnCell`, `columnLabelTitle`.
- [x] Unit tests: synthetic metadata for exact values + invariants on the sample files (`test/samples.ts` loads their metadata).

### Phase 2 – Data layer
- [x] `src/lib/source.ts` (`openParquetUrl`): file size from a 1-byte range request (`Range: bytes=0-0` → `Content-Range`), not HEAD – GitHub Pages returns the gzip-compressed size in HEAD `Content-Length` (verified with `curl` on a deployed SVG: 3954 vs. 9982 bytes). 206 → `asyncBufferFromUrl` + `cachedAsyncBuffer`; 200 (range ignored) → the probe response already holds the whole file. Range support verified on the Vite dev server (206 for parquet) and GitHub Pages (206 for SVG).
- [x] `src/lib/dataset.ts`: `listDataSets()` from `import.meta.glob(..., { query: '?url', import: 'default', eager: true })` (names + URLs, sorted, no download); `loadDataSet(entry)` → `{ name, url, byteLength, metadata, df }`.
- [x] `src/lib/parquetDataFrame.ts`: `DataFrame` with `parquetRead` + `onChunk` per chunk of ≤ 1000 rows within row group boundaries (`planChunks`); `compressors` from `hyparquet-compressors`; per chunk+column read de-duplication; failed reads are retried on next fetch; `resolve` events; `AbortSignal` checked before/after (hyparquet reads cannot be cancelled mid-way).
- [x] Wrap with `sortableDataFrame` from `hightable/dataframe` (in `loadDataSet`).
- [x] Tests: `planChunks`; every cell equals `parquetReadObjects`; only requested columns decoded; no duplicate reads; abort; retry; sorting; `loadDataSet` against a fake static server with and without range support.
- [ ] (Later, optional) move decoding to a Web Worker if large files block the main thread.
- [x] After Phase 3 deploy: confirmed in the browser that a parquet file on GitHub Pages loads via range requests (`bytes=0-0` → 206, `Content-Range: …/16283`, then one range). Pages gzips `.parquet` (`application/octet-stream`) when gzip is accepted, and then even ranges refer to the compressed bytes; browsers avoid this because the Fetch standard adds `Accept-Encoding: identity` to requests with a `Range` header. A HEAD request has no `Range`, so its size would still be the compressed one – the reason for the probe in `source.ts`.

### Phase 3 – Shell components
- [x] `ErrorBar`: always-present `role="alert"` region; close button; a new error object shows the bar again.
- [x] `Dropdown`: APG menu button (`aria-haspopup`, `aria-expanded`, `aria-controls`; `menu`/`menuitem(radio)` with `aria-checked`; arrows/Home/End/Escape/Tab; focus returns to the button; outside click closes). Takes an `items` list instead of arbitrary children.
- [x] `Json`: Solid port; toggles are `<button aria-expanded>` (disclosure pattern) instead of clickable `div role="treeitem"`, which had no keyboard support. Pure helpers in `src/lib/json.ts`.
- [x] Decorative carets are `aria-hidden` spans; CSS `::before` text ended up in accessible names ("▼ View: Table").
- [x] `Layout`: title via `onMount`, `ErrorBar`. Progress bar dropped (never used by the original `App`).
- [x] `App`: `listDataSets()`, selected index signal, `createResource(loadDataSet)`; resource errors routed to `ErrorBar`.
- [x] `Page`: `<h1>` with decorative logo (`alt=""`, the text follows), file `<select>`, size (bytes in `title`), row count, lens menu (accessible name "View: …"), lens `<Switch>`; placeholders for Table/Layout/Grid; "No parquet files found" and `role="status"` loading state. Layout lens always offered (size is always known now).
- [x] `src/index.css`: original rules + needed parts of `hyperparam/global.css`; unused rules dropped (incl. the broken `logo-header` selector, which matched nothing). Visible `:focus-visible` outline (hyperparam removed button outlines). Grid label colour `#888` → `#666` (contrast 3.5:1 → 5.7:1). Long file names no longer push the `<select>` out of the header.
- [x] Component tests (`@solidjs/testing-library` + `jsdom`, per file `// @vitest-environment jsdom`): ErrorBar, Dropdown keyboard/focus, Json.
- [x] Verified in the browser (dev + `vite preview`): file switching, menu by mouse and keyboard, metadata tree, range requests (`bytes=0-0` → 206, then one range for small files).

### Phase 4 – Static lenses
- [x] `ParquetMetadata` (via `Json`) – done in phase 3 to exercise `Json` in the browser; uses `<div>` instead of the original `<code>`, which cannot contain block elements.
- [x] `ParquetLayout`: `Group`/`Cell`/`Column` with `<For>`/`<Show>`/`<Switch>` on top of `src/lib/layout.ts`. Names are `<span>` instead of `<label>` (no form controls); groups are `role="group"` labelled by their name.
- [x] `ParquetGrid`: same bars and `title` tooltips on top of `src/lib/grid.ts`. Tooltips are mouse-only, so the visual grid is `aria-hidden` and a `<details>` "Show as table" offers the numbers as a data table (caption, column/row headers, totals) for keyboard and screen-reader users (4.3).
- [x] Parity checked against the running React app on the same file: layout text identical, all 55 grid tooltips identical, bar widths identical.
- [x] Component tests: layout structure and group names; grid `aria-hidden` + table headers/values/totals.

### Phase 5 – Table
Feature parity with HighTable 0.26.4 (behaviour read from its sources in `node_modules/hightable/dist/HighTable.js.map` and checked in the running React app):
- [x] Virtualized rows: `src/lib/viewport.ts` (fixed 33px rows, 20 rows overscan, canvas capped at 8M px with proportional scroll); `df.fetch` for the rendered range, aborted when the range, columns or sort change; re-render on `resolve`/`update` events.
- [x] Per-cell loading placeholder (shimmer, disabled with `prefers-reduced-motion`) plus visually hidden "Loading" text and `aria-busy`.
- [x] Sticky header, corner and row-number column; 1-based original row numbers.
- [x] Sorting: click or Enter/Space on a header → `toggleColumn` (ascending → descending → none, multi-column); indicator; `aria-sort` on the primary column.
- [x] Column widths (`src/lib/columnWidths.ts`): measured when data arrives, adjusted to fit the viewport (HighTable's algorithm), user widths persisted in `localStorage` per data set; resize by pointer drag or keyboard; double-click / Enter auto-sizes.
- [x] Column menu (⋮, `Dropdown` rendered in a portal): sort order, hide column, show all columns.
- [x] Keyboard navigation: one tab stop (roving `tabindex`), arrows, Ctrl+arrows, Home/End, Ctrl+Home/End, PageUp/PageDown (20 rows); Enter/Space/Tab on the scroll area enters the grid.
- [x] Copy: Ctrl/Cmd+C on a focused cell copies its text (HighTable feature; the earlier "not planned" note was wrong).
- [x] Long values (> 100 characters) get a tooltip.
- [x] Fresh table per data set (scroll, sort, focus, hidden columns reset); `Page` renders it keyed by data set.
- [x] CSS ported from HighTable (styled variant), incl. the hyparquet logo in the corner cell.
- [x] Parity checked against the React app on the same file: identical headers, first 15 rows, rows after sorting by `label1`, `aria-sort`; column widths within 1–2 px.
- [x] Tests: viewport math, column width rules/storage, and a component test (grid semantics, fetching, sort cycle, keyboard, hide/show, resize + persistence, fetch errors).
- ~~Row selection~~ – **deferred** (decided 2026-10-16): not enabled in the original app (HighTable only turns it on when `selection`/`onSelectionChange` props are passed, and `tapir-hyparquet` passes neither), and nothing uses a selection yet. Revisit if a feature needs it, e.g. exporting selected rows.
- [ ] Accessibility gaps found in review (WCAG 2.2 AA): column menu button is 20×20 px and the resize handle 8 px wide, below the 24×24 px target size (2.5.8); column resizing by pointer needs a single-pointer alternative to dragging (2.5.7) – keyboard alone does not satisfy it.

Deviations from HighTable (accessibility):
- No automatic focus on mount: HighTable focuses the first cell when the table appears, which moves focus away from the file `<select>` on change (WCAG 3.2.2).
- Data cells are `role="gridcell"` (HighTable: `cell`, invalid inside `grid`); `aria-sort` only on the primary sort column.
- Resize handle is a focusable `separator` (APG window splitter) instead of a `spinbutton`.

### Phase 6 – Search (D8)
- [ ] `src/lib/search.ts`: normalise + parse query → `{ substring: { label, value }, exact: { label, value }[] }`; `matches(row)`; unit tests for every row of the 4.2 table and the edge cases (trailing dot, uppercase, > 5 labels, empty).
- [ ] `src/lib/searchScan.ts`: scan required label columns per row group, return matching row indexes; honour `AbortSignal`; tests vs. a brute-force `parquetReadObjects` filter on sample files.
- [ ] `src/lib/filteredDataFrame.ts` + tests.
- [ ] `src/lib/concatDataFrame.ts` (adds `File` column) + tests.
- [ ] `SearchBar`: input, Search button, Enter submit, Extended search toggle, min-length validation (2), progress text, live region (4.3).
- [ ] `SearchHelp`: (i) button + `popover="auto"` with the 4.2 help text.
- [ ] Wire into `Page`/`App`: query + scope signals, `createResource` for results, disable file selector in extended mode, empty-state hint.

### Phase 7 – CI / deploy
- [x] Port `.github/workflows/deploy.yaml` from the original; only change: pnpm (`npm install -g pnpm@11.25.0`, `pnpm install --frozen-lockfile`, `pnpm run build`); Node 24.
- [x] Enable GitHub Pages in the repo (Settings → Pages → Source: GitHub Actions).
- [x] Add lint + test steps before build.
- [x] After build: fail if `dist/` contains React (grep for React's JSX-runtime marker `react.element` / `react.transitional.element`).

### Phase 8 – Verification & cleanup
- [ ] Side-by-side check against the React app for every lens and every sample file.
- [ ] Test with a large generated parquet file (100k+ rows, multiple row groups): first paint time, scroll, sort, memory.
- [ ] Search on the large file and in Extended search across all sample files: correctness, scan time, abort.
- [ ] Accessibility: `axe-core` checks pass; keyboard-only and VoiceOver walkthrough of table, search and lenses.
- [ ] Update `README.md` (pnpm commands, Solid).

## 7. Risks / open questions

- Range requests: verified on the Vite dev server and GitHub Pages (SVG). Parquet on Pages to be confirmed after the Phase 3 deploy; fallback (whole file) exists.
- Cell cache in `parquetDataFrame` is never evicted (same as the original); scrolling through a very large file eventually holds all fetched cells in memory.
- `sortableDataFrame` sorts by fetching whole columns; on very large files the first sort is expensive – acceptable or needs worker?
- D11: final production data source (bundled vs. external URL) – deferred; an external URL also needs CORS + range-request support on that server, and must expose `Content-Range` (`Access-Control-Expose-Headers`) for the size probe in `source.ts`.
- Not planned (not used by the current app): HighTable cell double-click handler. Add only on request.
- The corner cell loads the hyparquet logo from `hyperparam.app` (as the original): a third-party request on every page load.
- TypeScript is held at 6.x: `typescript-eslint` 8.71.2 requires `typescript <6.1.0` (npm registry). Revisit when typescript-eslint supports TS 7.
