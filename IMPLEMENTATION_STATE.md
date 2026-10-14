# Implementation state: the connected platform

Branch `feat/connected-platform` (worktree `../nookly-connected`, from `mobile-app-and-backend`). Commit and push here, no PRs, no merging. Never run sync or migration code against the real Nookly data: the app in `/Applications` and `~/Library/Application Support/com.nookly.app` are the user's. Debug builds use `apps/desktop/src-tauri/.dev-data` (or `NOOKLY_DATA_DIR`) and their own settings and token files.

**Keep this file current with every commit.** The brief is in the session; `GAP_ANALYSIS.md` is the parity checklist, `DECISIONS.md` the decisions (⚑ marks the ones to double check). `REPORT.md` is written at the end and never committed.

## Phases

| Phase                            | State                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Gap analysis and design       | Done: `GAP_ANALYSIS.md`, `DECISIONS.md` (D1 to D16)                                                                                                                                                                                                                                                                                              |
| 2. Infra and accounts            | Done: root `docker-compose.yml` (Postgres, MinIO), `.env.example`, `bun run stack`, better-auth (username and password, bearer sessions, OAuth providers by env), legacy account migration, S3 file storage by SHA-256 through the AWS SDK                                                                                                       |
| 3. Desktop on the backend        | Done: account dialog, sign in and create account, first sync with backup first, progress and a checked summary, files and settings sync, sync status in the titlebar, migration 43 and 44. Verified in the running app against a fixture copy                                                                                                    |
| 4. Live text, offline, conflicts | Done on server and desktop: Yjs page documents over Hocuspocus (`/v1/collab`), carets and presence, offline copies in `page_docs`, merge editor, conflict badge. Verified with two real desktop instances. Not done: the end to end offline conflict walk through is screenshotted once; Yjs caret test between two instances was done by script |
| 5. Mobile parity and design      | In progress, see below                                                                                                                                                                                                                                                                                                                           |
| 6. End to end across devices     | Not started                                                                                                                                                                                                                                                                                                                                      |

## Mobile (phase 5)

Done and committed: webcrypto shim for Yjs, dev automation bridge and simulator tooling (`tools/e2e/mobile.ts`).

Committed (tests pass, 35): the merge editor (`screens/MergeEditor.tsx`, stacked on a phone, side by side from 700 points) replacing the old conflict list and the duplicate `describeConflicts` helper; verified in the simulator: the phone signed in as `ada` on the :3100 server and the desktop fixture's tasks arrived, in system dark mode. Earlier commit: settings on the shared definitions (`data/settings.ts`, `screens/settings/*`, every shared setting has a control, exhaustive by type), account screens (welcome, sign in, create account, forgot password), file sync (`data/files.ts`), pre sync backup (`data/backup.ts`), onboarding gate in the root layout, Settings index and category screens.

Also committed: the live page editor (`src/editor/*`, D17). Verified in the simulator: typing in the web view reached the phone's rows and the server; an edit from `tools/e2e/page-client.ts` (another device) showed in the editor. `phone-editor` is a second automation device that runs scripts inside the editor's web view.

To do, in this order:

1. Look at the account screens, settings and the merge editor in the simulator (the welcome and sign in screens were seen in dark mode).
2. Sync status indicator in the sidebar and page headers, conflict badge on pages, first sync progress, back button label ("(drawer)"), carets and presence bar on the phone, tapping task items in the editor, scrolling to the cursor on a real keyboard (written, not seen).
4. Missing modules and edits per `GAP_ANALYSIS.md`: Semesters, Sessions, Recipes, Files (viewer and add), Grades, Views, task effort, repeat and sub-tasks, Space settings, module add and remove, labels, statuses, icon picker, import and export.
5. Tablet layout (persistent sidebar), design pass (Claude app style, sheets).
6. Screenshots: phone, tablet, merge editor.

## Running things

```sh
cp .env.example .env                 # ports are 3100 here to dodge the user's own dev server on 3000
docker compose up -d                 # Postgres 5433 and MinIO 9000
bun run stack                        # server on the host with watch mode
bun run test                         # needs TEST_DATABASE_URL=postgres://nookly:nookly@127.0.0.1:5433/nookly_test (create the database once)
```

Desktop end to end: build with `bun run tauri build --debug --no-bundle` (from `apps/desktop`; the dev server's port 1420 is the user's), start the binary with `NOOKLY_DATA_DIR=<copy of a fixture> NOOKLY_AUTOMATION_PORT=4567`, drive it with `bun tools/e2e/desktop.ts 4567 "<script>"` and `--shot out.png`. Fixtures: `bun tools/fixtures/desktop.ts <empty folder>`.

Mobile end to end: Metro on 8091 (`EXPO_PUBLIC_AUTOMATION_URL=http://127.0.0.1:4600 EXPO_PUBLIC_AUTOMATION_DEVICE=phone bunx expo start --port 8091 --lan`), `bun tools/e2e/mobile.ts hub 4600` left running, my own simulators (iPhone 17 Pro `EF9F00F7-BA0F-491C-A3C7-97240AFBAF2B`, iPad Pro 13-inch M5 `ABFEE424-8EE0-4228-BCC2-1C9FDB94BE6D`), always in system dark mode (`xcrun simctl ui <id> appearance dark`, the user asked for it). Nothing can tap a system dialog, so Expo Go's "Open in Expo Go?" prompt is avoided with a real native app: `/Users/daniel/nk-build` is a detached worktree on a path without spaces (the native build scripts break on "Open Source"), built once with `bunx expo run:ios -d <id> --port 8092`; afterwards run Metro from this worktree (`bunx expo start --port 8092 --lan --dev-client --clear` with the automation variables) and `xcrun simctl launch <id> app.nookly.mobile`. Rebuild there only when native modules change. The user's own iPhone 17 simulator and Expo on 8081 are theirs.

## Things to know

- The client pulls before it pushes, so a conflict is recorded on the device that pulled the other edit (`sync_conflicts`); the server only logs ones from truly concurrent pushes. The merge editor lists both.
- `updated_at` never counts as a conflict.
- A page without a document on a device while offline edits its rows as before; documents are made by the server, once.
- Debug builds keep the sync token in `sync-token.dev` in their data folder, never in the keychain.
- Another session once stashed and switched branches inside this worktree (two stashes named "before switching to mobile-app-and-backend" remain in the repository). Everything committed was untouched; uncommitted work was recovered from the first stash.

## Known gaps

- Phone files are hashed in memory (fine for a few hundred megabytes).
- "Keep both" in the merge editor is for text only; dates and numbers offer the two choices.
- External calendars, CLI, agent files, tabs, shortcuts, Vim, folder backups are desktop only by nature (`GAP_ANALYSIS.md`).
