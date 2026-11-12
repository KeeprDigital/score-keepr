# score-keepr

Tournament engines: one decides who plays whom, one works out the standings. Both are pure functions with no runtime dependencies outside this repository.

## Layout

| Path | What |
|---|---|
| `packages/pairing` | Pairing Engine: Swiss, Single Elimination, checking hand-made Pairings. |
| `packages/standings` | Standings Engine: Standings and Final Placings. |
| `packages/shared` | Types, the seeded-random routine and mapping functions both engines use. |
| `packages/testkit` | Test helpers: scenario files with recorded answers. Never published. |
| `packages/integration` | Whole events played through both engines. Never published. |
| `packages/*/RULES.md` | The exact rules each engine follows. |
| `tooling/` | Shared pieces of build and lint config, imported by the `vite.config.ts` files. |
| `.vscode/` | Editor settings so format-on-save uses the root config. |
| `docs/spec.md` | Pairing Engine spec. |
| `docs/standings-spec.md` | Standings Engine spec. |
| `docs/tournament-spec.md` | Tournament Engine spec. Designed, not built. |
| `docs/adr/` | Decision records. |
| `GLOSSARY.md` | The project's vocabulary. Use these words. |
| `prototype-matcher/` | Throwaway prototype of the matcher. Not part of the build. |

Both engines are built. `docs/spec.md` and `docs/standings-spec.md` say what is measured and what is not. A third, the Tournament Engine, is designed in `docs/tournament-spec.md` and not yet built: it turns the record of a tournament into its current state and calls the other two.

## Commands

Needs pnpm and Node 22.18+, 24.11+ or 26+.

```
pnpm install
pnpm verify       # format, lint and type checks, then tests, then build
pnpm check        # format, lint and type checks only
pnpm fix          # apply formatting and lint fixes
pnpm test
pnpm test:watch
pnpm test:record  # re-record scenario answers after an intended change
pnpm build
pnpm bench 10001 15 --check   # time a simulated event
```

CI runs `verify` on Node 22, 24 and 26, and the benchmark with `--check`, on every push to `main` and every pull request (`.github/workflows/ci.yml`).

All tooling is Vite+ (`vp`): Oxfmt, Oxlint with type checks, Vitest, and `vp pack` for builds, run across packages by `vp run`. Lint, format and test settings live in the root `vite.config.ts`; each package has its own for `pack`. Tests import from `vite-plus/test`.

## Rules the setup enforces

- `pairing` and `standings` each depend on `shared` only. Importing one from the other does not resolve.
- Source is compiled against the language library alone. `console`, `fetch`, `process` and the DOM do not typecheck, so engine code cannot do I/O by accident.
- Every export in a package states its types in full (isolated declarations). The build fails otherwise, and the check flags exported functions that leave them out. Type files are then written without TypeScript doing any inference.
- Inside the workspace, packages are consumed as TypeScript source. `publishConfig` switches them to `dist` when published.
