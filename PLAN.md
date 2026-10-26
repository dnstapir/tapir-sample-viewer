# Migration plan: tapir-hyparquet (React) → tapir-hyparquet-solid (Solid)

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

## 1. Goal

Port the DNS Tapir parquet viewer from React to SolidJS with **feature parity** and **no React dependency** (direct or transitive in the bundle). The app must handle large parquet files (100k+ rows, multiple row groups).

Reference project (read-only): `../tapir-hyparquet/`

## 2. Inventory

### 2.1 Source: `tapir-hyparquet/` (React 19, npm)

| File                            | Role                                                                                                                                             | React/hyperparam coupling                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `src/main.tsx`                  | Entry; imports `hightable/src/HighTable.css`, `hyperparam/global.css`, `hyperparam/hyperparam.css`, `index.css`; mounts `<App/>` in `#app`       | `react-dom/client`, `StrictMode`                                                              |
| `src/App.tsx`                   | Globs `src/parquets/*.parquet` (`?url`), fetches **all** files fully, builds `DataSet[]` (metadata + `sortableDataFrame(parquetDataFrame(...))`) | `useState/useEffect/useCallback`; `hyperparam.asyncBufferFrom`, `hyperparam.parquetDataFrame` |
| `src/Layout.tsx`                | Sets `document.title`, content wrapper, `ErrorBar`, optional progress bar                                                                        | `hyperparam.ErrorBar`, `hyperparam.cn`                                                        |
| `src/Page.tsx`                  | Header (logo, file `<select>`), view header (size, row count, lens `Dropdown`), lens switch; `formatFileSize()`                                  | `hightable.HighTable`, `hyperparam.Dropdown`                                                  |
| `src/ParquetMetadata.tsx`       | JSON view of `FileMetaData`                                                                                                                      | `hyperparam.Json`                                                                             |
| `src/ParquetLayout.tsx`         | Byte layout: magic, row groups → columns → pages, column/offset indexes, footer; `collectLayoutItems()`, `getColumnRange()`                      | Plain JSX only                                                                                |
| `src/ParquetGrid.tsx`           | CSS-grid visualisation of row groups × column chunks with tooltips                                                                               | Plain JSX only                                                                                |
| `src/index.css`                 | App styles (includes unused rules: dropzone, sidebar, welcome, quick-links, `.brand`)                                                            | —                                                                                             |
| `src/assets/*`                  | `demo.png`, provider SVGs — referenced only by unused CSS                                                                                        | —                                                                                             |
| `src/parquets/*.parquet`        | 5 sample files: 46–71 rows, 1 row group, 27 columns, SNAPPY, written by `parquet-cpp-arrow 21.0.0`                                               | —                                                                                             |
| `public/TAPIR-*.svg`            | Logo + favicon                                                                                                                                   | —                                                                                             |
| `index.html`                    | `main#content > div#app`, Mulish font, meta tags, unused `#file-input`                                                                           | —                                                                                             |
| `vite.config.ts`                | `@vitejs/plugin-react`, `optimizeDeps.exclude: ['hyperparam']`, `lightningcss.errorRecovery`, `base: './'`                                       | React plugin                                                                                  |
| `eslint.config.js`              | typescript-eslint strictTypeChecked + style rules + React plugins                                                                                | React plugins                                                                                 |
| `test/package.test.js`          | Asserts name `hyparquet-demo`, semver version, MIT, **exact** dependency versions                                                                | —                                                                                             |
| `.github/workflows/deploy.yaml` | GitHub Pages deploy, Node 24, `npm ci && npm run build`                                                                                          | —                                                                                             |

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

| ID  | Topic                | Decision                                                                                                                                                                       | Status                                   |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| D1  | Package manager      | pnpm                                                                                                                                                                           | Decided                                  |
| D2  | Folder layout        | Flatten to `tapir-hyparquet-solid/`                                                                                                                                            | Decided                                  |
| D3  | `hyperparam`         | Remove entirely; reimplement used parts in Solid / on top of `hyparquet`                                                                                                       | Decided                                  |
| D4  | Table implementation | **Option A** (see 4.1); full HighTable feature parity (see Phase 5)                                                                                                            | Decided                                  |
| D5  | Data loading         | Load metadata lazily for the selected file only; read row data on demand via range requests                                                                                    | Decided                                  |
| D6  | Dependency versions  | Caret ranges (`^x.y.z`) in `package.json`; reproducibility via committed `pnpm-lock.yaml` + `--frozen-lockfile` in CI. Drop the exact-version assertion from `package.test.js` | Decided                                  |
| D7  | Docs language        | English                                                                                                                                                                        | Decided                                  |
| D8  | Search               | Two modes (Domain / Columns), Match choice (Includes string / Exact match), leading `www.` ignored, Extended search, options apply on submit; see 4.2. Time span deferred     | Decided (amended 2026-10-19, 2026-10-23, 2026-10-26) |
| D9  | UI language          | English for all UI text (column names from parquet are English)                                                                                                                | Decided                                  |
| D10 | Accessibility        | Comply with EU accessibility law: EN 301 549 (WCAG 2.1 AA for web); build to WCAG 2.2 AA, see 4.3                                                                              | Decided                                  |
| D11 | Data source          | External URL `https://public.test.dnstapir.se/parquet-samples/`, files listed in `index.json`; all file access goes through `src/lib/dataset.ts`                               | Decided 2026-10-26                       |
| D12 | Lint / format        | Biome replaces ESLint (and Prettier is not used): `recommended` preset + Solid domain, line width 120; manual `pnpm format`; `biome ci` in CI on every push (`check.yaml`) and in `deploy.yaml`. Loss accepted: `solid/reactivity` and typescript-eslint type-aware rules. False positives turned off per file in `biome.json` `overrides` (decided 2026-10-26): dynamic `role` values (Table scroller, Dropdown items), `<table role="grid">` (allowed by ARIA in HTML, APG data grid), `tabindex="0"` on scroll regions (WCAG 2.1.1, axe `scrollable-region-focusable`), `role="group"` on non-form content, `Math.max` on `bigint` in a test | Decided 2026-10-26                       |
| D13 | TypeScript 7         | Upgrade from 6.x as a separate step after D12 (typescript-eslint, which capped TS at `<6.1.0`, is gone; `tsc` 7.0.2 checks the project with 0 errors)                         | Decided 2026-10-26                       |

