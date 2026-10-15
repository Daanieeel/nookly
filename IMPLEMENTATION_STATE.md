# Implementation state: the connected platform

Branch `feat/connected-platform` (worktree `../nookly-connected`, from `mobile-app-and-backend`). Commit and push here, no PRs, no merging. Never run sync or migration code against the real Nookly data: the app in `/Applications` and `~/Library/Application Support/com.nookly.app` are the user's. Debug builds use `apps/desktop/src-tauri/.dev-data` (or `NOOKLY_DATA_DIR`) and their own settings and token files.

**Keep this file current with every commit.** The brief is in the session; `GAP_ANALYSIS.md` is the parity checklist, `DECISIONS.md` the decisions (⚑ marks the ones to double check). `REPORT.md` is written at the end and never committed.

## Phases

| Phase                            | State                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Gap analysis and design       | Done: `GAP_ANALYSIS.md`, `DECISIONS.md` (D1 to D25)                                                                                                                                                                                                                                                                                            |
| 2. Infra and accounts            | Done: root `docker-compose.yml` (Postgres, MinIO), `.env.example`, `bun run stack`, better-auth (username and password, bearer sessions, OAuth providers by env), legacy account migration, S3 file storage by SHA-256 through the AWS SDK                                                                                                     |
| 3. Desktop on the backend        | Done: account dialog, sign in and create account, first sync with backup first, progress and a checked summary, files and settings sync, sync status in the titlebar, migrations 43 and 44. Verified in the running app against a fixture copy                                                                                                 |
| 4. Live text, offline, conflicts | Done: Yjs page documents over Hocuspocus, carets, offline copies, merge editor on desktop and phone, conflict badge. Verified with real desktop instances, the iPad simulator and the phone simulator                                                                                                                                          |
| 5. Mobile parity and design      | Done: every row of `GAP_ANALYSIS.md` is built or documented as desktop only / partial with the reason. Phone and tablet layouts, live editor, merge editor, settings, files, recipes, calendar, study, assignments, grades, views, share files, onboarding and account screens                                                                 |
| 6. End to end across devices     | Mostly done, see "Where work stopped" below: account created on the iPad, signed in on a fresh desktop, edits both ways, same note edited on two devices merges, offline edits on both ends of one field give the merge editor on desktop and iPad. Last item (first sync migration re-run with the 0.38.1 build) and `REPORT.md` are not done |

## Where work stopped

Latest commit on `feat/connected-platform`: `2b8e8b0` (pushed). The working tree is clean; the only things not in git are `REPORT.md` and `report/screenshots/`, both listed in the repository's `.git/info/exclude` on purpose (the brief says never commit the report).

### Already done in the last stretch (all committed and pushed)

- Sidebar text unreadable in dark mode: fixed with theme colours (D23); require cycle between `PlannerScreens` and `StudyDetail` removed (new `StudyPickers.tsx`); tablet layout (D22); course Room field.
- Found by running two accounts across the iPad, the phone and a real desktop build, each fixed with a test first (D24, D25):
  - Sign up on a phone refused with "Missing or null Origin": the phone's networking layer sends back the cookie of an earlier sign in. Auth requests now drop cookies on the server (`apps/server/src/auth/cookies.ts`) and the client sends `credentials: "omit"`.
  - A second account on the same device never saw its own data: a sync still in flight at sign out wrote its cursor after the wipe. A stopped sync now writes nothing, sign out waits for it (`SyncClient.finished()`), and turning sync on clears cursors.
  - Changes arrived up to a minute late after a server restart: the live socket reconnects within 10 s, pings every 15 s and is dropped after 40 s of silence (`packages/shared/src/api/client.ts`, `live.test.ts`); local changes go out after 400 ms.
