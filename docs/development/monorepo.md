# Monorepo

Nookly is a [Turborepo](https://turborepo.com) workspace managed with Bun.

| Path                | Package            | Contents                                                                                                  |
| ------------------- | ------------------ | --------------------------------------------------------------------------------------------------------- |
| `apps/desktop`      | `@nookly/desktop`  | The Tauri app: `src-tauri/` (Rust), `index.html`, `vite.config.ts` and the `src/main.tsx` bootstrap.      |
| `packages/ui`       | `@nookly/ui`       | The design system: primitives in `src/components/`, tokens and theme in `src/styles.css`, fonts, `cn`.    |
| `packages/frontend` | `@nookly/frontend` | Every other component, feature, hook, store and API client. Shared by the desktop app and any future app. |
| `packages/config`   | `@nookly/config`   | Shared config: oxlint rules and the anti slop plugin, oxfmt options, TypeScript bases.                    |
| `tools/`            |                    | Repo scripts (version check and bump).                                                                    |

## Where code goes

- A new primitive goes in `packages/ui`. It may only import from `@nookly/ui` and npm packages, never from `@nookly/frontend`.
- Everything else goes in `packages/frontend`.
- `apps/desktop` holds only what is specific to the desktop shell.

## Imports

| From                  | Write                                                      |
| --------------------- | ---------------------------------------------------------- |
| a primitive           | `@nookly/ui/components/button`                             |
| `cn`                  | `@nookly/ui/lib/utils`                                     |
| inside frontend       | `#/lib/api/tasks.ts` (extension required)                  |
| frontend, from an app | `@nookly/frontend/app`, `@nookly/frontend/lib/preferences` |

`#/` is a Node subpath import declared in `packages/frontend/package.json`, so it resolves the same in every app that bundles the frontend. Each package's `exports` field lists what other packages may import.

## Commands

Run from the repo root.

| Command                          | Does                                                     |
| -------------------------------- | -------------------------------------------------------- |
| `bun run dev`                    | Starts the desktop app (`tauri dev`).                    |
| `bun run tauri build`            | Builds the installers.                                   |
| `bun run build`                  | Typechecks and builds the frontend bundle via Turborepo. |
| `bun run check`                  | TypeScript and `cargo check`.                            |
| `bun run lint`, `bun run format` | oxlint, oxfmt, clippy and rustfmt.                       |

## Config

- **oxlint:** rules live in `packages/config/oxlint/base.json`. The root `.oxlintrc.json` and one `.oxlintrc.json` per package extend it; oxlint picks the nearest one per file. `extends` does not carry over `plugins` or `ignorePatterns`, so each package config repeats `plugins`, and ignores live in the root config. `better-tailwindcss.entryPoint` is relative to the repo root.
- **oxfmt:** options live in `packages/config/oxfmt.json`. The root `oxfmt.config.ts` loads them.
- **TypeScript:** packages extend `@nookly/config/typescript/react.json`. Vite configs use `node.json`.
- **Tailwind:** each package's stylesheet declares `@source "./"`. Tailwind does not scan workspace packages on its own.
- **Vite:** the desktop scripts pass `--configLoader runner` so `vite.config.ts` can import TypeScript from `@nookly/frontend/vite`.
