# Implementation state: the connected platform

This file is the handover. A coding agent that reads it, plus `AGENTS.md`, `GAP_ANALYSIS.md` and `DECISIONS.md`, should be able to continue without the original conversation. Keep it current with every commit.

## 1. Where things are

- Branch: `feat/connected-platform`. It branched from `mobile-app-and-backend` at `0b5bd915`. 71 commits of this work (`git rev-list --count 0b5bd915..HEAD`), all pushed. Commit and push to `origin feat/connected-platform`. **No PRs, no merges.**
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
- Version bumps via `bun tools/bump-version.ts patch|minor` (never major; report if a major would be needed). Every bump needs a `## x.y.z (date)` section in `CHANGELOG.md` and an entry in `whats-new.json` (card under `highlights` for a feature, a line under `more` for a smaller change) in the same commit. Desktop is 0.38.4, mobile 0.8.0 (`apps/mobile/package.json` and `app.json`), server 0.2.2 (the bump tool only touches the desktop).
- User facing copy: no em or en dashes and no hyphenated sentence structure.
- Never modify existing primitives or tokens in `packages/ui` (add only). `outline` variants of Button and Badge are rare. Icon only buttons need a tooltip or label. Dialogs and menus get an axe test (`vitest-axe`). Permanent actions use `ConfirmPermanentDialog` (phone: a confirmation in the app's sheet, D35; D18's system alert is gone).
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

Single suites: shared `cd packages/shared && bunx vitest run` (254); frontend `cd packages/frontend && bunx vitest run <file>` (2274 pass plus one expected fail); mobile `cd apps/mobile && bunx jest` (167 plus 2 in `ui/parts`); server `bun test apps/server/test/<file>`; Rust `cargo test --lib <filter>`. `tools/gap.py "<row text>" "<mark>" ["note"]` sets a Done mark in `GAP_ANALYSIS.md`.

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
- Native app id `app.nookly.mobile`. The dev client on both simulators was built from a clone at a path without spaces (the native build scripts break on the space in "Open Source"): `<scratchpad>/native/nookly` (scratchpad is temporary and will be gone; to rebuild: `git clone` this branch into a folder with no spaces, `bun install`, `cd apps/mobile && bunx expo run:ios -d <simulator id> --port 8092`, then `xcrun simctl install` the same `Nookly.app` on the other simulator, found with `xcrun simctl get_app_container <id> app.nookly.mobile`). Rebuild only when native code changes (this branch added `expo-clipboard` and the local Swift module `modules/nookly-keys`, and iPad orientation in `app.json`). Expo Go is avoided because its "Open in Expo Go?" system dialog cannot be tapped.
- Metro: the dev client remembers **port 8092**. `cd apps/mobile && EXPO_PUBLIC_AUTOMATION_URL=http://127.0.0.1:4600 EXPO_NO_TELEMETRY=1 bunx expo start --port 8092 --lan --dev-client --clear`, hub `bun tools/e2e/mobile.ts hub 4600` left running, then `xcrun simctl terminate` and `launch <id> app.nookly.mobile`. On any other port the app falls back to the user's own Metro on 8081 (which serves this checkout without the automation hook) and scripts hang with no answer. After a hub restart, relaunch the app.
- Scripts: `bun tools/e2e/mobile.ts run phone|tablet|phone-editor|tablet-editor "<script>"`. Helpers: `press(label, nth)`, `type(label, value)`, `sleep`, `labels()`, `screenText()`, `measure(label)` (window rectangle of a pressable), plus `db`, `sync`, `queryClient`, `router`, `data` (the shared data functions, to set a scene: `await data.createCalendarEntry(db, space, {...})`), `tabs` (iPad tab actions); the `-editor` devices run inside the editor web view with `editor`, `doc`, `awareness`. `bun tools/e2e/page-client.ts <server> <user> <pass> <entityId> append|read [text]` acts as another device on a page. A device counts as `tablet` when the simulator is an iPad.
- Gotchas: after Metro hot reloads shared code, the automation context may hold the old runtime objects, so relaunch the app (`simctl terminate` then `launch`) before measuring sync. On the iPad the Welcome route stays mounted under sign in, so `press("Sign In", n)` indexes shift (press the last). Do not call `router.dismissAll()` with no stack (dev toast "POP_TO_TOP not handled"). Screenshots: `xcrun simctl io <id> screenshot file.png`.

