# Implementation state: sync backend and mobile app

Branch `mobile-app-and-backend`, branched from `feat/split-view-tabs` (split view, 0.34.0). Never merged into `main`; commit and push here, no PRs. The brief is `PROMPT.md` (local, gitignored), Part 2.

Read this first when continuing. Keep it current with every commit.

## Order (user's instruction)

1. Backend (`apps/server`)
2. Desktop integration with the backend
3. Mobile app (`apps/mobile`)

## Architecture in one screen

- `packages/shared`: everything clients and server agree on.
  - `generated/desktop-schema.json`: written by a Rust snapshot test from the desktop's migrated schema and registries (synced tables, columns, entity schemas, relationship types). `NOOKLY_UPDATE_SNAPSHOTS=1 cargo test --lib sync::` regenerates it.
  - `sync/`: HLC, record merge (per field or per record LWW with tombstone clock), protocol schemas (zod), the sync engine (collect, push, pull, apply) and the SQLite storage it runs on, over a tiny `SqlDriver`.
- Desktop: SQLite triggers mark changed rows dirty while sync is on; a Tauri command runs the engine's SQL batches in one transaction; the shared engine runs in the frontend.
- Server: Bun + Elysia + Postgres (Drizzle). Records stored generically as JSON per `(owner, table, pk)`.
- Mobile: Expo, the same schema and the same engine over `expo-sqlite`.

## Status

| Area                               | State                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| Split view (Part 1)                | Done, 0.34.0                                                                             |
| `packages/shared` sync core        | Done: HLC, merge, protocol, engine, client, API client, tests                            |
| Rust schema export, sync migration | Done: migration 42, registry, export, `sync_query`/`sync_batch`/`sync_reindex`, keychain |
| Server                             | Not started                                                                              |
| Desktop sync client and settings   | Not started                                                                              |
| Sharing                            | Not started                                                                              |
| Mobile                             | Not started                                                                              |

## Next steps

- Server (`apps/server`): auth, sessions, push/pull/ws, shares, OpenAPI, Docker, tests on real Postgres.

## Open questions and risks

- None yet.
