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

| Area                               | State                                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Split view (Part 1)                | Done, 0.34.0                                                                                                                      |
| `packages/shared` sync core        | Done: HLC, merge, protocol, engine, client, API client, tests                                                                     |
| Rust schema export, sync migration | Done: migration 42, registry, export, `sync_query`/`sync_batch`/`sync_reindex`, keychain                                          |
| Server                             | Done: auth, sessions, push/pull/ws, sharing, OpenAPI at /docs, Docker + Caddy, 47 tests on real Postgres incl. the vertical slice |
| Desktop sync client and settings   | Not started                                                                                                                       |
| Sharing                            | Server done (pages: viewer/editor, invites, revoke). Desktop and mobile UI not started                                            |
| Mobile                             | Not started                                                                                                                       |

## Next steps

- Desktop: Tauri `SqlDriver`, a sync store in the frontend running `SyncClient`, Settings section (server URL, sign up / in / out, status, sync now, sessions, conflicts), Share dialog on pages, Shared with me list. Version bump + changelog.
- Then mobile.

## Running the server tests locally

`TEST_DATABASE_URL=postgres://... bun test` in `apps/server`, or let Testcontainers start Postgres (needs Docker running; OrbStack was off in the first session, so a throwaway `initdb` cluster on port 55432 was used).

## Open questions and risks

- The Docker image and compose files were written but not built in the first session (Docker was not running).
- Rate limits and the live socket registry are in memory: one server process only.
