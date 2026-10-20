# Implementation state: the connected platform

This file is the handover. A coding agent that reads it, plus `AGENTS.md`, `GAP_ANALYSIS.md` and `DECISIONS.md`, should be able to continue without the original conversation. Keep it current with every commit.

## 1. Where things are

- Branch: `feat/connected-platform`. It branched from `mobile-app-and-backend` at `0b5bd915`. 40 commits of this work, latest pushed commit at the time of writing: `a62244b`. Commit and push to `origin feat/connected-platform`. **No PRs, no merges.**
- Not in git on purpose: `REPORT.md` (the user said never to commit it) and `report/screenshots/` (both in `.git/info/exclude`), `.env`.
- Two old stashes in the repository ("WIP on feat/connected-platform before switching to mobile-app-and-backend") come from an incident where another session switched branches inside a checkout of this branch. Leave them alone. Never `git stash`, never switch branches in a checkout of this branch.

## 2. The brief (what the user asked for)

Mode: fully autonomous. Do not ask the user anything; make the best call, record it in `DECISIONS.md` (decision, alternatives, why; ⚑ marks ones to double check), keep going, commit after each meaningful step with a clear message, do not stop at "mostly works". Anything truly impossible or blocked (paid account, real mail provider) is stubbed behind an interface and listed in the final report.

Goal: Nookly (Tauri desktop app, Expo mobile app, Elysia server) becomes one connected product. A user signs in on any device and sees and edits the same data live on all of them, including offline with sync on reconnect. The backend is the single source of truth.

Hard rule: **no data loss, ever** (migration, sync, conflict resolution, crash mid write, failed upload). Never delete local data until the server confirmed it persisted. Every destructive or overwriting operation is recoverable (trash, version history or conflict copy). When in doubt keep both versions. **Never run migration or sync code against the user's real Nookly data**; test on copies and generated fixtures only. Tests must try to break this (kill app mid sync, offline mid upload, same item edited on two devices).

Architecture: docker compose with Postgres (Drizzle schema and migrations) and MinIO reached only through the AWS S3 SDK v3 (endpoint, bucket and credentials from env); the backend owns auth; clients keep a local cache; `docker compose up` plus a documented dev script brings everything up on localhost; `.env.example` covers every variable; no secrets committed.

Accounts: better-auth, username and password first, structured so Google, Apple and GitHub OAuth can be added later; sign up, login, logout, session persistence like a consumer app; password reset stubbed without an email provider; one account works on desktop and mobile.

Migrating existing desktop data: on first login with local data, a full local backup first; idempotent and resumable; files go to MinIO with checksum verification; progress and a summary ("X items, Y files migrated"); local data stays until the server confirmed every item; an account that already has data from another device merges, never overwrites.

Sync: Notion like feel; WebSockets; text content as CRDT (Yjs and Hocuspocus); structured fields per field with version tracking (different fields merge silently, only the same field on both sides is a real conflict); offline everything works against the local cache with a queue and a quiet indicator (synced, syncing, offline, conflict); file upload queue with retry.

Conflict UI (merge editor): only for real conflicts; no git vocabulary; "This device", "Other device", device names and timestamps; side by side with differences highlighted (stacked on a phone); per conflict: keep this one, keep the other, keep both, edit a combined version; never blocks the user (the item stays usable, a badge invites resolving); unresolved conflicts never lose either version.

Desktop: wire every feature to the backend; account UI (sign in and sign up, account section in settings, signed in state and sync status visible).

Mobile: feature parity with the desktop (every feature, screen and setting; a missing feature counts as a bug), same information architecture adapted to phone and tablet, in the style of the Claude mobile app (calm, native navigation, sheets instead of modals, generous spacing; iPad closer to the desktop layout), onboarding screen then sign in or create account. The user also said the mobile components were ugly, wrongly implemented or fantasy code, and asked to imitate the desktop as closely as possible; there is no shadcn/ui on Expo, `reactnativereusables.com` may be used instead.

Order of work: 1 gap analysis and design; 2 infra and better-auth; 3 desktop on the backend and local data migration; 4 offline cache, WebSocket sync, CRDT text, conflict UI; 5 mobile parity and design; 6 end to end verification across devices. At the end of each phase run everything and fix what is broken before moving on.

Definition of done:

