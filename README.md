# DNS Tapir parquet viewer (Solid)

Browser viewer for DNS Tapir parquet files, built with [SolidJS](https://www.solidjs.com/) and [hyparquet](https://github.com/hyparam/hyparquet). It replaces the React app `tapir-hyparquet`; no React is shipped (CI checks the build).

Live: https://little-mry.github.io/tapir-hyparquet-parser/

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
pnpm lint             # ESLint
pnpm typecheck        # TypeScript
pnpm test             # Vitest (unit, component and axe-core accessibility tests)
pnpm build            # type check + production build into dist/
pnpm preview          # serve dist/ locally
pnpm generate:large   # write a large test file (200,000 rows) to src/parquets/, see below
```

## Data

The parquet files in `src/parquets/` are bundled with the app. All file access goes through `src/lib/dataset.ts` and `src/lib/source.ts`, so the data source can be changed later.

`pnpm generate:large [rows]` creates `src/parquets/large-<rows>.parquet` from the sample rows, for testing large files locally. It is gitignored and not used by the tests, so CI never builds or deploys it; a local `pnpm build` does include it while the file exists.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yaml`: install, lint, test, build, check that `dist/` contains no React, and deploy `dist/` to GitHub Pages. The build uses relative paths (`base: './'`), so it works from any sub-path or static host.

## Project docs

- `PLAN.md` – migration plan, decisions, phases and findings
- `AGENTS.md` – conventions for contributors and coding agents

## License

MIT, see `LICENSE`. Parts of the table and JSON viewer are ported from [HighTable](https://github.com/hyparam/hightable) and [hyperparam](https://github.com/hyparam/hyperparam-cli) (MIT).
