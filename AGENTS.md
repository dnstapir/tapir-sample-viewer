# AGENTS.md

Guidance for AI coding agents working in `tapir-hyparquet-solid`.

## Project

DNS Tapir parquet viewer built with **SolidJS** + **hyparquet**. It is a port of the React app in `../tapir-hyparquet/`.

- Migration plan and progress: [PLAN.md](PLAN.md). Read it before starting work; tick checkboxes and update decision status when work is done.
- `../tapir-hyparquet/` is the **read-only reference implementation**. Never modify it.

## Working agreement

These project rules refine the user's global instructions.

- **Code changes are allowed in this project without asking first.** This overrides the global "only edit when explicitly requested" rule for this repository only.
- **Every change must be explained: why** (which plan item / decision / bug) **and how** (what was changed, in which files). Keep it short and concrete.
- **Ask before** destructive or hard-to-reverse actions: deleting or moving files, git history operations, pushing.
- **Ask** when a requirement is unclear or a new decision is needed; record the answer in PLAN.md (decision table or open questions). Do not guess.
- When the user is exploring options, present options with trade-offs; do not implement.
- Cite sources (docs, npm registry, file paths) for factual claims; verify versions/APIs instead of relying on memory.
- No first-person self-reference in responses; state results directly.
- Respond in the user's language (Swedish). Code, comments, docs and UI text are in English.

## Commands (pnpm)

```bash
pnpm install
pnpm dev         # Vite dev server
pnpm build       # typecheck + production build to dist/
pnpm preview     # serve dist/
pnpm lint        # biome lint
pnpm format      # biome: format + organize imports (writes files)
pnpm test        # vitest run
pnpm typecheck   # tsc --noEmit
pnpm generate:large [rows]  # gitignored large test file in src/parquets/ (excluded from tests)
```

Run `pnpm format`, `pnpm lint`, `pnpm typecheck` and `pnpm test` before considering a task done. CI runs `biome ci` (lint + format check) on every push and fails on unformatted code.

## Hard rules

- **No React.** Do not add `react`, `react-dom`, or any package that depends on them.
- **No `hyperparam` package.** Its JS bundle imports React. Reimplement what is needed in `src/components/` or `src/lib/`.
- **`hightable` only via `hightable/dataframe`.** Never import from `'hightable'` (root), which contains the React components.
- **Dependency versions**: caret ranges in `package.json`; always commit `pnpm-lock.yaml`.
- **Keep `autoInstallPeers: false`** in `pnpm-workspace.yaml`; otherwise pnpm installs `hightable`'s React peers.
- **TypeScript 7** upgrade is a separate step after the Biome switch (PLAN.md D13).
- **All UI text in English.**
- **Accessibility is a legal requirement** (EU: EN 301 549 / WCAG 2.1 AA; build to WCAG 2.2 AA). Follow PLAN.md section 4.3 for every component.
- **All parquet file access goes through `src/lib/dataset.ts`** (`index.json` and files from `https://public.test.dnstapir.se/parquet-samples/`, PLAN.md D11).

## Architecture (target)

```
src/
  index.tsx            # render(() => <App/>, #app)
  App.tsx              # dataset list, selected dataset, submitted search + result resources
  Layout.tsx           # title, content wrapper, ErrorBar
  Page.tsx             # header, file select, search bar, lens switch
  components/          # Dropdown, ErrorBar, Json (Solid replacements for hyperparam)
  lenses/              # ParquetMetadata, ParquetLayout, ParquetGrid
  table/               # virtualized sortable data grid (own windowing, see src/lib/viewport.ts)
  search/              # SearchBar, SearchHelp
  lib/                 # pure TS: format, layout, grid, dataset, parquetDataFrame,
                       #          search, searchScan, filteredDataFrame, concatDataFrame, abort
  parquets/            # sample .parquet files for tests (the app loads files from the server)
public/                # TAPIR logos
test/                  # vitest
```