1. Fresh clone, documented steps, full stack on localhost.
2. A desktop with local data (a test copy) logs in, everything is migrated, verified, nothing lost.
3. An account created on mobile, logged in on desktop: edits appear within about a second.
4. The same note edited on two devices at once merges with no conflict.
5. One device offline, the same field changed on both, reconnect: the merge editor appears, both versions kept until resolved.
6. Every item in `GAP_ANALYSIS.md` exists and works on mobile.
7. Typecheck, lint and tests pass.

Final report `REPORT.md` (not committed): what was built phase by phase with commit ranges; every decision from `DECISIONS.md` summarised with the ⚑ ones marked; anything stubbed, skipped or fragile stated plainly; how to run, plus a manual test checklist of at most 15 minutes covering the definition of done; screenshots of desktop, phone and tablet including the merge editor. The user allowed committing and pushing, not opening a PR.

Later instructions from the user:

- "make sure IMPLEMENTATION_STATE.md stays up to date all the time" and "must contain all the information I would give a coding agent to resume working" (this file).
- "make sure to use the simulator in system dark mode" (`xcrun simctl ui <id> appearance dark`, repeat after a simulator reboots).
- The user switched the model to Sonnet 5.5 and wants terse caveman style replies in chat (code, commits and docs are written normally). A memory of the user's preferences exists under `~/.claude/projects/.../memory/` (released app so no data loss, terse docs, canonical classes in `packages/ui`, sync and mobile plan).

## 3. Project rules from `AGENTS.md` that bite here

- Nookly is released: user data must be preserved at all costs. Persisted state changes need a new migration in `apps/desktop/src-tauri/src/db/migrations.rs` (append only, never edit an old one), its hash in `EXPECTED_HASHES`, a declaration in `db/upgrade.rs` (`DECLARED`) for any changed existing column, and `cargo test db::upgrade_tests`. Snapshots: `NOOKLY_UPDATE_SNAPSHOTS=1 cargo test --lib sync::` and `cli::snapshot_tests`. Migrations 43 and 44 are this work's.
- Version bumps via `bun tools/bump-version.ts patch|minor` (never major; report if a major would be needed). Every bump needs a `## x.y.z (date)` section in `CHANGELOG.md` and an entry in `whats-new.json` (card under `highlights` for a feature, a line under `more` for a smaller change) in the same commit. Desktop is 0.38.2, mobile 0.5.1 (`apps/mobile/package.json` and `app.json`), server 0.2.2 (the bump tool only touches the desktop).
- User facing copy: no em or en dashes and no hyphenated sentence structure.
- Never modify existing primitives or tokens in `packages/ui` (add only). `outline` variants of Button and Badge are rare. Icon only buttons need a tooltip or label. Dialogs and menus get an axe test (`vitest-axe`). Permanent actions use `ConfirmPermanentDialog` (phone: system alert, D18).
- Every new entity, field or relationship must be exposed through the schema layer the CLI generates from; no one off CLI commands.
- Tests first for every bug fix and behaviour change; a test that pins a known bug says so.
- Before finishing run and fix: `bun run lint`, `bun run format:check` (`bunx oxfmt <paths>` formats), `bun run typecheck`, `bun run test` (needs `TEST_DATABASE_URL=postgres://nookly:nookly@127.0.0.1:5433/nookly_test`), `cd apps/desktop/src-tauri && cargo test`, `bun run duplication` (under 1%, currently 0.23%). Report only checks (read, do not silence): `bun run coverage`, `unused`, `audit`, `lint:rust:strict`. While iterating run only the tests of the feature.
- The lint is a strict "anti slop" oxlint: no runtime `typeof` checks, no open `Record<string, ...>` dictionaries (use `Map` or `satisfies`), no `unknown` or `object` parameters, type assertions need a `// SAFETY:` comment, no chained assertions (`as unknown as X`), no inline query keys (use `qk` from `packages/frontend/src/lib/query-keys.ts`, checked by `bun run lint:keys`).

## 4. Architecture in this branch