### 4.1 D4 – table options (no React)

Requirement driver: files may reach 100k+ rows and several row groups.

|                             | A. `hightable/dataframe` + `@tanstack/solid-virtual` + own Solid rendering | B. `@tanstack/solid-table` (+ `@tanstack/solid-virtual`) | C. Plain `<table>` + `<For>` |
| --------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------- |
| Data in memory              | Only fetched row chunks                                                    | Entire file as JS objects                                | Entire file as JS objects    |
| Initial load, 100k+ rows    | Metadata + first visible chunk                                             | Full decode of all rows before first paint               | Full decode + full DOM       |
| DOM size                    | Visible rows only                                                          | Visible rows only (with virtual)                         | All rows                     |
| Sorting                     | `sortableDataFrame` (same semantics as today)                              | Built-in, in-memory                                      | Hand-written                 |
| Extra features              | Hand-written (column resize etc.)                                          | Filtering, resizing, grouping built in                   | None                         |
| Reuse of current data model | Full (`DataFrame` contract unchanged)                                      | None – new row model                                     | None                         |
| Own code                    | Most (cell loading states, header, scroll sync)                            | Medium                                                   | Least                        |

**Decision: A** (rationale):

- Only A keeps lazy, row-group-chunked reads, which is the property that makes large files workable; B and C must decode the whole file up front (27 columns × 100k+ rows of objects, BigInt included) before showing anything.
- A keeps the exact `DataFrame` / `sortableDataFrame` contract the React app already relies on, so sorting behaviour stays identical and the data layer is testable without UI.
- `@tanstack/solid-virtual` is headless and Solid-native (peer `solid-js ^1.3.0`, v3.13.47 on npm), so rendering stays fully under our control and styling can reuse HighTable-like CSS.
- B becomes preferable only if built-in filtering/grouping matters more than large-file performance.

**Amendment (phase 5):** rows have a fixed height (33px, as in HighTable), so windowing is plain arithmetic in `src/lib/viewport.ts` instead of `@tanstack/solid-virtual` (dependency removed). This also allows capping the canvas at 8M px with proportional scroll mapping, like HighTable; a fixed-height list library would exceed browser element-height limits above ~240k rows.

Sources: npm registry (`@tanstack/solid-virtual/latest` 3.13.47, `@tanstack/solid-table/latest` 9.3.1, `solid-js/latest` 1.9.17, `vite-plugin-solid/latest` 2.11.14 with peer `vite ^…^8 || ^9`), checked 2026-10-16; local `node_modules` of `tapir-hyparquet`.

### 4.2 D8 – search specification

Requirement (client): `label1` is the primary search target; searching on a full domain name (`www.svt.se`) is desired. Amended 2026-10-19: the user can also choose which label columns to search.

**Search options** (all apply only on submit, see Trigger)

- **Mode** (radio group): **Domain** (default, DNS matching below) or **Columns**.
- **Match** (radio group, both modes; added 2026-10-23, Columns mode added the same day): **Includes string** (default; called "Include subdomains" until 2026-10-26) or **Exact match**, see Matching below.
- **Columns** (only in Columns mode; the checkboxes are not rendered in Domain mode): checkboxes `label0`–`label9`, one or more; default `label1`. At least one must be checked: as soon as all are unchecked, the message "Choose at least one column to search." is shown (before any submit, so the user knows what to do in advance – cognitive accessibility), linked to the group with `aria-describedby`; submitting in that state does not search. `label5`–`label9` are empty in all sample files but stay selectable, as real data may use them.
- **Extended search** (checkbox): search all files instead of the selected one.

**Trigger**

- `<input type="search">` + **Search** button. A search runs only on **Enter** or button click; no search-as-you-type.
- Minimum query length: **2 characters** (normalised query) in both modes and both scopes; shorter input shows a validation message.
- Submitting an empty query in normal scope shows the unfiltered selected file.
- A new submit aborts a running search (`AbortController`).
- Changing the selected file **clears the result** (the file is shown unfiltered); query and options stay in the controls.
- Changing mode, match, columns or Extended search has **no effect until the next submit**. While these options differ from the last submitted search, a visible note **"Options changed – press Search to update."** is shown below the options and read where it stands (not tied to the Search button – client decision 2026-10-19; not a live region, so it is not announced on every checkbox change). Editing the query text alone does not show the note.

**Normalisation**: trim, lowercase; Domain mode also strips one trailing `.` and then one leading `www.` (decided 2026-10-23: `www` never occurs in the data, confirmed by the user; the sample files have no `www` in `label2`/`label3`). `www.` is removed only at the start (`a.www.svt.se` is unchanged).

