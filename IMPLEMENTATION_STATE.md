# Implementation state: the connected platform

Branch `feat/connected-platform` (worktree `../nookly-connected`, from `mobile-app-and-backend`). Commit and push here, no PRs, no merging. Never run sync or migration code against the real Nookly data: the app in `/Applications` and `~/Library/Application Support/com.nookly.app` are the user's. Debug builds use `apps/desktop/src-tauri/.dev-data` (or `NOOKLY_DATA_DIR`) and their own settings and token files.

**Keep this file current with every commit.** The brief is in the session; `GAP_ANALYSIS.md` is the parity checklist, `DECISIONS.md` the decisions (⚑ marks the ones to double check). `REPORT.md` is written at the end and never committed.

## Phases

| Phase                            | State                                                                                                                                                                                                                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Gap analysis and design       | Done: `GAP_ANALYSIS.md`, `DECISIONS.md` (D1 to D25)                                                                                                                                                                                                                                                  |
| 2. Infra and accounts            | Done: root `docker-compose.yml` (Postgres, MinIO), `.env.example`, `bun run stack`, better-auth (username and password, bearer sessions, OAuth providers by env), legacy account migration, S3 file storage by SHA-256 through the AWS SDK                                                           |
| 3. Desktop on the backend        | Done: account dialog, sign in and create account, first sync with backup first, progress and a checked summary, files and settings sync, sync status in the titlebar, migrations 43 and 44. Verified in the running app against a fixture copy                                                       |
| 4. Live text, offline, conflicts | Done: Yjs page documents over Hocuspocus, carets, offline copies, merge editor on desktop and phone, conflict badge. Verified with real desktop instances, the iPad simulator and the phone simulator                                                                                                |
| 5. Mobile parity and design      | Done: every row of `GAP_ANALYSIS.md` is built or documented as desktop only / partial with the reason. Phone and tablet layouts, live editor, merge editor, settings, files, recipes, calendar, study, assignments, grades, views, share files, onboarding and account screens                       |
| 6. End to end across devices     | Done in the simulators and real desktop builds, see `REPORT.md` (not committed): account created on the iPad, signed in on a fresh desktop, edits both ways in well under two seconds, same note edited on two devices merges, offline edits on both ends of one field give the merge editor on both |

## Mobile (phase 5)

Screens: `apps/mobile/src/screens`, primitives `src/ui` (react-native-reusables style on the desktop's class lists), data on the shared rules `packages/shared/src/data`, sync `packages/shared/src/sync`, live editor `src/editor` (Expo DOM component, D17). Tablet (768 points and up) keeps the sidebar beside the page (D22).

Open items: none from the gap analysis; the partials and their reasons are in `GAP_ANALYSIS.md` and D19. Lint shows a few warnings in mobile files (setState in effects, unused `_` parameters) that were left as they are.

## Running things

```sh
cp .env.example .env                 # ports are 3100 here to dodge the user's own dev server on 3000
docker compose up -d                 # Postgres 5433 and MinIO 9000
bun run stack                        # server on the host with watch mode
bun run test                         # needs TEST_DATABASE_URL=postgres://nookly:nookly@127.0.0.1:5433/nookly_test (create the database once)
```

Desktop end to end: build with `bun run tauri build --debug --no-bundle` (from `apps/desktop`; the dev server's port 1420 is the user's), start the binary with `NOOKLY_DATA_DIR=<copy of a fixture> NOOKLY_AUTOMATION_PORT=4567`, drive it with `bun tools/e2e/desktop.ts 4567 "<script>"` and `--shot out.png`. Fixtures: `bun tools/fixtures/desktop.ts <empty folder>`.

Mobile end to end (automation names: `phone`, `tablet`, `phone-editor`, `tablet-editor`, a device is a tablet when the simulator is an iPad): Metro on 8091 (`EXPO_PUBLIC_AUTOMATION_URL=http://127.0.0.1:4600 EXPO_PUBLIC_AUTOMATION_DEVICE=phone bunx expo start --port 8091 --lan`), `bun tools/e2e/mobile.ts hub 4600` left running, my own simulators (iPhone 17 Pro `EF9F00F7-BA0F-491C-A3C7-97240AFBAF2B`, iPad Pro 13-inch M5 `ABFEE424-8EE0-4228-BCC2-1C9FDB94BE6D`), always in system dark mode (`xcrun simctl ui <id> appearance dark`, the user asked for it). Nothing can tap a system dialog, so Expo Go's "Open in Expo Go?" prompt is avoided with a real native app: `/Users/daniel/nk-build` is a detached worktree on a path without spaces (the native build scripts break on "Open Source"), built once with `bunx expo run:ios -d <id> --port 8092`; afterwards run Metro from this worktree (`bunx expo start --port 8092 --lan --dev-client --clear` with the automation variables) and `xcrun simctl launch <id> app.nookly.mobile`. Rebuild there only when native modules change. The user's own iPhone 17 simulator and Expo on 8081 are theirs.

## Things to know

- Killing only the listener of `bun run stack` can leave the old `bun --watch` process holding open sockets (the clients then keep a connection to nothing). Kill the whole process when restarting the server by hand.
- The sidebar and Settings show the count of conflicts this device recorded; the merge editor also lists the ones the server logged, so it can list more.

- The client pulls before it pushes, so a conflict is recorded on the device that pulled the other edit (`sync_conflicts`); the server only logs ones from truly concurrent pushes. The merge editor lists both.
- `updated_at` never counts as a conflict.
- A page without a document on a device while offline edits its rows as before; documents are made by the server, once.
- Debug builds keep the sync token in `sync-token.dev` in their data folder, never in the keychain.
- Another session once stashed and switched branches inside this worktree (two stashes named "before switching to mobile-app-and-backend" remain in the repository). Everything committed was untouched; uncommitted work was recovered from the first stash.

## Known gaps

- Phone files are hashed in memory (fine for a few hundred megabytes).
- "Keep both" in the merge editor is for text only; dates and numbers offer the two choices.
- External calendars, CLI, agent files, tabs, shortcuts, Vim, folder backups are desktop only by nature (`GAP_ANALYSIS.md`).