- `apps/server` (Bun, Elysia, Drizzle, Postgres): `src/auth` (better-auth: username or email plus password, bearer sessions, OAuth by env keys, `cookies.ts` strips cookies from auth requests), `src/sync` (push, pull, `hub.ts` WebSocket notices on `/v1/sync/ws`), `src/collab` (Hocuspocus Yjs page documents on `/v1/collab`), `src/storage` (S3 blobs by SHA-256), `src/shares`, `src/mail` (console mailer stub), `src/app.ts`. Tests in `apps/server/test` run against a real Postgres.
- `packages/shared`: the sync engine and client used by desktop webview and phone alike (`src/sync`: `engine.ts` per field records with hybrid logical clocks, `client.ts` debounce, live socket, retry, `runtime.ts` sign in and out, first sync with backup, files, settings, conflicts, `docs.ts` page documents, `conflict-view.ts`), `src/api/client.ts` (`ApiClient`, live socket with ping and silence detection), and `src/data` (TypeScript ports of the desktop's Rust data rules for the phone, D20; a Rust test imports their sample files so they cannot drift).
- `apps/desktop`: Tauri. Frontend in `packages/frontend` (account dialog, first sync dialog, merge editor, conflict badge, titlebar sync status in `features/sync`). Rust in `apps/desktop/src-tauri` (`commands/blobs.rs`, `commands/backup.rs`, `sync/`, automation server in `src/automation.rs` for debug builds).
- `apps/mobile` (Expo 57, React Native, NativeWind, `@rn-primitives`, react-native-reusables style): `src/app` routes (Expo Router, drawer, `entity/[id]`, `conflicts`, `account/*`, `settings/*`, `new/*`), `src/screens`, `src/ui` primitives on the desktop's class lists (`@nookly/ui/classes`), `src/data` (SQLite driver, queries, sync wiring, backup, files), `src/editor` (D17: ProseMirror in an Expo DOM component on the desktop's exported schema `packages/shared/src/generated/editor-schema.json`, Yjs bridged as base64), `src/dev/automation.ts` (script bridge for simulators, active only when `EXPO_PUBLIC_AUTOMATION_URL` is set). Tablet (768 points and up) keeps the sidebar beside the page (D22).
- Docs: `GAP_ANALYSIS.md` (every row has a Done mark: 81 done, 11 partial with reasons, the rest desktop only), `DECISIONS.md` (D1 to D25), `docs/development/server.md` and `apps/server/README.md` (run and deploy), `docs/development/sync-protocol.md`.

Behaviour worth knowing:

- The client pulls before it pushes, so a conflict is recorded on the device that pulled the other edit (`sync_conflicts`); the server also logs truly concurrent ones. The merge editor lists both. The sidebar and Settings count only the device's own, so they can show fewer than the merge editor lists (known mismatch).
- `updated_at` never counts as a conflict. Same field on both sides: newest wins and is shown, the other is kept and a badge asks (D7).
- Documents for pages are made by the server once; a page without a document edits its rows as before while offline.
- Debug desktop builds keep their sync token in `sync-token.dev` in their data folder, never in the keychain.
- Desktop debug builds default the server address to `http://localhost:3000`; this machine's `.env` (gitignored) uses `PORT=3100` to dodge the user's own dev server, so use "Change Server" in the sign in dialog (or the Server field on the phone) to point at `http://localhost:3100`.

## 5. Phases

| Phase                            | State                                                                                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Gap analysis and design       | Done: `GAP_ANALYSIS.md`, `DECISIONS.md`                                                                                                                                                        |
| 2. Infra and accounts            | Done: root `docker-compose.yml` (Postgres 5433, MinIO 9000 and 9001), `.env.example`, `bun run stack`, better-auth, legacy account migration, S3 blobs                                         |
| 3. Desktop on the backend        | Done: account dialog, first sync (backup first, progress, checked summary), files and settings sync, titlebar status, migrations 43 and 44. Verified in the running app against fixture copies |
| 4. Live text, offline, conflicts | Done: Yjs over Hocuspocus, carets, offline copies, merge editor on desktop and phone, conflict badge                                                                                           |
| 5. Mobile parity and design      | Done: every row of the gap analysis built or documented as partial or desktop only, with phone and tablet layouts                                                                              |
| 6. End to end across devices     | Mostly done, see 7                                                                                                                                                                             |

Commit ranges (oldest first; the branch point is `0b5bd915`):

