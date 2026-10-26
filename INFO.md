# DNS Tapir parquet viewer (Solid)

Browser viewer for DNS Tapir parquet files, built with [SolidJS](https://www.solidjs.com/) and [hyparquet](https://github.com/hyparam/hyparquet). It replaces the React app `tapir-hyparquet`.


## Features
- **Table**: virtualized, lazily loaded grid (only visible rows are rendered; row groups are read on demand with HTTP range requests). Sort by clicking a header (multi-column; the *Row number* header resets to file order), hide/show and resize columns (widths are remembered per file), keyboard navigation, copy a cell with Ctrl/Cmd+C.
- **Search**: *Domain* mode follows the DNS structure (`svt`, `svt.se`, `www.svt.se`); *Columns* mode searches the chosen `label0`–`label9` columns. *Extended search* searches all files. Options take effect when you press Search or Enter. The (i) button explains the rules.
- **Metadata**, **Layout** and **Grid** views of the parquet file structure.
- Built to WCAG 2.2 AA (EU accessibility requirements, EN 301 549); see `PLAN.md` section 4.3.

## Requirements

- Node.js 24
- pnpm 11 (`npm install -g pnpm@11`)

## Commands

```bash
pnpm install          # install dependencies (CI uses --frozen-lockfile)
pnpm dev              # development server, http://localhost:5173
pnpm lint             # Biome lint
pnpm lint:fix                 # Biome lint safe fixes
pnpm format           # Biome format + organize imports (CI fails on unformatted code)
pnpm typecheck        # TypeScript
pnpm test             # Vitest (unit, component and axe-core accessibility tests)
pnpm build            # type check + production build into dist/
pnpm preview          # serve dist/ locally
pnpm generate:large   # write a large test file (200,000 rows) to src/parquets/, see below
```

## Data

The app loads the file list (`index.json`) and the parquet files from `https://public.test.dnstapir.se/parquet-samples/`. All file access goes through `src/lib/dataset.ts`. The files in `src/parquets/` are only used by the tests.

`pnpm generate:large [rows]` creates `src/parquets/large-<rows>.parquet` from the sample rows, for testing large files locally. It is gitignored and not used by the tests, so CI never builds or deploys it; a local `pnpm build` does include it while the file exists.

## Deployment

Before you push - run `pnpm format` to format nes code and `pnpm lint` to check that lint-rules are applied. if neccesary run `pnpm lin:fix`to fix lint problems.
Every push runs `.github/workflows/check.yaml` (`biome ci`: lint + format check). Pushing to `main` also runs `.github/workflows/deploy.yaml`: install, `biome ci`, test, build, check that `dist/` contains no React, and deploy `dist/` to GitHub Pages. The build uses relative paths (`base: './'`), so it works from any sub-path or static host.

## Project docs

- `PLAN.md` – migration plan, decisions, phases and findings
- `AGENTS.md` – conventions for contributors and coding agents

## License

MIT, see `LICENSE`. Parts of the table and JSON viewer are ported from [HighTable](https://github.com/hyparam/hightable) and [hyperparam](https://github.com/hyparam/hyperparam-cli) (MIT).