### 6.4 Local test data (disposable)

Dev Postgres holds accounts `ada` (`correct horse battery`, the desktop fixture's 588 items and files) and `grace` (`grace hopper compiler`, created on the iPad from the same data). These are local throwaway fixtures. Fixture task TSK-3 (id `b5c5b4af-0b43-4245-9e1a-385048ef8f0d`) had its title changed by latency probes in both accounts. The iPad simulator is signed in as `ada` now (it had been `grace`; check with `sync.store.getState().user`), the phone as `ada`. `credentials.txt` in the repository root (excluded from git) lists both. The phone's data holds seeded calendar entries for this week and a test page "Math test" (throwaway). The scratchpad folder with fixtures and screenshots is temporary; regenerate fixtures with `tools/fixtures/desktop.ts`.

## 7. Where work stopped (2026-10-21)

Everything is committed (push before stopping: `git push origin feat/connected-platform`). Last full run, all green: `bun run lint` (warnings only), `format:check`, `typecheck`, shared 269, mobile 230, `duplication` 0.27%. Not rerun this session: the frontend suite (2274), the server suite and `cargo test`, because no desktop or server code changed; rerun them before a release (`bun run test` with `TEST_DATABASE_URL`, `cargo test`).

What is running on this machine right now (all mine; stop them or reuse them): OrbStack with the compose containers, `bun run stack` on 3100 (log `/tmp/nookly-stack.log`), the automation hub on 4600 (`/tmp/hub.log`), Metro on 8092 (`/tmp/metro.log`), the iPhone 17 Pro and iPad Pro 13 simulators booted in dark mode. Stop with: `kill $(lsof -tiTCP:8092 -sTCP:LISTEN)`, same for 4600 and 3100 (also `pkill -f "bun --watch src/index.ts"`), `docker compose stop`, `xcrun simctl shutdown <id>`.

The brief of 2026-10-21 was: use `PAGES.md` to go over the pages already built and make them match the desktop, then finish everything, no questions. Done in this session (section 8b has the list): F1, F2, F3 (item pages split into page and details, own top bar, root sidebar drawer), the open problem of pages made on the phone (D34), L3's likely cause (taps that drift), and every page of `PAGES.md`. `GAP_ANALYSIS.md` ends with a page by page table, `DECISIONS.md` has D26 to D34 (and D7 corrected).

Open problems and loose ends:

- **Not verified by touch** (my tooling cannot send touches or hardware keys): swiping the sidebar or the details drawer and the back swipe edge (D29), the Swift key commands (`modules/nookly-keys`), the native action sheet of More, the sidebar row tap target (L3: the likely cause was a pan activating at 5 points of drift; now 16, D29). Everything else was checked with jest, screenshots and script driven simulators.
- The red "finalizeAsync / database is locked" LogBox error in the dev client after Metro hot reloads `_layout.tsx` is a development artifact (the database is opened again while the old connection has statements).
- Not on the phone, listed in `GAP_ANALYSIS.md` and D33: restoring a backup, external calendars, Vim keys (I7), saved views for Assignments, the semester wizard, the PDF paged viewer, series (D19), editor blocks beyond text, tables and formulas (P8), the mascot art.
- `REPORT.md` (untracked) still needs a refresh for the later work; its screenshots in `report/screenshots/` are older.
- `apps/mobile` is 0.8.0 (`package.json`, `app.json`); desktop 0.38.4, server 0.2.2.

History of earlier sessions (compact): phases 1 to 6 done and verified as described in section 5; a migration regression check with the rebuilt desktop passed; two sync loops fixed; the server reports its real version; a fresh clone brings the stack up.

## 8. What is left

In order: stop what is running; rerun the full suites (see 7); refresh `REPORT.md`; the not on the phone list in 7 if the user wants any of it; touch checks on a real device.

Stub, skip and fragile list for the report (current): phone files are hashed in memory; "keep both" in the merge editor is text only on desktop and phone alike (D7); series (repeating sessions and calendar entries) are created and edited on the desktop only, the phone edits one occurrence (D19); Vim keys, saved views for Assignments, editor blocks beyond text, tables and formulas, the semester setup wizard, the PDF viewer and restoring a backup are not on the phone; external calendars, CLI, agent files, folder backups, Office conversion, OCR, bookmark screenshots are desktop only by decision (D14, D15); a block type the phone has no editor for becomes a paragraph on import; password reset uses the console mailer stub; OAuth providers are wired but untested without real keys; everything was verified in simulators and debug desktop builds, never on a real phone, and simulator runs are not in CI.

## 8b. Work list (all ticked unless said)

Brief 7b (full parity, desktop like iPad): N1, I1 to I6, C1, L1, L2, D1, K1, P1, P2, P6, P9 done earlier. This session:

- [x] F1 item pages: native back, with details and more as native bar buttons (`EntityScreen.tsx` `BarActions`). Header `+` buttons are native too. Sidebar and details swipe back to the page first (`shell/panes.tsx`). Words in sidebar rows and buttons never take the touch (0.7.1). Not run on a device yet: check the native bar buttons and both swipes there.
- [x] F2 page and details for every type (`ItemParts.tsx`, `ui/parts.tsx`, `DetailsBody` in `shell/inspector.tsx`); tests in `item-parts.test.tsx`.
- [x] F3 the sidebar is the root drawer (`shell/SidebarDrawer.tsx`); `app/(drawer)/_layout.tsx` is a plain stack with a menu button. Swipe unverified.
- [x] L3 guess fixed (D29); still ask the user.
- [x] P3 saved Task views listed under Tasks in the sidebar and opened with `/tasks?view=`; Assignments views stay off the phone.
- [x] P4 formulas: the page that failed to open live now does (D34), so check the formula drawing on an old page by adding `$x^2$` through `bun tools/e2e/page-client.ts` and opening it.
- [x] P5 series: stays desktop only (D19).
- [x] P7 dashboard briefing with links (done), decks piles screen (not built), semester wizard (not built).
- [~] P8 editor blocks beyond text: not built.
- [x] P10 documented in D14, D15, D33.
- [ ] I7 Vim keys in the editor: not started.

Pages, each with tests: Notes and Jots (`PageLists.tsx`), Courses gallery, Exams timeline, Decks grid (`StudyGalleries.tsx`), Semesters (`SemesterList.tsx`), Sessions and Calendar module (`CalendarScreen` with `spaceId`), Files, Bookmarks (`BookmarkList.tsx`), Recipes, Grades (`GradesScreen.tsx`), Pinned (`PinnedScreen.tsx`), Trash, Dashboard (`DashboardScreen.tsx`, `DashboardPanels.tsx`, `DashboardBriefing.tsx`, `briefing-runs.ts`, `dashboard-model.ts`), Tasks overview, Assignments overview (`AssignmentsScreen.tsx`, `assignment-view.ts`), Deck page (`DeckPage.tsx`), course tiles, exam decks, semester stats (`StudyDetail.tsx`, `PlannerScreens.tsx`), session Jot and Note, task stepper (`TaskDetail.tsx`), Settings sections, search, LaTeX and Backup (`screens/settings/`). New shared data functions with tests: `listPageSummaries`, `courseSemesters`, `addFileLink`, `createSessionPage`.

## 8d. Mobile inputs as one bottom sheet, touch sizes (2026-10-21, user brief)

The user asked (with an inventory step they approved): every desktop input on the phone becomes the app's own bottom sheet styled like the desktop, menus get icons and the desktop's items, confirmations become sheets too, every control is at least 44pt or 48dp, verified in light and dark with before and after screenshots. Answers they gave: one in app sheet (not the native form sheet), menus as on the desktop (More keeps Show Details and Open Beside), long press menus on every row, confirmations as sheets, Tabler icons on the native bar buttons where possible, keep the system `Switch`, leave `PageEditor.tsx` (the old rows editor and its block menu) out.

Built (D35):

- `ui/sheet/Sheet.tsx`: `SheetFrame` (backdrop, handle, title, back, steps, swipe down, keyboard lift), `Sheet` (in a `Modal`, or a pushed step when opened inside another sheet), `RouteSheet`; `route.tsx` (`sheetRoute`, `SHEET_ROUTE`, `useCloseSheet`); `SheetHost.tsx` (menus and confirmations from code, `useMenu()` uses it); contents `OptionList`, `DayPicker` and `CalendarPanel`, `MenuList` (icons, separators, destructive last, `submenu` and `page` steps), `Confirm`, `DisplayParts` (layout tiles, select rows, switch rows, filter fields).
- `ui/touch.ts` (`MIN_TOUCH`, `touchSlop`, `gapBetween`, `FIELD_HEIGHT`, `TOUCH_ROW`), applied in `Button`, `IconButton`, `Chip`, `Field`, `Row`, `Property`, `Band`, `Swatch` (new), the sidebar, the editor toolbar and its slash menu rows, and single cases (assignment checkbox, task stepper, gallery pill, grades input, share segments, iPad titlebar and tabs).
- Migrated: property rows (`ChoiceProperty`, `DayProperty`, `SheetProperty`, `TimePicker`), `DateField`, `SelectField` and `MultiSelectField` (new), Space, Course and Exam pickers, the assignment due steps, labels, link picker (`LinkPicker`, now a sheet from Related and a step of the item menu), move (`MovePicker`, `/new/move` removed), Tasks and Assignments Filter and Display, New Task, New Semester, semester setup's term, recipe kind and tags, file kind, settings with more than three choices, Add Module, Add Course, semester menu and rename, every system alert (Trash, Space settings, account deletion), all 18 create routes and the icon picker.
- Item menus: `screens/entity-actions.tsx` (`useEntityActions`, `useEntityMenu`) for the More menu and long presses on every item row; `EntityPickers.tsx` holds `LabelPicker` and `MovePicker`.
- Native bar buttons draw Tabler PNGs (`assets/toolbar/`, rendered from `@tabler/icons` outline SVGs with a small AppKit script, 22pt at 1x to 3x; `ui/toolbar-icons.ts`).
- `@react-native-community/datetimepicker` is removed (package and app.json plugin); the dev client still carries it until the next native rebuild, which is harmless.
- Tests: `ui/sheet/sheet.test.tsx`, helpers in `test/sheet.ts` (`openRow`, `choose`, `pickDay`, `pickTime`); `RecordingMenu` records confirmations too. Mobile jest: 262 pass.
- Screenshots (scratchpad, temporary): before and after, light and dark, in `<scratchpad>/shots/`.

Open: the swipe down, the keyboard lift and the long press were not done with a finger (the tooling drives props, not touches); CHANGELOG and whats-new are numbered by the desktop, so the mobile bump to 0.8.0 has no entry there, as with every earlier mobile bump (ask the user).

## 8c. Decisions written

D26 to D34 are in `DECISIONS.md`, and D7 is corrected.

## 9. Working agreements and cautions

- Never touch the user's real data: `/Applications/Nookly.app`, `~/Library/Application Support/com.nookly.app`, and anything of theirs listed in 6.3. Debug builds use `apps/desktop/src-tauri/.dev-data` or `NOOKLY_DATA_DIR` and their own settings and token files.
- Do not stash, rebase or switch branches in a checkout of this branch; do not open PRs; do not commit `REPORT.md`, `.env` or `report/`.
- Mobile UI: copy the desktop's look through the shared class lists, no edits to `packages/ui`, system dark mode in the simulators (light mode too when verifying a UI change).
- Mobile inputs (AGENTS.md, Mobile UI): every desktop popover, select, picker, menu and confirmation is the one shared bottom sheet (`apps/mobile/src/ui/sheet/`), never a system alert, action sheet or picker, never an accordion. Every tappable thing is at least 44 points (iOS) or 48 (Android) through `ui/touch.ts`. See D35.
- Lint forbids module mocking (`jest.mock`) and `typeof`: use the seams in `apps/mobile/src/test/` (`renderScreens(routes, data, url, { width, menu, clipboard, filePicker })`, `RecordingMenu`, `RecordingClipboard`, `FixedFilePicker`, `ShortcutHost keys=`).
- The user's rules this session: always use the same colors, shared between desktop and phone (`packages/shared/src/calendar-style.ts` and friends); never use em or en dashes in copy; update this file whenever the state changes.
- Update this file, `DECISIONS.md` (new decisions, ⚑ for doubtful ones) and `GAP_ANALYSIS.md` (marks) whenever the state changes.