**Matching – Domain mode (follows DNS structure)**

1. Split the query on `.` and reverse: last part → `label0`, next → `label1`, …
2. **Includes string**: the **leftmost typed label** is a **substring** match; **all other** labels must match **exactly**. Labels deeper than the query are unconstrained → **subdomains are included**.
3. **Exact match** (added 2026-10-23): **all** typed labels must match exactly and the next deeper label must be empty → only the domain as typed. No extra condition when all 10 labels are typed.
4. Query without a dot → `label1`. Includes string: substring match. Exact match: `label1` equals the query and `label2` is empty, i.e. only `<query>.<tld>` (changed 2026-10-26; before, a substring match with either choice).

| Query                  | Match              | Predicate                                                        | Matches e.g.                         | Does not match             |
| ---------------------- | ------------------ | ---------------------------------------------------------------- | ------------------------------------ | -------------------------- |
| `svt`                  | Includes string    | `label1` ⊇ `svt`                                                 | `svt.se`, `svtplay.se`, `api.svt.se` | `svt.example.com`          |
| `svt`                  | Exact match        | `label1 = svt` ∧ `label2` empty                                  | `svt.se`, `svt.com`                  | `svtplay.se`, `api.svt.se` |
| `svt.se`               | Includes string    | `label0 = se` ∧ `label1` ⊇ `svt`                                 | `svt.se`, `api.svt.se`, `svtplay.se` | `svt.com`                  |
| `www.svt.se`           | Includes string    | same as `svt.se`                                                 | same as `svt.se`                     |                            |
| `svt.se`, `www.svt.se` | Exact match        | `label0 = se` ∧ `label1 = svt` ∧ `label2` empty                  | `svt.se`                             | `svtplay.se`, `api.svt.se` |
| `api.svt.se`           | Exact match        | `label0 = se` ∧ `label1 = svt` ∧ `label2 = api` ∧ `label3` empty | `api.svt.se`                         | `a.api.svt.se`             |

**Matching – Columns mode**: a row matches if **any** selected column **contains** the query (OR, substring). Example: columns `label0`, query `se` → every domain under `.se` (and also e.g. `.sex`, since it is a substring match). With **Exact match** (2026-10-23) a selected column must **equal** the query (case-insensitive): columns `label1`, query `svt` → `svt.se`, `svt.com`, not `svtplay.se`.

**Results**: the table is **filtered to matching rows only**; sorting works on the filtered view.

**Scope – "Extended search" toggle** (state after submit)

| Toggle | Query             | Shown                                                                                                                                                                                                              |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Off    | empty             | Selected file, unfiltered                                                                                                                                                                                          |
| Off    | ≥ 2 chars         | Matches in the selected file                                                                                                                                                                                       |
| On     | empty / < 2 chars | Not submitted: validation message "Enter at least 2 characters to search all files."; the current table stays (with options applied on submit, an empty "no table" state is no longer needed – changed 2026-10-19) |
| On     | ≥ 2 chars         | Matches from **all files** in one table with an extra **File** column                                                                                                                                              |

- The file selector follows the Extended search **checkbox** directly (decided 2026-10-19, an exception to "options apply on submit"): disabled while it is checked, enabled as soon as it is unchecked. Choosing a file then clears the all-files result and shows that file unfiltered, like any file change; otherwise the result stays until the next submit.
- Progress indicator "Searching file N of M…" during multi-file scans.
- Metadata per file is loaded on first use and cached (`createDataSetLoader`), shared with the file selector.
- All files share the same schema (confirmed by client), so results are simply stacked.
- Row numbers in results are the original row numbers in each file.
- Domain mode also rejects empty parts (`.se`, `www..se`) and more than 10 parts (only `label0`–`label9` exist).

**Help**: an **(i)** button (name "Help") next to the search field opens a modal `<dialog>` (decided 2026-10-19, replaced `popover="auto"`, which left the page behind reachable by Tab). Focus moves to the heading "Help" so reading starts at the top; the Close button comes last. Esc, Close or a click on the backdrop closes it; focus returns to the button. Draft text (to be reviewed with the client once search is built, see Phase 6):

> **Search**
> Type at least 2 characters and press Enter or click Search. Changed options take effect when you search again.
>
> **Domain** – type a domain name or part of one:
>
> - `svt` – domains whose name contains "svt" (e.g. svt.se, svtplay.se)
> - `svt.se` – as above, but only under .se, including subdomains
>
> A leading “www.” is ignored: `www.svt.se` searches for `svt.se`.
>
> Includes string: the first part you type may be partial; the remaining parts must match exactly. Exact match: only the domain as typed, e.g. `svt.se` finds svt.se but not svtplay.se or api.svt.se, and `svt` finds svt.se and svt.com.
>
> **Columns** – finds rows where any of the selected columns contains the text. `label0` is the top-level domain (e.g. se), `label1` the name below it (e.g. svt), and so on.
>
> **Extended search** searches all files and adds a File column.

**Implementation (two-step, fits D4 option A)**

1. Scan only the label columns the search needs (Domain mode: `label0`…`labelN` from the query; Columns mode: the selected columns), row group by row group, via `parquetRead` with `onChunk` (`rowStart` gives original row numbers). Keep only matching row indexes; discard values.
2. `filteredDataFrame(df, indexes)` maps view row `i` → source row `indexes[i]`; other columns stay lazily loaded. For Extended search, `concatDataFrame` stacks per-file filtered views and adds the `File` column. Wrap with `sortableDataFrame`.

