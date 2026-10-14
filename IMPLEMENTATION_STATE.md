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

| Area                               | State                                                                                                                                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Split view (Part 1)                | Done, 0.34.0                                                                                                                                                                                                                       |
| `packages/shared` sync core        | Done: HLC, merge, protocol, engine, client, API client, tests                                                                                                                                                                      |
| Rust schema export, sync migration | Done: migration 42, registry, export, `sync_query`/`sync_batch`/`sync_reindex`, keychain                                                                                                                                           |
| Server                             | Done: auth, sessions, push/pull/ws, sharing, OpenAPI at /docs, Docker + Caddy, 47 tests on real Postgres incl. the vertical slice                                                                                                  |
| Desktop sync client and settings   | Done (0.35.0): Tauri driver, keychain tokens, `features/sync` runtime, Settings, Sync (server, sign in/up, status, sync now, devices, shared with me, conflicts, delete account), Share with People dialog, viewer pages read only |
| Sharing                            | Pages and tasks; server, desktop and mobile (invite, change role, remove, accept, decline, leave, view only pages read only)                                                                                                       |
| Conflicts                          | Kept on device and server; the desktop brings one back or dismisses it (0.36.0)                                                                                                                                                    |
| Mobile                             | First version: shell, Tasks, Notes/Jots, Calendar entries, Bookmarks full; other modules list and open; sync account and shared with me in Settings. 7 screen tests, sharing from the phone, iOS bundle builds                     |

## Next steps

- Mobile breadth: Courses, Exams, Assignments, Decks (study) with their own fields; relationships and labels on the detail screen; a date picker instead of typed dates; conflicts list with Bring Back.
- Desktop: show a shared Space as shared in the sidebar; make a task shared to view only read only in its detail (edits are undone and kept as conflicts today).
- Build the Docker image once and run the prod compose on a VPS.
- Run the app in a simulator once by hand (not done: the user asked not to check the running app).

## Running the server tests locally

`TEST_DATABASE_URL=postgres://... bun test` in `apps/server`, or let Testcontainers start Postgres (needs Docker running; OrbStack was off in the first session, so a throwaway `initdb` cluster on port 55432 was used).

## Open questions and risks

- The Docker image and compose files were written but not built in the first session (Docker was not running).
- Rate limits and the live socket registry are in memory: one server process only.