- Keep parquet/byte-layout logic in `src/lib/` as pure functions with unit tests; components only render.
- Data access goes through the `DataFrame` contract from `hightable/dataframe` (`getCell`, `getRowNumber`, `fetch`, `eventTarget` `resolve` events), wrapped by `sortableDataFrame`.
- Read row data lazily (per row-group chunk); never decode a whole large file up front.
- Pass `compressors` from `hyparquet-compressors` to hyparquet read calls.

## SolidJS conventions

- Components run **once**. Use `createSignal`, `createMemo`, `createResource`, `createEffect`, `onMount`, `onCleanup`.
- **Do not destructure props** (breaks reactivity). Use `props.x`, or `splitProps` / `mergeProps`.
- Use control-flow components: `<Show>`, `<For>` (keyed by reference), `<Index>` (keyed by index), `<Switch>/<Match>`, `<Dynamic>`. No `.map()` in JSX for reactive lists, no `key` prop.
- Use `class` / `classList`, not `className`. `style` objects use CSS property names (`'grid-template-columns'`).
- `onChange` is the native `change` event; use `onInput` for per-keystroke updates.
- Use `ErrorBoundary` for render errors; surface async errors (`createResource` `.error`) in `ErrorBar`.
- Clean up subscriptions (`eventTarget` listeners, `AbortController`) in `onCleanup`.

## Data handling

- hyparquet returns `bigint` for INT64 and `Date` for TIMESTAMP. Never `JSON.stringify` metadata or rows directly; use hyparquet `toJson` or a BigInt-safe formatter in `src/lib/format.ts`.
- Use `Number()` on `bigint` sizes/offsets only for display or arithmetic known to stay below `Number.MAX_SAFE_INTEGER`.
- Domain labels are stored reversed (`label0` = TLD, `label1` = name, `label2`+ = subdomains). Search rules are specified in PLAN.md 4.2; do not change them without a recorded decision.

## Code style

Biome (`biome.json`, PLAN.md D12) lints and formats `.ts`, `.tsx`, `.js`, `.json` and `.css`; Markdown, YAML and `public/` are excluded.

- Formatting is Biome's job: 2-space indent, line width 120, single quotes (double in JSX), **no semicolons**, trailing commas, arrow parentheses only when needed. Run `pnpm format`; do not hand-format.
- Linting: Biome `recommended` preset plus the Solid domain (`noSolidDestructuredProps`, `useSolidForComponent`).
- TypeScript strict (`tsconfig.json`).
- Use `function` declarations for top-level functions and components. Arrow functions are allowed for Solid derived signals (`const visible = () => …`).
- Refs: use callback refs (`ref={el => { button = el }}`).
- Comments only where code cannot explain itself; one short line.

## Testing

- Vitest, tests in `test/*.test.ts`, environment `node` (set in `vite.config.ts`). Unit-test everything in `src/lib/` using the sample files in `src/parquets/`.
- `test/samples.ts` (`loadSamples()`) reads the sample files' metadata from disk. It copies bytes into the current realm's `ArrayBuffer`, because under jsdom hyparquet's `instanceof ArrayBuffer` check rejects Node's buffers. Number formatting with `toLocaleString` is locale-dependent; build expected strings with `toLocaleString()` in tests.
- Search: one test per row of the PLAN.md 4.2 example table, plus edge cases.
- Component tests: `test/*.test.tsx` with `@solidjs/testing-library`; put `// @vitest-environment jsdom` on the first line. Query by role and accessible name. `test/a11y.test.tsx` runs axe-core on the main UI states; add new states there. Colour contrast and scrollable-region rules need a real browser: also run axe in the browser (inject `node_modules/axe-core/axe.min.js`) after UI changes.
- Avoid test file names that differ only in case (`Json.test.tsx` vs `json.test.ts`); macOS is case-insensitive and the TypeScript project service rejects the pair.

## Deployment

GitHub Pages via `.github/workflows/deploy.yaml` (pnpm, Node 24). Vite `base: './'` must stay so the app works from a sub-path.
