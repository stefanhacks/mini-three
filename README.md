# WoW: Hantō

Browser game client built with Vite, TypeScript and Pixi.js (the only runtime dependency).

## Requirements

Node 22 (see `.nvmrc`).

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build into `dist` |
| `npm run preview` | Serve the `dist` build locally |
| `npm run typecheck` | `tsc` |
| `npm run lint` | ESLint |
| `npm run test` | All Vitest tests |
| `npm run test:fast` | Vitest, skipping tests tagged `@slow` |
| `npm run check` | Typecheck, lint, fast tests and build, in that order |

## Deploys

Netlify builds `main` and every PR (`netlify.toml`). Branch deploys are off, so a branch gets a preview only through its PR:

- Production (`main`): https://mini-three.netlify.app
- PR preview: `https://deploy-preview-<pr-number>--mini-three.netlify.app`

## License

[Unlicense](LICENSE) (public domain).