- Phase 1: `1b6a32cb` (gap analysis and decisions).
- Phase 2: `3fe5b88b`, `c24b0898`.
- Phase 3: `43629bfd`, `e7770df1`, `ee6db08e` (e2e tooling and fixtures).
- Phase 4: `e011c1dc` to `c7e0b63e` (Yjs documents, Hocuspocus, live pages on desktop, conflicts, merge editor).
- Phase 5 (mobile): `82ce5bec` to `20f14721` (webcrypto shim, automation bridge, onboarding and account screens, settings, file sync, backup, merge editor, live editor, Space settings, files, recipes, calendar, sessions, study, tasks, dashboard, saved views, links, slash menu, bookmarks, Nookly files, tablet layout).
- Phase 6 fixes: `6e5f5187`, `3a4397d1`, then `e278c001` (versions, notes, desktop command coverage, lint fix), `2b8e8b0` (docs), `a62244b` (this file's previous version).

## 6. How to run and verify

### 6.1 Stack and tests

```sh
cp .env.example .env            # this machine's .env sets PORT=3100
docker compose up -d            # containers nookly-postgres-1 (5433) and nookly-minio-1 (9000, 9001)
bun install
bun run stack                   # migrations, then the server on the host with watch mode
TEST_DATABASE_URL=postgres://nookly:nookly@127.0.0.1:5433/nookly_test bun run test   # create the database once
cd apps/desktop/src-tauri && cargo test      # about 4.5 minutes; run alone, the frontend suite times out when it competes for CPU
```

Single suites: shared `cd packages/shared && bunx vitest run`; frontend `cd packages/frontend && bunx vitest run <file>` (2274 pass plus one expected fail); mobile `cd apps/mobile && bunx jest` (113); server `bun test apps/server/test/<file>`; Rust `cargo test --lib <filter>`. `tools/gap.py "<row text>" "<mark>" ["note"]` sets a Done mark in `GAP_ANALYSIS.md`.

Restarting the server by hand: killing only the listener pid of `bun run stack` once left the old `bun --watch` parent alive holding sockets, so clients kept a connection to nothing. Kill the whole process (check `ps` for `bun --watch src/index.ts`).

### 6.2 Desktop end to end

```sh
cd apps/desktop && bun run tauri build --debug --no-bundle        # port 1420 is the user's vite; this does not use it
bun tools/fixtures/desktop.ts <empty folder>                      # 120 notes, 40 tasks, study data, a bookmark, 5 files
cd src-tauri && NOOKLY_DATA_DIR=<folder> NOOKLY_AUTOMATION_PORT=4568 ./target/debug/nookly &
bun tools/e2e/desktop.ts 4568 "return text().slice(0,200)"       # helpers: click, clickText, type, byText, waitFor, sleep, text
bun tools/e2e/desktop.ts 4568 --shot out.png
```

Use a copy of a fixture, never the user's data. Pick unused automation ports (4567 to 4569 were mine). Kill instances by port (`lsof -iTCP:<port> -sTCP:LISTEN`), never `pkill -f` on the binary path (that could hit `/Applications/Nookly.app`). Tips: the title input is driven through its React props (`Object.keys(el).find(k => k.startsWith("__reactProps"))`, call `onKeyDown({key:"Enter",...})`); a button's visible text can be doubled (`Couldn't sign inCouldn't sign in`), so match with a regex instead of `byText`; `timeout` does not exist in this zsh.

### 6.3 Mobile end to end (simulators)

- My simulators (the user's own "iPhone 17" simulator `45B8BECE-...`, their Expo on 8081, vite on 1420 and dev server on 3000 are theirs, do not touch): iPhone 17 Pro `EF9F00F7-BA0F-491C-A3C7-97240AFBAF2B`, iPad Pro 13-inch (M5) `ABFEE424-8EE0-4228-BCC2-1C9FDB94BE6D`. Both in dark mode.
- Native app id `app.nookly.mobile`, a dev client built from a checkout of this branch at a path without spaces (the native build scripts break on the space in "Open Source") with `bunx expo run:ios -d <id> --port 8092`. Rebuild only when native modules change (last build included `expo-sharing`). Expo Go is avoided because its "Open in Expo Go?" system dialog cannot be tapped (osascript and Accessibility automation are denied, idb from an untrusted tap was refused; a stuck dialog was cleared by shutting down and booting that simulator, app data persists).
- Metro: `cd apps/mobile && EXPO_PUBLIC_AUTOMATION_URL=http://127.0.0.1:4600 EXPO_PUBLIC_AUTOMATION_DEVICE=phone EXPO_NO_TELEMETRY=1 bunx expo start --port 8093 --lan --dev-client --clear`; hub `bun tools/e2e/mobile.ts hub 4600` left running; launch with `xcrun simctl launch <id> app.nookly.mobile`.
- Scripts: `bun tools/e2e/mobile.ts run phone|tablet|phone-editor|tablet-editor "<script>"`. Helpers: `press(label, nth)`, `type(label, value)`, `sleep`, `labels()`, `screenText()`, plus `db`, `sync`, `queryClient`, `router`; the `-editor` devices run inside the editor web view with `editor`, `doc`, `awareness`. `bun tools/e2e/page-client.ts <server> <user> <pass> <entityId> append|read [text]` acts as another device on a page. A device counts as `tablet` when the simulator is an iPad.
- Gotchas: after Metro hot reloads shared code, the automation context may hold the old runtime objects, so relaunch the app (`simctl terminate` then `launch`) before measuring sync. On the iPad the Welcome route stays mounted under sign in, so `press("Sign In", n)` indexes shift (press the last). Do not call `router.dismissAll()` with no stack (dev toast "POP_TO_TOP not handled"). Screenshots: `xcrun simctl io <id> screenshot file.png`.

### 6.4 Local test data (disposable)

Dev Postgres holds accounts `ada` (`correct horse battery`, the desktop fixture's 588 items and files) and `grace` (`grace hopper compiler`, created on the iPad from the same data). These are local throwaway fixtures. Fixture task TSK-3 (id `b5c5b4af-0b43-4245-9e1a-385048ef8f0d`) had its title changed by latency probes in both accounts. The iPad simulator is signed in as `grace`, the phone as `ada`. The scratchpad folder with fixtures and screenshots is temporary; regenerate fixtures with `tools/fixtures/desktop.ts`.

## 7. Where work stopped

Everything is committed and pushed (latest code commit `2b8e8b0`, plus docs). The working tree was clean.

Done in the last stretch, each with a test first:

- Sidebar text in dark mode (theme colours, D23), require cycle `PlannerScreens` and `StudyDetail` removed (`StudyPickers.tsx`), tablet layout, course Room field.
- Found by running two accounts on the iPad, phone and a real desktop build (D24, D25): sign up on a phone refused with "Missing or null Origin" (the phone's networking layer sends back an earlier cookie; auth requests drop cookies on the server and the client sends `credentials: "omit"`); a second account on a device never saw its own data (a sync in flight at sign out wrote its cursor after the wipe; now a stopped sync writes nothing, `SyncClient.finished()` lets sign out wait, and `SyncEngine.enable` clears cursors); changes arrived up to a minute late after a server restart (the live socket reconnects within 10 s, pings every 15 s, is dropped after 40 s of silence; local changes go out after 400 ms instead of 1.5 s).
- `cargo test` failed on `every_registered_command_is_covered` (the blob, pre sync backup and store folder commands had no test); three tests and `NOT_INVOKED` entries added in `commands_tests.rs`. A lint error (inline query key) fixed. Versions bumped (desktop 0.38.1 with changelog and what's new, mobile 0.5.0, server 0.2.1). Decisions D18 to D25 written. Server docs rewritten for the real stack.
- Last full check run, all green: lint (warnings only), `format:check`, `typecheck`, `bun run test` (shared 216, frontend 2274 plus the expected fail, mobile 113, server 84), `cargo test` (1243), duplication 0.23%.
- Verified in simulators and desktop builds: iPad created account `grace`, a fresh desktop signed in and received everything; edits both ways arrive in roughly 0.2 to 2 s (crude measurement, say "about a second"); two devices typing in one note merged with nothing lost (an iPad editor and a script client); both devices offline with different titles produced the merge editor on desktop and iPad (device names, times, changed words marked), and resolving on one cleared it on both. A phone merge editor screenshot also exists.

Interrupted at: a last regression check of the first sync migration with the 0.38.1 desktop build. Plan: `bun tools/fixtures/desktop.ts <scratch>/run-desktop-h`, start the debug binary on automation port 4569, sign in as `ada` (an account that already has data, so this is the merge case), confirm a backup in `pre-sync-backups`, the progress and the "X items, Y files" summary, local data untouched. The instance on 4569 never answered the automation port (the process exited right after start or its webview never ran scripts; no log output; cause not found). The next step was to start it in the foreground and read its output. Nothing was changed because of this. The same scenario passed in phase 3 with an older build, and `runtime.test.ts` and the server `vertical-slice.test.ts` cover the logic.

Session 2026-10-20 (resumed after `/clear`):

- Found a cold machine: OrbStack not running (`open -a OrbStack`, then `docker compose up -d`), no server, no simulators booted, and `node_modules` stale (`@noble/ciphers` 1.3.0 installed, lockfile wants 2.4.0, server crashed with "Export named 'managedNonce' not found"). `bun install --frozen-lockfile` fixed it; `bun run stack` then served on 3100.
- The 4569 mystery is solved: `target/debug/nookly` had been built without the automation server (`strings` finds no `NOOKLY_AUTOMATION_PORT`), so the port never opened and nothing was wrong with sync. Rebuild with `bun run tauri build --debug --no-bundle` in `apps/desktop` before any desktop e2e, and check with `strings -a target/debug/nookly | grep -c NOOKLY_AUTOMATION_PORT`.
- Migration regression check DONE with the rebuilt 0.38.1 debug binary: fixture `run-h` (179 local rows) signed in as `ada` (account with data, the merge case) at `http://localhost:3100`; a backup zip appeared in `pre-sync-backups`, status turned Synced, `sync_dirty` 0, local rows 358 (merged), every backup row still present. Seen: the merge shows duplicate Spaces (Study, Personal, Work twice) because both sides made default Spaces with different ids; nothing lost, a cosmetic wart to report. The debug backup also contains `sync-token.dev` (debug builds only; release uses the keychain). A banner "Update available, Version 0.40.0" shows: main has moved past this branch's 0.38.1, expect version and migration conflicts when this branch is eventually merged.
- Bug fixed (user report: "Synced just now" flashed to "Syncing" every second): `SyncRuntime.runFiles` acted on `progress.uploaded > 0` and `downloaded > 0`, which are session totals, so after the first file every cycle started another cycle plus a full view refresh (also refetching `sessions` and `shares/incoming` in Settings). Now it compares with the counts of the previous pass (`filesCounted`, reset on sign out). Test: `runtime.test.ts` "goes quiet once the files are sent..." (failed 10 to 18 pulls before). Verified in the rebuilt desktop: 0 pulls in 10 s idle, status steady. Found by hooking `setTimeout(…, 400)` in the webview to read the caller from the minified bundle; handy trick. Versions bumped to desktop 0.38.2, mobile 0.5.1, server 0.2.2 with changelog and what's new entries.
- Server `/health` and the API docs now report `package.json`'s version (was `npm_package_version ?? "0.1.0"`, wrong under `bun run stack`). Test `apps/server/test/config.test.ts`.
- Fresh clone check DONE: `git clone` into a folder named `nookly`, `cp .env.example .env`, `bun install`, `bun run stack` (PORT 3200) came up and answered `/health`.
- Full check run after these changes: lint, format:check, typecheck, `cargo test` (1243), frontend alone (2274 plus the expected fail), shared 217. The turbo `bun run test` run can time out two frontend tests and a shared one under CPU load; they pass alone.
- Accident to know about: I ran `git stash` once by mistake and popped it straight away; the three old stashes are intact.
- `REPORT.md` is written (untracked, excluded). `report/screenshots/` has desktop dashboard, phone dashboard, settings and page editor, tablet dashboard. Missing: merge editor on desktop, phone and tablet, and the conflict badge (stage a conflict with two devices offline, section 6.3). Phone and tablet shots were taken with Metro on 8093 and the hub on 4600; the dev client's About row still says 0.4.1 because the native binary was built earlier.
- Everything I started is stopped (server, Metro, hub, desktop, simulators, `docker compose stop`). To resume: `open -a OrbStack`, `docker compose up -d`, `bun install --frozen-lockfile`, `bun run stack`.
- `REPORT.md` and `report/screenshots/` are not in this checkout (they lived elsewhere); both are excluded from git. Screenshots must be retaken.

## 7b. New brief (2026-10-20): full mobile parity and a desktop-like iPad

The user asked: "go for full implementation on mobile and make sure we are responsive for ipad. ipad should feel more like the desktop version". So every ⚠️ and ❌ left in the last column of `GAP_ANALYSIS.md` is now work, unless it is physically impossible on a phone (then say why in the gap file). The iPad layout moves toward the desktop: persistent sidebar (done), right inspector pane, back and forward, tabs or split view, command palette and shortcuts on a hardware keyboard, denser multi pane screens (dashboard with the week beside it, board view). Work list and progress are in section 8b; update it with every commit.

## 8. What is left, in order

1. DONE (see session notes above).
2. DONE except screenshots (phone, tablet, merge editor need simulators: see 6.3). `REPORT.md` was to hold: phases with the commit ranges in section 5, every decision D1 to D25 summarised with the ⚑ ones marked, stubbed or fragile list (below), how to run and a manual checklist of at most 15 minutes covering the definition of done (fresh stack; desktop fixture migration; account created on mobile then used on desktop; same note on two devices; offline same field conflict and the merge editor; every gap row on mobile), and the screenshots in `report/screenshots/` (desktop dashboard, desktop merge editor and conflict badge, phone sidebar, page editor, dashboard, settings, merge editor, tablet dashboard, page editor, merge editor, the sign up error before its fix, the slash menu).
3. Optional polish: unify the conflict count shown in the sidebar and Settings with what the merge editor lists; mobile lint warnings (setState in effects in `SettingRow`, `RecipeScreens`, `PageEditor`; unused `_` parameters in `FileScreens` and `RecipeScreens`); run the report only checks (`bun run coverage`, `unused`, `audit`, `lint:rust:strict`) and read them.
4. DONE (see session notes).
5. (Done this session, nothing left running.) Cleanup that was needed: the server from `bun run stack` on 3100, Metro on 8093, the simulator hub on 4600, the debug desktop on 4568, maybe a stray one from the 4569 attempts. Then a final commit and `git push` (no PR), leaving `REPORT.md` untracked.

Stub, skip and fragile list for the report: phone files are hashed in memory (fine for a few hundred megabytes); "keep both" in the merge editor is text only, dates and numbers offer the two choices (D7); external calendars, CLI, agent files, tabs and split view, keyboard shortcuts, Vim keys, folder backups, Office conversion and OCR are desktop only (D14, D15); series (repeating sessions and calendar entries) are created and edited on the desktop only, and the phone edits single occurrences (D19); the assignment due session selection, the full dashboard briefing text and semester setup are simpler on the phone; saved views exist for Tasks only; inline math shows its source in the phone editor; importing pages, tasks and assignments from Nookly files is desktop only; "copy link" is missing on the phone (needs the `expo-clipboard` native module); password reset uses the console mailer stub; OAuth providers are wired but untested without real keys; everything was verified in simulators and debug desktop builds, never on a real phone, and simulator runs are not in CI; system dialogs cannot be tapped by my tooling; the branch stash incident (section 1).

## 8b. Mobile parity and iPad work list (new brief, 7b)

Tick items with the commit hash. Tests first; verify on the iPad and phone simulators; keep `GAP_ANALYSIS.md` marks and copy in step. No hyphen or dash copy. No edits to `packages/ui`.

iPad, desktop like (width 768 and up, bigger at 1000 and up):

- [x] N1 (built and running in the iPad simulator; key commands not verifiable without a hardware keyboard) native batch: `expo-clipboard` and a local Swift module `modules/nookly-keys` (UIKeyCommand on `UIApplication`, event `onShortcut`; hold Command shows the system's shortcut sheet). One rebuild of the dev client from a clone at a path without spaces. Hardware keys cannot be sent by my tooling, so the module also has `emit(id)` for the automation bridge and the Swift part stays unverified on a real keyboard: say so in the report.
- [x] I1 titlebar strip above the page: collapse sidebar, back, quick open field, sync status, settings
- [x] I2 command palette and quick open (modal; also the target of Command K and Command P)
- [x] I3 shortcuts (Settings list still to do): the desktop's list where it makes sense (new, search, sidebar, back, tabs), listed in Settings, Shortcuts
- [x] I4 right inspector beside a page: Attachments, Mentioned, Mentioned in, Relationships (desktop's right sidebar)
- [x] I5 dashboard as on the desktop: lists left, week calendar right; tasks board and calendar use the wide pane
- [ ] I6 tabs, and split view of two pages
- [ ] I7 Vim keys in the editor (per device setting, hardware keyboard)

New asks from the user (2026-10-20), after the list above:

- [x] C1 calendar: agenda kept; phone gets Day, 3 Days, Week as hour grids (`screens/TimeGrid.tsx`, model in `packages/shared/src/time-grid.ts`), iPad gets the desktop's Day, Work Week, Week, Month plus Agenda; blocks never overflow their column, narrow blocks show the title only. View choice is remembered (`calendar.view`). Desktop's `layoutLanes` now comes from the shared module.
- [x] L1 Linear style item pages: `ui/Property.tsx` (PropertyList, Property rows with expandable choices), a More menu (`ui/menu.tsx`, native action sheet, injectable for tests via `MenuProvider`; tests use `test/menu.ts`), compact sub-tasks, labels as a property row. Done for tasks and pages. [ ] L2 the other detail screens (session, exam, assignment, course, bookmark, recipe, calendar entry, deck, file, semester, study block) still use card per field: move them to PropertyList.
- [x] D1 details drawer: on a phone (and an iPad too narrow for the pane) the details of an open item sit behind the page like the sidebar turned around (`shell/DetailsDrawer.tsx` on `react-native-drawer-layout`, swipe anywhere, or More, Show Details). Swiping was not verified in a simulator (my tooling cannot swipe); the tree is covered by jest.
- [x] K1 shared colors: `packages/shared/src/calendar-style.ts` (item looks per kind, accent fallbacks, today marking) and `blocks/highlight-colors.ts` (`highlightCss`) are the one source; the desktop's Tailwind classes are checked against them by `features/sessions/calendar/calendar-style.test.ts` and `features/notes/highlight-style.test.ts`. Mobile has no hard coded hex left except the editor's yjs cursor fallback and shadows. Rule from the user: always use the same colors, shared.
- [ ] L3 sidebar rows reported by the user as only reacting when the text is hit exactly: the rows measure full width (304 by 40) so this could not be reproduced without real touches; ask which device and where (phone drawer or iPad).
- Dev bridge: `measure(label)` and `data` (the shared data functions) are available to simulator scripts; `tools/e2e/mobile.ts run phone "<script>"`. ada's phone data now has seeded calendar entries this week (throwaway).

Parity gaps (phone and iPad):

- [x] P1 copy link (menu item; `ui/clipboard.tsx` seam; pastes as a mention like the desktop)
- [x] P2 import pages, tasks, assignments from Nookly files (`packages/shared/src/data/portable-import.ts`, sheet `new/import`, Space screen row, palette command). Block types the phone's shared converter knows are kept; others become paragraphs. Custom block content is not validated beyond that. Desktop written samples in `generated/desktop-samples` are kept current by `db/portable_desktop_samples_tests.rs` (`NOOKLY_UPDATE_SNAPSHOTS=1 cargo test --lib db::portable_desktop_samples_tests`) and read by `portable-import.test.ts`.
- [ ] P3 saved views for Assignments, and saved views listed under modules in the sidebar
- [ ] P4 inline math rendered and editable in the editor
- [ ] P5 series for sessions and calendar entries (create, edit scope, delete)
- [ ] P6 assignment due session
- [ ] P7 dashboard briefing with links, semester setup wizard, decks piles screen
- [ ] P8 editor blocks: images, files, embeds, timelines, linked items, table column widths
- [ ] P9 merge editor "keep both" for dates and numbers (copy of the item holding the other value, D7)
- [ ] P10 impossible on a phone, document why: Office conversion and OCR, bookmark screenshots made by the desktop, CLI, agent files, folder backups, external calendars (D14)

Notes from the iPad work:

- The dev client on the iPad was built from a clone at `<scratchpad>/native/nookly` (path without spaces) and points at Metro on **8092**; run `EXPO_PUBLIC_AUTOMATION_URL=http://127.0.0.1:4600 bunx expo start --port 8092 --lan --dev-client --clear` in `apps/mobile` (not 8093). Without it the app falls back to some other Metro and the automation hub hears nothing. After any hub restart, terminate and launch the app.
- A React Native `Modal` that closed while the page behind it changed crashed the app (`RCTViewComponentView unmountChildComponentView` assertion), so the palette is an in window overlay. Avoid `Modal` for things that close on navigation.
- The iPad Pro 13 simulator rotated to landscape by itself after the build (all orientations are allowed on iPad now). Landscape is 1376 wide, so the details pane shows; portrait (1032) keeps it hidden unless the sidebar is collapsed.

## 9. Working agreements and cautions

- Never touch the user's real data: `/Applications/Nookly.app`, `~/Library/Application Support/com.nookly.app`, and anything of theirs listed in 6.3. Debug builds use `apps/desktop/src-tauri/.dev-data` or `NOOKLY_DATA_DIR` and their own settings and token files.
- Do not stash, rebase or switch branches in a checkout of this branch; do not open PRs; do not commit `REPORT.md`, `.env` or `report/`.
- Mobile UI: copy the desktop's look through the shared class lists, no edits to `packages/ui`, system dark mode in the simulators.
- Update this file, `DECISIONS.md` (new decisions, ⚑ for doubtful ones) and `GAP_ANALYSIS.md` (marks) whenever the state changes.