Not using hyparquet `filter` (see finding 8).

**Known limits**

- Only `label0`–`label4` hold strings in sample data → domains with > 5 labels cannot be fully matched.
- "All domains under a TLD" (e.g. all `.se`) is not expressible in Domain mode (`se` without a dot searches `label1`); use Columns mode with `label0`.

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
- (i) button has an accessible name ("Help"); the help is a modal dialog, reachable by keyboard.
- Disabled file selector uses the native `disabled` attribute.

**Other UI**

- Lens dropdown follows the APG menu button pattern (or uses a native `<select>`).
- `ParquetGrid` / `ParquetLayout` information currently only in `title` tooltips must also be available to keyboard and screen-reader users.
- Visible focus indicator everywhere; text contrast ≥ 4.5:1 (check grid/layout colours and dark header).
- Pointer targets ≥ 24×24 CSS px, or no other target within a 24 px circle around an undersized one; targets inside another clickable element always need the full size ([Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).
- `ErrorBar` uses `role="alert"`.
- `<html lang="en">`, meaningful page title, logo `alt`.

**Verification**: automated checks with `axe-core` in tests, plus manual keyboard-only and screen-reader passes (VoiceOver on macOS).

## 5. File mapping (React → Solid)

| React                         | Solid                                                        | Notes                                                     |
| ----------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| `main.tsx`                    | `src/index.tsx`                                              | `render(() => <App/>, #app)`; drop hyperparam CSS imports |
| `App.tsx`                     | `src/App.tsx`                                                | `createResource` for file list / selected dataset         |
| `Layout.tsx`                  | `src/Layout.tsx`                                             | `onMount` for title; own `ErrorBar`                       |
| `Page.tsx`                    | `src/Page.tsx`                                               | `<Switch>/<Match>` for lens; `<For>` for options          |
| `ParquetMetadata.tsx`         | `src/lenses/ParquetMetadata.tsx`                             | Uses own `Json`                                           |
| `ParquetLayout.tsx`           | `src/lenses/ParquetLayout.tsx`                               | Logic → `src/lib/layout.ts`                               |
| `ParquetGrid.tsx`             | `src/lenses/ParquetGrid.tsx`                                 | Stats → `src/lib/grid.ts`                                 |
| `hightable.HighTable`         | `src/table/Table.tsx`                                        | Virtualized, sortable                                     |
| `hyperparam.Dropdown`         | `src/components/Dropdown.tsx`                                |                                                           |
| `hyperparam.ErrorBar`         | `src/components/ErrorBar.tsx`                                |                                                           |
| `hyperparam.Json`             | `src/components/Json.tsx`                                    | BigInt-safe, collapsible                                  |
| `hyperparam.asyncBufferFrom`  | `src/lib/dataset.ts` (`loadDataSet`)                         | `asyncBufferFromUrl` + `cachedAsyncBuffer`                |
| `hyperparam.parquetDataFrame` | `src/lib/parquetDataFrame.ts`                                | Implements `hightable/dataframe` `DataFrame`              |
| `formatFileSize` (in Page)    | `src/lib/format.ts`                                          |                                                           |
| – (new)                       | `src/lib/search.ts`                                          | Query parsing + label predicate (pure)                    |
| – (new)                       | `src/lib/searchScan.ts`                                      | Label-column scan → matching row indexes                  |
| – (new)                       | `src/lib/filteredDataFrame.ts`, `src/lib/concatDataFrame.ts` | Filtered / multi-file `DataFrame` views                   |
| – (new)                       | `src/search/SearchBar.tsx`, `src/search/SearchHelp.tsx`      | Input, button, Extended search toggle, (i) popover        |

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

- [x] `src/lib/source.ts` (`openParquetUrl`): file size from a 1-byte range request (`Range: bytes=0-0` → `Content-Range`), not HEAD – GitHub Pages returns the gzip-compressed size in HEAD `Content-Length` (verified with `curl` on a deployed SVG: 3954 vs. 9982 bytes). 206 → `asyncBufferFromUrl` + `cachedAsyncBuffer`; 200 (range ignored) → the probe response already holds the whole file. Range support verified on the Vite dev server (206 for parquet) and GitHub Pages (206 for SVG). **Superseded 2026-10-26:** `source.ts` removed; `loadDataSet` calls `asyncBufferFromUrl({ url })` (size from HEAD `Content-Length`, see section 7, D11).
- [x] `src/lib/dataset.ts`: `listDataSets()` from `import.meta.glob(..., { query: '?url', import: 'default', eager: true })` (names + URLs, sorted, no download); `loadDataSet(entry)` → `{ name, url, byteLength, metadata, df }`.
- [x] `src/lib/parquetDataFrame.ts`: `DataFrame` with `parquetRead` + `onChunk` per chunk of ≤ 1000 rows within row group boundaries (`planChunks`); `compressors` from `hyparquet-compressors`; per chunk+column read de-duplication; failed reads are retried on next fetch; `resolve` events; `AbortSignal` checked before/after (hyparquet reads cannot be cancelled mid-way).
- [x] Wrap with `sortableDataFrame` from `hightable/dataframe` (in `loadDataSet`).
- [x] Tests: `planChunks`; every cell equals `parquetReadObjects`; only requested columns decoded; no duplicate reads; abort; retry; sorting; `loadDataSet` against a fake static server with and without range support.
- [ ] (Later, optional) move decoding to a Web Worker if large files block the main thread.
- [x] After Phase 3 deploy: confirmed in the browser that a parquet file on GitHub Pages loads via range requests (`bytes=0-0` → 206, `Content-Range: …/16283`, then one range). Pages gzips `.parquet` (`application/octet-stream`) when gzip is accepted, and then even ranges refer to the compressed bytes; browsers avoid this because the Fetch standard adds `Accept-Encoding: identity` to requests with a `Range` header. A HEAD request has no `Range`, so its size would still be the compressed one – the reason for the probe in `source.ts` (removed 2026-10-26; files are no longer served from Pages, D11).

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
- [x] Column widths (`src/lib/columnWidths.ts`): measured when data arrives, adjusted to fit the viewport (HighTable's algorithm), user widths persisted in `localStorage` per data set; resize by pointer drag (double-click fits to content) or from the column menu.
- [x] Column menu (⋮, `Dropdown` rendered in a portal, name "Column menu"): Sort ascending / Sort descending / Remove sort (`menuitemradio`, current choice checked; added back 2026-10-19 so sorting can be reached with VO+arrows, which skip the header cell), Wider, Narrower (±50 px), Fit to content, hide column, show all columns. The earlier "Sort order: …" item was removed (2026-10-19) because its label showed the current state while selecting it switched to the next one; the new items name the action.
- [x] Keyboard navigation: one tab stop (roving `tabindex`), arrows, Ctrl+arrows, Home/End, Ctrl+Home/End, PageUp/PageDown (20 rows); Enter/Space/Tab on the scroll area enters the grid.
- [x] Copy: Ctrl/Cmd+C on a focused cell copies its text (HighTable feature; the earlier "not planned" note was wrong).
- [x] Long values (> 100 characters) get a tooltip.
- [x] Fresh table per data set (scroll, sort, focus, hidden columns reset); `Page` renders it keyed by data set.
- [x] CSS ported from HighTable (styled variant). The hyparquet logo in the corner cell was later replaced by the row number sort header (below).
- [x] Parity checked against the React app on the same file: identical headers, first 15 rows, rows after sorting by `label1`, `aria-sort`; column widths within 1–2 px.
- [x] Tests: viewport math, column width rules/storage, and a component test (grid semantics, fetching, sort cycle, keyboard, hide/show, resize + persistence, fetch errors).
- ~~Row selection~~ – **deferred** (decided 2026-10-16): not enabled in the original app (HighTable only turns it on when `selection`/`onSelectionChange` props are passed, and `tapir-hyparquet` passes neither), and nothing uses a selection yet. Revisit if a feature needs it, e.g. exporting selected rows.
- [x] Target size (WCAG 2.5.8, fixed 2026-10-16): column menu button 20×20 → 24×24 px, resize handle hit area 8 → 24 px wide (visible line still 4 px). Both sit inside the clickable header, so the spacing exception cannot apply. Header `padding-right` grows from `10px + 2.5rem` (50 px) to `48px + 1rem` (64 px), so auto-measured columns are 14 px wider than in the original. The same review found JSON toggles in the Metadata lens on adjacent lines too close for the spacing exception; they now have `min-height`/`min-width: 24px`. Checked in the browser: every target in all lenses is ≥ 24×24 or passes the spacing exception (file `<select>` 21 px high and lens button 17 px high pass by spacing).
- [x] Dragging alternative (WCAG 2.5.7) – solved 2026-10-19 by the Wider / Narrower / Fit to content menu items.
- [x] Row number header (decided 2026-10-16): the corner cell is a `columnheader` "Row number"; click/Enter/Space clears all sorting (file order). It has `aria-sort="ascending"` while no other column is sorted. Multi-column sort (HighTable `toggleColumn`) is kept as is; this header is the way back to file order.
- Fixed-width dot on headers (4×4 px, `#9d9cd5`, ≈ 2.3:1 on `#f0f0f0`): client decision 2026-10-16 – not information needed to use the table, so WCAG 1.4.11 does not apply. Kept as in HighTable.

Deviations from HighTable (accessibility):

- No automatic focus on mount: HighTable focuses the first cell when the table appears, which moves focus away from the file `<select>` on change (WCAG 3.2.2).
- Data cells are `role="gridcell"` (HighTable: `cell`, invalid inside `grid`); `aria-sort` only on the primary sort column.
- Resize handle is pointer-only and hidden from assistive technology (`aria-hidden`, not focusable); keyboard, screen-reader and single-pointer users resize from the column menu (HighTable: focusable `spinbutton`). Decided 2026-10-19 (header option 2) after VoiceOver read every header as "name, Column menu for name, N pixels, Resize column name".
- Menu button 24×24 px and resize hit area 24 px wide (HighTable: 20×20 and 8 px), see 2.5.8 above.
- Corner cell is a sortable "Row number" header that resets sorting (HighTable: empty cell with the hyparquet logo).
- Column menu has no sort item; sorting is done on the header only.

### Phase 6 – Search (D8)

- [x] `src/lib/search.ts`: normalise + parse query → predicate (`columns` it reads + `matches(row)`) for Domain and Columns mode, validation messages, `sameOptions`. Tests: every row of the 4.2 table, Columns mode (OR, substring), trailing dot, uppercase, empty, too short, empty parts, > 10 parts, labels missing in data, no column selected.
- [x] `src/lib/searchScan.ts`: `scanRows` reads only the needed label columns, one row group at a time (abort checked between row groups); `searchDataSet`, `searchAll` (progress callback). Tests vs. a brute-force filter of all rows on every sample file.
- [x] `src/lib/filteredDataFrame.ts` (fetches source rows in consecutive runs) + tests.
- [x] `src/lib/concatDataFrame.ts` (adds `File` column, forwards events of all parts) + tests.
- [x] `SearchBar`: `<form role="search">`, labelled `<input type="search">`, Search button, mode radio group, column checkboxes (`<fieldset>` + `<legend>`, only in Columns mode), Extended search checkbox, validation (`role="alert"`, `aria-invalid`, `aria-describedby`), "Choose at least one column" note (`role="status"`, before submit), "Options changed" note, result/progress status (`role="status"`). Component tests.
- [x] `SearchHelp`: (i) button (name "Help", 28×28 px) + modal dialog with the 4.2 help text.
- [x] Wire into `Page`/`App`: last submitted search in `App`, `createResource` for results, previous search aborted on submit/file change, file selector disabled while the Extended search checkbox is checked, view header shows "N of M rows" / "N rows from F files".
- [ ] Review the help text together with the client once search works; update 4.2 and `SearchHelp`.
- [x] Domain match choice (Include subdomains / Exact match) and leading `www.` ignored (2026-10-23): `search.ts` (`match` option, `sameOptions`), `SearchBar` Match radio group (both modes), `SearchHelp`, tests.
- [ ] Review with the client: in Extended search the Metadata/Layout/Grid lenses still show the selected file (the disabled file selector shows which).

Findings:

- Checked in the browser on the sample files: `office` → 2 of 66 rows; `microsoft.com` → 4 rows (incl. `microsoftonline`, substring on label1); Columns `label0` + `se` → 1 row; Extended → 1 row in 5 files with File column, file selector disabled. All search controls pass WCAG 2.5.8 (radios/checkboxes 13 px pass by spacing).

### Phase 7 – CI / deploy

- [x] Port `.github/workflows/deploy.yaml` from the original; only change: pnpm (`npm install -g pnpm@11.25.0`, `pnpm install --frozen-lockfile`, `pnpm run build`); Node 24.
- [x] Enable GitHub Pages in the repo (Settings → Pages → Source: GitHub Actions).
- [x] Add lint + test steps before build.
- [x] After build: fail if `dist/` contains React (grep for React's JSX-runtime marker `react.element` / `react.transitional.element`).

### Phase 8 – Verification & cleanup

- [x] Side-by-side check against the React app for every lens and every sample file (2026-10-19): view header, first 12 table rows, Metadata text, Layout text and Grid tooltips identical for all 5 files. One difference found and fixed: collapsed JSON previews showed fewer entries, because the toggle button sized to its content while the preview sizes itself to the button (`.json-toggle` now `width: 100%`). (The React app's dev server logs "Do not know how to serialize a BigInt" from React's dev profiler and sometimes ignores file changes; not our code.)
- [x] Large file (`pnpm generate:large`, 200,000 rows, 4 row groups of 50,000, 149 kB; dev server, Chrome): first rows 0.6 s after selecting the file; 32 rows in the DOM; scroll to middle 1.1 s and to the end 0.4 s until all cells loaded; first sort on `label1` 2.0 s (whole column read); JS heap 275 MB after scroll + sort.
- [x] Search on the large file: `office` → 8,724 rows in 49 ms. Extended search over all 6 files: 1.5 s with "Searching file N of 6…" progress. Two quick submits: the first is aborted, only the second result is shown, no error.
- [x] Accessibility, automated: `test/a11y.test.tsx` runs axe-core (WCAG 2.0–2.2 A/AA tags) on the Table (with data, column menu open), search (Columns mode, validation) and the Metadata/Layout/Grid lenses, plus a check that axe does report a planted violation. In the browser (with colour contrast and best-practice rules) the same states and an Extended search result have **0 violations** after these fixes:
  - `scrollable-region-focusable` (serious, 2.1.1): the Layout view and the Grid table wrapper scroll but had nothing focusable → `tabindex="0"`, `role="region"` and a name.
  - `empty-table-header`: the Row number header was named only by `aria-label` → visually hidden text.
  - `region`: the column menu portal was outside the `main` landmark → mounted inside it.
  - `aria-controls` pointed at a menu that does not exist while closed → only set while open.
  - Remaining "incomplete" (needs review): contrast of the sort arrows and the dropdown caret (non-text characters), and the help popover text (#222 on white, ≈ 16:1).
- [ ] Accessibility, manual: keyboard-only and VoiceOver walkthrough – checklist below, done by the client. First pass 2026-10-19; fixes below, retest pending.
- [x] Fixes after the first walkthrough (decided 2026-10-19):
  - Table focus follows any focused cell (VoiceOver, click), so arrow keys continue from there and the cell scrolls into view; before, a stale position made focus jump to another column.
  - One tab stop into the table: Tab goes straight to the active cell; the scroll area is a tab stop (group "Table") only while that cell is scrolled out of the DOM.
  - Header cells: name from `aria-label`, visible name `aria-hidden`, menu button named "Column menu", resize handle hidden (see Phase 5), so a header is read as "label0, Column menu" instead of repeating the name.
  - Rows named "Column headers" / "Row N" instead of their whole content (to be confirmed with VoiceOver).
  - Grid named "Table" / "Search results" instead of the file name.
  - Headers described by a hint (`aria-describedby`, now "Select to sort"); a polite status announces "Sorted by label1, ascending" / "Sorted by row number (file order)". The help dialog has a Table section on sorting.
  - Help: modal dialog with Close (see 4.2).
  - Search form order: mode → column checkboxes (directly after Columns) → Extended search → "Options changed" note below the options. No arrow keys between checkboxes (standard behaviour is one Tab stop each).
  - File selector moved out of the dark header to its own row above the search, with the visible label "Choose file".
  - Reflow (1.4.10): the page scrolls when the window is small or zoomed; table and views keep a minimum height of 12rem. Before, at 400 % the table got 0 px and nothing scrolled.
  - Not app issues: VoiceOver reading the whole page on load (VoiceOver Utility → Web setting); Safari reading a `<select>` as "value, label, pop-up button"; VO+arrows visiting a radio button and then its text.
- [x] Fixes after the second walkthrough (Chrome + VoiceOver, decided 2026-10-19):
  - "Options changed" is no longer a description of the Search button; it is read where it stands.
  - Help dialog: focus on the heading when opened, Close last.
  - Sort hint shortened to "Select to sort". "Column menu" stays in the header reading (client decision).
  - Scrolling a focused cell into view is done by hand (horizontal past the row numbers, vertical below the header) instead of `scrollIntoView`, and also when focus lands on a button inside a header. With "Synchronise keyboard focus and VoiceOver cursor" on (client's setting), VO+arrows move focus, so the table follows. Checked in Chrome: a header far right, a menu button in the last header and a data cell far down/right all scroll into view.
  - Short windows (height ≤ 40rem, e.g. 400 % zoom): the table and views get the full window height, so the page scrolls first and the table then fills the window. Normal window: no outer scrollbar (checked).
  - Column choice stays as checkboxes (client asked for what works best for mouse and screen-reader users): native, recognised by both, read as "label1, checkbox, checked"; one Tab stop each is the expected behaviour. A toolbar of toggle buttons was considered (one Tab stop, arrows) but looks and reads less like "choose several".
  - Tab ending at the last cell and moving on to the browser is expected (the table is the last focusable element).
- [x] Fixes after the third walkthrough (decided 2026-10-19):
  - Sorting added to the column menu (Sort ascending / Sort descending / Remove sort), because VO+arrows land on the menu button and never on the header cell; plain arrows + Enter on the header still sort.
  - The sort hint (`aria-describedby`) and the header tooltips (`title`, which screen readers also read as a description) were removed; how to sort is explained in the help dialog.
  - Help text read with VO+arrows only: expected VoiceOver behaviour (Tab reaches controls, VO+arrows read text); left as is.
- [x] Markup review after the Biome switch (D12, 2026-10-26), checked against ARIA in HTML and APG:
  - Table: removed `role="gridcell"` / `columnheader` / `rowheader` on `td`/`th` (implicit inside `<table role="grid">`, explicit is NOT RECOMMENDED) and `aria-readonly` (APG: grids without editing omit it). CSS uses `th[scope="row"]`.
  - Layout view and Grid table wrapper: `<div role="region">` → `<section>` with a name (same region landmark, native element); `tabindex="0"` kept (WCAG 2.1.1).
  - Search: `<form role="search">` → `<search aria-label="Search"><form>` (MDN: Baseline, Chrome/Firefox 118, Safari 17).
  - Help dialog: explicit Escape handler (native Esc already closed it).
  - Tests query `td` and `<search>` directly: Testing Library's aria-query 5.3.0 lacks these implicit roles.
- [ ] VoiceOver re-check after the markup review: table (cells, headers, row numbers), search landmark (VO+U), Layout and Grid views.
- [x] Update `README.md` (pnpm commands, Solid, features, data, deployment).
- ResizeObserver "loop completed with undelivered notifications" (seen once on 2026-10-16) was not reproduced on 2026-10-19 while switching lenses and resizing. Per [MDN](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver#observation_errors) it means a resize was deferred to the next frame; it is harmless unless it repeats. Likely source: the JSON preview feedback loop fixed above.

#### Manual checklist (keyboard + VoiceOver, Safari on macOS)

Turn on VoiceOver with Cmd+F5. VO = Ctrl+Option. Use Tab/Shift+Tab for keyboard-only, VO+arrows to read.

1. **Start**: page title "DNS Tapir hyparquet" is read; VO+U (rotor) lists the heading "DNS Tapir", the landmarks main and search.

2. **File selector**: Tab reaches "Choose file, pop-up button" (now below the dark header, above the search); changing file does not move focus; the table shows the new file.

3. **Search form**: Tab order is search field → Search → Help → Domain/Columns → (label0–label9 in Columns mode) → Extended search. Each is read with its label.

- OK

4. **Validation**: type `a`, Enter → "Enter at least 2 characters." is announced; the field is read as invalid.

- OK

5. **Columns**: choose Columns → the label0–label9 checkboxes appear in a group "Columns"; uncheck label1 → "Choose at least one column to search." is announced.

- OK

6. **Options changed**: tick Extended search → the file selector becomes dimmed/unavailable; "Options changed – press Search to update." appears below the options; on the Search button VoiceOver reads it.

- OK

7. **Result**: search `office` → "2 matching rows" (or similar) is announced without moving focus.
   OK

8. **Help**: activate "Help" → a dialog "Help" opens with focus on Close; Tab stays inside the dialog; the text (incl. the Table section on sorting) can be read with VO+arrows; Esc or Close closes it and focus returns to the Help button.

- fokus på Help rubrik
- för att få texten uppläst fungerar enbart ctrl+option+pil. inte bara pil eller bara tab. med tab hamnar fokus på close ( vilket är logiskt om pilarna hade fungerat)

9. **Table, entering**: Tab from the View button goes straight to a cell (first time: "Row number"); VoiceOver reads "Table" (not the file name); arrows move cell by cell; a header is read once, e.g. "label0, Column menu", without an extra hint; rows are read as "Row N", not their whole content. Tab from a cell leaves the table (grids use arrows inside, Tab to move on).

- ctrl +option + pil ger fokus på column menu, kommer inte åt sortering
- pilr ger fokus på rubrik och sortering, kommer inte åt column menu

10. **Table, keys**: Home/End, Ctrl+Home/End, PageUp/PageDown move as expected; the focused cell is always visible, also after moving with VO+arrows.

- OK

11. **Sorting**: Enter (or VO+Space) on a header sorts; with VO+arrows use Column menu → Sort ascending / Sort descending / Remove sort (the current choice is read as checked); VoiceOver announces "Sorted by label1, ascending"; Enter on "Row number" announces "Sorted by row number (file order)".

- OK

12. **Column menu**: from a focused header, Tab to "Column menu", Enter opens it; arrows move between items; Esc closes it and returns focus.

- OK

13. **Resize**: in the column menu, Wider / Narrower change the width by 50 px, Fit to content restores the automatic width; focus returns to the menu button. With the mouse, dragging the header edge still works.

- OK

14. **Lenses**: the "View: …" button opens the lens menu; Metadata: JSON toggles are read as buttons with expanded/collapsed; Layout and Grid: the scroll areas can be focused and scrolled with arrows; Grid: "Show as table" opens a table with caption and headers.

- OK

15. **Zoom**: at 200 % browser zoom (Cmd+plus) nothing overlaps and no text is cut off (WCAG 1.4.4); at 400 % / 320 px wide the content reflows and the page scrolls (1.4.10) – note what does not.

- OK

16. **Focus visibility**: on every step above the focused element has a clearly visible outline.
    Note failures with step number, browser and what VoiceOver said.

- OK

### Open decisions – after Phase 8

Need a decision from the client; implement together with any changes that come out of Phase 8.

- [x] **WCAG 2.5.7 Dragging Movements** – decided 2026-10-19: column menu items Wider / Narrower (±50 px) and Fit to content; the drag handle is pointer-only.
- [ ] **Search time span** (requested 2026-10-19, deferred until the shape of real files is known). Facts from the sample files: `start_time` is `TIMESTAMP_MICROS`, `isAdjustedToUTC: true`, and **each file holds a single value** (e.g. `2026-04-15T09:19:00.851Z`), so a span would select whole files. To decide: do real files hold several `start_time` values; input in UTC or local time; inclusive bounds and optional start/end; may a span alone (no query) be searched, which would change the 2-character rule. Row group min/max statistics can skip files/row groups outside the span without reading them.
- [ ] **Secondary sort keys** (found in Phase 8; client decision 2026-10-19: leave as is for now – the secondary order is not clear visually either, so it is a general design question rather than a screen-reader one. Known possible non-conformance; revisit together with the other open decisions): with a multi-column sort, the 2nd, 3rd … sort columns show their arrow in `#bbb` (≈ 1.7:1 on `#f0f0f0`) and differ from the primary column only by colour; screen readers get `aria-sort` on the primary column only, so the secondary order is not exposed at all. Possible conflicts: WCAG 1.4.1 Use of Color, 1.4.11 Non-text Contrast, 1.3.1 Info and Relationships. Options: (a) show the sort position (1, 2, …) next to the arrow with ≥ 3:1 contrast and add it to the header's description (e.g. "sorted 2nd, ascending"); (b) darker arrows for all sorted columns plus (a); (c) leave as is (HighTable behaviour). The unsorted ⇅ marks are decorative and can stay light.

## 7. Risks / open questions

- Range requests: verified on the Vite dev server and GitHub Pages (SVG). Parquet on Pages to be confirmed after the Phase 3 deploy; fallback (whole file) exists.
- Cell cache in `parquetDataFrame` is never evicted (same as the original); scrolling through a very large file eventually holds all fetched cells in memory.
- `sortableDataFrame` sorts by fetching whole columns; on very large files the first sort is expensive – acceptable or needs worker?
- D11 decided 2026-10-26 (external URL). The server (S3 + CloudFront) sends `Access-Control-Allow-Origin: *` and supports ranges, but does not expose `Content-Range` (not CORS-safelisted), so the former range probe in `source.ts` failed (`missing Content-Range`). Chosen: file size from HEAD `Content-Length` via `asyncBufferFromUrl({ url })` in `loadDataSet`; `source.ts` removed. CloudFront does not compress parquet (verified with `curl`). Risk: if the server starts compressing parquet, HEAD returns the compressed size and hyparquet fails with `footer != PAR1`.
- Not planned (not used by the current app): HighTable cell double-click handler. Add only on request.
- TypeScript is held at 6.x: `typescript-eslint` 8.71.2 requires `typescript <6.1.0` (npm registry). Revisit when typescript-eslint supports TS 7.