- `cargo test` failed on `every_registered_command_is_covered` (blob, pre sync backup and store folder commands had no test). Fixed with three tests and `NOT_INVOKED` entries in `commands_tests.rs`.
- One lint error (inline query key) fixed in `lib/query-keys.ts`.
- Versions bumped: desktop 0.38.1 (changelog section and `whats-new.json` entry written), mobile 0.5.0, server 0.2.1.
- `DECISIONS.md` has D18 to D25; `GAP_ANALYSIS.md` has no empty Done cell (81 done, 11 partial with reasons, the rest desktop only); the server docs and `apps/server/README.md` now describe the real stack (root compose, `bun run stack`, better-auth, S3) instead of the old JWT setup.
- Last full run of the checks: `bun run lint` (errors none, warnings only), `format:check`, `typecheck`, `bun run test` (shared 216, frontend 2274 plus the expected fail, mobile 113, server 84 against Postgres), `cargo test` (1243), `bun run duplication` (0.23%). The frontend run showed three timeouts when `cargo test` ran at the same time; they passed alone.
- Verified in the simulators and desktop builds: the iPad created account `grace`, a fresh desktop signed in and received everything; iPad to desktop and desktop to iPad edits arrived in roughly 0.2 to 2 s (the measurement script is crude, treat as "about a second"); two devices typing in one note merged with nothing lost; both devices offline with different titles gave the merge editor on the desktop and the iPad (both versions, device names, times, changed words marked), resolving on one cleared it on both.

### Where I was interrupted

I was re-running the first sync migration once more, with the 0.38.1 desktop build, as a last regression check after the cursor and sign out changes: a fresh fixture copy (`bun tools/fixtures/desktop.ts <scratch>/run-desktop-h`), start it on automation port 4569, sign in as `ada` (an account that already has data, so the merge case), and look at the backup, progress and summary. The instance did not answer the automation port: the process either exited right after start or its webview never ran scripts (no log output, I did not find out why). I was about to start it in the foreground to see its output when I was stopped. Nothing was changed for this; the earlier run of this scenario (phase 3, an older build) passed, and the server and shared tests cover the same logic (`runtime.test.ts`, `vertical-slice.test.ts`).

### Still to do

1. Re-run that migration check (see above). If the app will not start with a fixture copy, look at its output first; it started fine for the `run-desktop-g` copy earlier. Expected: a backup under `pre-sync-backups`, "X items, Y files" summary, local data untouched, account's existing rows merged.
2. Write `REPORT.md` (do not commit it): what was built by phase with commit ranges (my commits start at `1b6a32cb`, the branch point is `0b5bd915`, 40 commits to `2b8e8b0`), every decision in `DECISIONS.md` summarised with the ⚑ ones marked, what is stubbed, skipped or fragile (phone files hashed in memory; "keep both" is text only; D7 newest wins; external calendars, CLI, agent files, tabs, shortcuts, Vim and folder backups desktop only; series creation and editing desktop only; no "copy link" on the phone; password reset is a console mailer stub; OAuth providers untested; no real device run, only simulators; nothing can tap a system dialog; the stash incident; simulator runs are not in CI; the "fresh clone" steps were written but the stack was not rebuilt from a literally fresh clone), how to run it and a 15 minute manual checklist covering the Definition of Done, and the screenshots in `report/screenshots/` (desktop dashboard, desktop merge editor and conflict badge, phone sidebar, page editor, dashboard, settings and merge editor, tablet dashboard, page editor and merge editor, the sign up error before its fix, the slash menu).
3. Optional polish: the sidebar and Settings count only conflicts this device recorded while the merge editor can list more (a count mismatch, seen as "1 change needs a look" above two rows); a few mobile lint warnings (setState in effects in `SettingRow`, `RecipeScreens`, `PageEditor`; unused `_` parameters in `FileScreens` and `RecipeScreens`); the report only checks were not run (`bun run coverage`, `unused`, `audit`, `lint:rust:strict`).
4. Clean up what I left running on this machine (all mine, none of the user's): the server from `bun run stack` on port 3100, Metro on 8093, the simulator hub on 4600, the debug desktop on automation port 4568 (data in the scratchpad `run-desktop-g`), and possibly a stray debug desktop from the 4569 attempts. The user's own dev server (3000), Expo (8081), vite (1420), their iPhone 17 simulator and `/Applications/Nookly.app` were never touched.

### State of the local test data (disposable)

Dev Postgres (`nookly-postgres-1`, port 5433) holds accounts `ada` (`correct horse battery`, the desktop fixture's 588 items) and `grace` (`grace hopper compiler`, created on the iPad from the same data). One fixture task (TSK-3) had its title changed by latency probes in both accounts. The throwaway probe accounts were deleted. The iPad simulator is signed in as `grace`, the phone simulator as `ada`.

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
