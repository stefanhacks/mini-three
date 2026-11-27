# WoW: Hantō

Personal assistant for the WoW: Forever profession system, tuned for a specific character. Built with Vite, TypeScript and Pixi.js, with, and largely to explore, Claude AI.

## Requirements

Node 22 (see `.nvmrc`).

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run data` | Regenerates `src/data/*.json`, see [docs/DATA.md](docs/DATA.md) |
| `npm run build` | Production build into `dist` |
| `npm run preview` | Serve the `dist` build locally |
| `npm run typecheck` | `tsc` |
| `npm run lint` | ESLint |
| `npm run test` | All Vitest tests |
| `npm run test:fast` | Vitest, skipping tests tagged `@slow` |
| `npm run check` | Typecheck, lint, fast tests and build, in that order |

## Deploys

Netlify builds `main` and every PR (`netlify.toml`). Branch deploys are off, so a branch gets a preview only through its PR:

- Production (`main`): https://zus-hantou.netlify.app
- PR preview: `https://deploy-preview-<pr-number>--zus-hantou.netlify.app`

## License

[Unlicense](LICENSE) (public domain).
