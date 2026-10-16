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
pnpm lint        # eslint
pnpm test        # vitest run
pnpm typecheck   # tsc --noEmit
```

Run `pnpm lint`, `pnpm typecheck` and `pnpm test` before considering a task done.

## Hard rules

- **No React.** Do not add `react`, `react-dom`, or any package that depends on them.
- **No `hyperparam` package.** Its JS bundle imports React. Reimplement what is needed in `src/components/` or `src/lib/`.
- **`hightable` only via `hightable/dataframe`.** Never import from `'hightable'` (root), which contains the React components.
- **Dependency versions**: caret ranges in `package.json`; always commit `pnpm-lock.yaml`.
- **Keep `autoInstallPeers: false`** in `pnpm-workspace.yaml`; otherwise pnpm installs `hightable`'s React peers.
- **TypeScript stays on 6.x** until `typescript-eslint` supports 7.
- **All UI text in English.**
- **Accessibility is a legal requirement** (EU: EN 301 549 / WCAG 2.1 AA; build to WCAG 2.2 AA). Follow PLAN.md section 4.3 for every component.
- **All parquet file access goes through `src/lib/dataset.ts` / `src/lib/source.ts`** (data source may move from bundled files to an external URL).

## Architecture (target)

```
src/
  index.tsx            # render(() => <App/>, #app)
  App.tsx              # dataset list + selected dataset resource
  Layout.tsx           # title, content wrapper, ErrorBar
  Page.tsx             # header, file select, lens switch
  components/          # Dropdown, ErrorBar, Json (Solid replacements for hyperparam)
  lenses/              # ParquetMetadata, ParquetLayout, ParquetGrid
  table/               # virtualized sortable table (@tanstack/solid-virtual)
  search/              # SearchBar, SearchHelp
  lib/                 # pure TS: format, layout, grid, source, dataset, parquetDataFrame,
                       #          search, searchScan, filteredDataFrame, concatDataFrame
  parquets/            # bundled sample .parquet files
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

Match the original ESLint config (ported to `eslint.config.js`):

- TypeScript strict; typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`.
- 2-space indent, single quotes, **no semicolons**, trailing commas on multiline, newline at EOF, no trailing spaces, max 1 empty line.
- `func-style: declaration` – use `function` declarations for top-level functions and components.
- `object-curly-spacing: always`, `eqeqeq`, `prefer-const`, sorted import members.
- Comments only where code cannot explain itself; one short line.

## Testing

- Vitest, tests in `test/*.test.ts`, environment `node` (set in `vite.config.ts`). Unit-test everything in `src/lib/` using the sample files in `src/parquets/`.
- `test/samples.ts` (`loadSamples()`) reads the sample files' metadata from disk. Number formatting with `toLocaleString` is locale-dependent; build expected strings with `toLocaleString()` in tests.
- Search: one test per row of the PLAN.md 4.2 example table, plus edge cases.
- Component tests (optional) with `@solidjs/testing-library`; accessibility checks with `axe-core`.

## Deployment

GitHub Pages via `.github/workflows/deploy.yaml` (pnpm, Node 24). Vite `base: './'` must stay so the app works from a sub-path.
