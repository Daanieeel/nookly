# Monorepo

Nookly is a [Turborepo](https://turborepo.com) workspace managed with Bun.

| Path                | Package            | Contents                                                                                                                                |
| ------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop`      | `@nookly/desktop`  | The Tauri app: `src-tauri/` (Rust), `index.html`, `vite.config.ts` and the `src/main.tsx` bootstrap.                                    |
| `apps/server`       | `@nookly/server`   | The optional sync server: Bun, Elysia, Postgres. See [server](server.md).                                                               |
| `apps/mobile`       | `@nookly/mobile`   | The phone app: Expo, Expo Router, `expo-sqlite`. See its README.                                                                        |
| `packages/ui`       | `@nookly/ui`       | The design system: primitives in `src/components/`, tokens and theme in `src/styles.css`, fonts, `cn`.                                  |
| `packages/frontend` | `@nookly/frontend` | Every other component, feature, hook, store and API client. Shared by the desktop app and any future app.                               |
| `packages/shared`   | `@nookly/shared`   | What every client and the server agree on: the exported desktop schema, the sync engine and protocol, the API client. No React, no DOM. |
| `packages/config`   | `@nookly/config`   | Shared config: oxlint rules and the anti slop plugin, oxfmt options, TypeScript bases.                                                  |
| `tools/`            |                    | Repo scripts (version check and bump).                                                                                                  |

## Where code goes

- A new primitive goes in `packages/ui`. It may only import from `@nookly/ui` and npm packages, never from `@nookly/frontend`.
- Logic, types and schemas the server, the desktop and the mobile app all need go in `packages/shared`. It imports nothing from the other packages.
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

| Command                          | Does                                                               |
| -------------------------------- | ------------------------------------------------------------------ |
| `bun run dev`                    | Starts the sync server, the desktop app and the mobile app (Expo). |
| `bun run dev:desktop`            | Starts the sync server and the desktop app.                        |
| `bun run dev:mobile`             | Starts the sync server and the mobile app.                         |
| `bun run dev:server`             | Starts the sync server alone.                                      |
| `bun run tauri build`            | Builds the installers.                                             |
| `bun run build`                  | Typechecks and builds the frontend bundle via Turborepo.           |
| `bun run check`                  | TypeScript and `cargo check`.                                      |
| `bun run lint`, `bun run format` | oxlint, oxfmt, clippy and rustfmt.                                 |

The sync server needs Postgres: `DATABASE_URL` when set, else a local cluster in `.dev/postgres` (gitignored) when Postgres is installed, else the one in `apps/server/docker-compose.yml` when Docker runs. Without any, the server is skipped. The server listens on `http://localhost:3000` (`http://10.0.2.2:3000` from the Android emulator) and prints emails to its log. The mobile app keeps the keyboard, so Expo's keys work (`i` opens the iOS simulator).

`bun run dev` and any debug build (`cargo run`, `cargo test`) never touch the real app's data: they read and write `apps/desktop/src-tauri/.dev-data/` instead, a gitignored folder created on first run. Set `NOOKLY_DATA_DIR` to point either one at a specific folder instead (CI, scripted testing, a scratch profile). Only a release build (`bun run tauri build`, or the installed app) uses the real one. See `db::resolve_app_data_dir`.

## Config

- **oxlint:** rules live in `packages/config/oxlint/base.json`. The root `.oxlintrc.json` and one `.oxlintrc.json` per package extend it; oxlint picks the nearest one per file. `extends` does not carry over `plugins` or `ignorePatterns`, so each package config repeats `plugins`, and ignores live in the root config. `better-tailwindcss.entryPoint` is relative to the repo root.
- **oxfmt:** options live in `packages/config/oxfmt.json`. The root `oxfmt.config.ts` loads them.
- **TypeScript:** packages extend `@nookly/config/typescript/react.json`. Vite configs use `node.json`.
- **Tailwind:** each package's stylesheet declares `@source "./"`. Tailwind does not scan workspace packages on its own.
- **Vite:** the desktop scripts pass `--configLoader runner` so `vite.config.ts` can import TypeScript from `@nookly/frontend/vite`.
