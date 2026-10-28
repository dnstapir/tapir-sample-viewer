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
```

## Data

The app loads the file list (`index.json`) and the parquet files from `https://public.test.dnstapir.se/parquet-samples/`. All file access goes through `src/lib/dataset.ts`. The files in `src/parquets/` are only used by the tests.

The parquet files must be compressed with **SNAPPY** (the default of pyarrow / Apache Arrow) or be uncompressed. The app uses hyparquet's built-in decoder; other codecs (ZSTD, GZIP, Brotli, LZ4) are not supported and such a file fails to load with "parquet unsupported compression codec".

## Deployment

Before you push - run `pnpm format` to format nes code and `pnpm lint` to check that lint-rules are applied. if neccesary run `pnpm lin:fix`to fix lint problems.
Every push and every pull request to `main` runs `.github/workflows/check.yaml`: `pnpm audit --prod` (fails on known vulnerabilities in the app's dependencies) and `pnpm audit --dev` (warning only), `biome ci` (lint + format check), typecheck and tests. The check is not required for merging; workflow runs from forks need maintainer approval. Pushing to `main` also runs `.github/workflows/deploy.yaml` in three jobs: `test` (install, `biome ci`, tests), `build` (install, build, check that `dist/` contains no React, upload) and `deploy` (publish `dist/` to GitHub Pages). Test tooling never runs in the job that builds the published files. The build uses relative paths (`base: './'`), so it works from any sub-path or static host.

## Project docs

- `PLAN.md` – migration plan, decisions, phases and findings
- `AGENTS.md` – conventions for contributors and coding agents

## License

MIT, see `LICENSE`. Parts of the table and JSON viewer are ported from [HighTable](https://github.com/hyparam/hightable) and [hyperparam](https://github.com/hyparam/hyperparam-cli) (MIT).
