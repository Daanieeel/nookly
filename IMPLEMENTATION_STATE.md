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
- Version bumps via `bun tools/bump-version.ts patch|minor` (never major; report if a major would be needed). Every bump needs a `## x.y.z (date)` section in `CHANGELOG.md` and an entry in `whats-new.json` (card under `highlights` for a feature, a line under `more` for a smaller change) in the same commit. Desktop is 0.38.3, mobile 0.6.0 (`apps/mobile/package.json` and `app.json`), server 0.2.2 (the bump tool only touches the desktop).
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

## 7. Where work stopped (2026-10-20, late)

Everything is committed and pushed except `apps/mobile/src/ui/parts.tsx` and `parts.test.tsx` (new, tested, committed together with this file). Last full check run, all green (lint, `format:check`, `typecheck`, shared 254, mobile 167, frontend 2274 plus the expected fail, server 85, `cargo test` 1244, duplication 0.23%), before the last few commits (assignment due sessions, math in the editor): rerun them first.

What is running on this machine right now (all mine; stop them or reuse them): OrbStack with the compose containers, `bun run stack` on 3100 (log `/tmp/nookly-stack.log`), the automation hub on 4600 (`/tmp/hub.log`), Metro on 8092 (`/tmp/metro.log`), the iPhone 17 Pro and the iPad Pro 13 simulators booted in dark mode. Stop with: `kill $(lsof -tiTCP:8092 -sTCP:LISTEN)`, same for 4600 and 3100 (also `pkill -f "bun --watch src/index.ts"`), `docker compose stop`, `xcrun simctl shutdown <id>`.

**Do these next, in this order** (details in 8b):

1. F1 and F2 and F3 below (the user's late feedback on item pages and swiping). The `ui/parts.tsx` primitive for F2 is done; the plan is written down in F2. Read `screens/EntityScreen.tsx` (`OpenEntity`, `useEntityMenu`, `TaskDetail`, `Subtasks`), `shell/DetailsDrawer.tsx`, `shell/inspector.tsx`.
2. Find why a page made on the phone shows the rows editor instead of the live one (see "Open problems").
3. Verify what could not be verified: the formula drawing in the editor (P4), the details drawer swipe, the left drawer swipe change (F3).
4. L3, P3, P5, P7, P8, I7, the bookmark, recipe, calendar entry and file pages in the new style (parts), the final report, `GAP_ANALYSIS.md` marks (many changed: copy link, import, calendar views, shortcuts, tabs, due sessions, math), `DECISIONS.md` (see "Decisions to write").

Open problems and loose ends:

- **A page created on the phone shows the rows editor, not the live one.** Reproduce: script `const page = await data.createPage(db, space, 'note', 'Math test')` on the phone, wait for sync, open it. The server has the entity (`records`, type `note`, owner ada) and a Hocuspocus client (`bun tools/e2e/page-client.ts http://localhost:3100 ada "correct horse battery" <id> read`) gets the document, yet the phone's `docs.open` (`packages/shared/src/sync/docs.ts`, waits 4 s for `synced`) returns null, so `use-page-session.ts` falls back to rows. The server log shows `[onAuthenticate] No such page.` twice around then. Old pages (for example "Algorithms notes 1") do open live. Suspects: the first `docs.open` for a brand new page happens before the page's records reached the server (then the server refuses and the phone caches the refusal), or `ownerOf`. Nothing was changed for this.
- The red "finalizeAsync" LogBox error in the dev client appears right after Metro hot reloads `_layout.tsx` (the database is opened again while the old connection still has statements). Probably a development artifact only; not investigated.
- L3: the user said the sidebar rows "only work if I press the text exactly". The rows measure full width (304 by 40 points on the iPad) so it cannot be reproduced by measuring, and my tooling cannot send touches. Ask which device and screen. A guess: the phone's drawer has `swipeEdgeWidth` as wide as the screen, so a tap with a small drag becomes a drawer pan.
- The calendar entry page is still a form with a Save button (`CalendarEntryForm`).
- `GAP_ANALYSIS.md` and `DECISIONS.md` are behind (see below). Versions: desktop 0.38.3, mobile 0.6.0 were bumped with changelog and what's new entries for the desktop ones only.

Not verified on a real keyboard or by touch (my tooling cannot): the Swift key commands (`modules/nookly-keys`; the Command key sheet), swiping the right or left drawers, tapping the native action sheet of the More menu, the tap target complaint, keyboard shortcuts in general. Verified by jest, screenshots and script driven simulators: everything else listed as done.

History of earlier sessions (compact): phases 1 to 6 done and verified as described in section 5; a migration regression check with the rebuilt desktop passed (179 local rows merged with an account's data, backup made, none lost; the merge shows each default Space twice, cosmetic); two sync loops fixed (`runFiles` acted on session totals; a local change with nothing to send started a sync round: now `notifyLocalChange` checks `pendingCount` first); the server reports its real version; a fresh clone brings the stack up; `REPORT.md` exists (untracked) and needs a refresh for this branch's later work (screenshots in `report/screenshots/` are untracked too: desktop dashboard, phone dashboard, settings, page, week calendar, tasks before and after, math attempt, iPad shell, palette, inspector, split view).

## 7b. New brief (2026-10-20): full mobile parity and a desktop-like iPad

The user asked: "go for full implementation on mobile and make sure we are responsive for ipad. ipad should feel more like the desktop version". So every ⚠️ and ❌ left in the last column of `GAP_ANALYSIS.md` is now work, unless it is physically impossible on a phone (then say why in the gap file). The iPad layout moves toward the desktop: persistent sidebar (done), right inspector pane, back and forward, tabs or split view, command palette and shortcuts on a hardware keyboard, denser multi pane screens (dashboard with the week beside it, board view). Work list and progress are in section 8b; update it with every commit.

## 8. What is left, in order

See section 7 for the order and 8b for the list. In addition, from the first brief: the final `REPORT.md` refresh (untracked), the optional polish (unify the conflict count in the sidebar and Settings with the merge editor's list; mobile lint warnings; the report only checks `bun run coverage`, `unused`, `audit`, `lint:rust:strict`), and stopping what is running.

Stub, skip and fragile list for the report (current): phone files are hashed in memory; "keep both" in the merge editor is text only on desktop and phone alike (D7 says single values make a copy of the item: not built on either side, fix the text of D7); series (repeating sessions and calendar entries) are created and edited on the desktop only, the phone edits one occurrence (D19; `sessions.rs` is 2,600 lines of rules, a port would need its own project); Vim keys, saved views for Assignments, the assignment overview's display options (group, filter, order), editor blocks beyond text, tables and now formulas (images, files, embeds, timelines, linked items show as cards), the semester setup wizard and the decks piles screen are not on the phone; external calendars, CLI, agent files, folder backups, Office conversion, OCR, bookmark screenshots are desktop only by decision (D14, D15); a block type the phone has no editor for becomes a paragraph when a Nookly file is imported; password reset uses the console mailer stub; OAuth providers are wired but untested without real keys; everything was verified in simulators and debug desktop builds, never on a real phone, and simulator runs are not in CI.

## 8b. Mobile parity and iPad work list (new brief, 7b)

Tick items with the commit hash. Tests first; verify on the iPad and phone simulators; keep `GAP_ANALYSIS.md` marks and copy in step. No hyphen or dash copy. No edits to `packages/ui`.

iPad, desktop like (width 768 and up, bigger at 1000 and up):

- [x] N1 (built and running in the iPad simulator; key commands not verifiable without a hardware keyboard) native batch: `expo-clipboard` and a local Swift module `modules/nookly-keys` (UIKeyCommand on `UIApplication`, event `onShortcut`; hold Command shows the system's shortcut sheet). One rebuild of the dev client from a clone at a path without spaces. Hardware keys cannot be sent by my tooling, so the module also has `emit(id)` for the automation bridge and the Swift part stays unverified on a real keyboard: say so in the report.
- [x] I1 titlebar strip above the page: collapse sidebar, back, quick open field, sync status, settings
- [x] I2 command palette and quick open (modal; also the target of Command K and Command P)
- [x] I3 shortcuts (list in Settings, Keyboard Shortcuts; no rebinding): the desktop's list where it makes sense (new, search, sidebar, back, tabs), listed in Settings, Shortcuts
- [x] I4 right inspector beside a page: Attachments, Mentioned, Mentioned in, Relationships (desktop's right sidebar)
- [x] I5 dashboard as on the desktop: lists left, week calendar right; tasks board and calendar use the wide pane
- [x] I6 tabs (`shell/tabs.ts` pure, `tabs-store.ts` persisted, `TabStrip.tsx`) and split view (`SplitPane.tsx`: an item beside the page; More, Open Beside; Command Backslash; links inside the second pane open in the first). Shortcuts: Command T, W, Control Tab, Command Backslash. Dev bridge: `tabs.setRight(path)` in simulator scripts.
- [ ] I7 Vim keys in the editor: the desktop's is `features/notes/vim-extension.ts` (760 lines, TipTap `Extension`) plus `vim-core.ts` (pure). Not ported: it would have to become a plain ProseMirror plugin shared by both editors. Not started.

New asks from the user (2026-10-20), after the list above:

- [x] C1 calendar: agenda kept; phone gets Day, 3 Days, Week as hour grids (`screens/TimeGrid.tsx`, model in `packages/shared/src/time-grid.ts`), iPad gets the desktop's Day, Work Week, Week, Month plus Agenda; blocks never overflow their column, narrow blocks show the title only. View choice is remembered (`calendar.view`). Desktop's `layoutLanes` now comes from the shared module.
- [x] L1 Linear style item pages: `ui/Property.tsx` (PropertyList, Property rows with expandable choices), a More menu (`ui/menu.tsx`, native action sheet, injectable for tests via `MenuProvider`; tests use `test/menu.ts`), compact sub-tasks, labels as a property row. Done for tasks and pages. [x] L2 (mostly): exam, assignment, course, deck, session, study block and semester use the property card (`ui/property-rows.tsx`: ChoiceProperty, DayProperty, TextRow, NumberRow; `PropertyList` keeps one row open at a time). Still the old field cards: bookmark, recipe, calendar entry (form with Save), file, jot. Do these with P5 (calendar entry series).
- [x] D1 details drawer: on a phone (and an iPad too narrow for the pane) the details of an open item sit behind the page like the sidebar turned around (`shell/DetailsDrawer.tsx` on `react-native-drawer-layout`, swipe anywhere, or More, Show Details). Swiping was not verified in a simulator (my tooling cannot swipe); the tree is covered by jest.
- [x] K1 shared colors: `packages/shared/src/calendar-style.ts` (item looks per kind, accent fallbacks, today marking) and `blocks/highlight-colors.ts` (`highlightCss`) are the one source; the desktop's Tailwind classes are checked against them by `packages/shared/src/desktop-drift.test.ts` (it reads the desktop's files). Mobile has no hard coded hex left except the editor's yjs cursor fallback and shadows. Rule from the user: always use the same colors, shared.
- [ ] L3 sidebar rows reported by the user as only reacting when the text is hit exactly: see section 7, open problems.
- Dev bridge: `measure(label)` and `data` (the shared data functions) are available to simulator scripts; `tools/e2e/mobile.ts run phone "<script>"`. ada's phone data now has seeded calendar entries this week (throwaway).

User feedback 2026-10-20 (late), to do next, in this order:

- [ ] F1 Corner radius in the wrong place on item pages (assignment page screenshot): the details drawer rounds the page below the native header, so black shows above the rounded corners. The whole screen, header included, has to slide and be rounded like the left sidebar's page: hide the native header on item pages and draw our own top bar (back, key, More) inside the drawer's page.
- [ ] F2 Main content versus details, for every item type (notes, jots, tasks, sub tasks, semesters, exams, assignments, courses, sessions, study blocks, decks, recipes, bookmarks, files, calendar entries): the main container holds only what is in the middle of the desktop's page (title, the page or description editor, sub tasks, the item's own lists: a deck's cards, a course's exams and assignments, a semester's courses, a study session's actions). Every property and setting (the property card, labels, links, status, dates, course, room, grade ...) goes in the details sidebar: the right drawer on a phone, the inspector beside the page on a wide iPad, and the details of a split pane. Do it by giving each detail component a `Main` and a `Details` part. Descriptions: tasks, sub tasks, exams and assignments get the description editor in the main part (rows editor; only note and jot pages try the live document). Update the tests.

- [ ] F3 Swiping to the navigation sidebar on a phone. The user: swiping right on an item page must open the nav sidebar, not go back to the previous page; going back only when the drag starts at the very edge of the screen; "you should not have to navigate all the way back to access the nav bar". Today the sidebar is the drawer of the `(drawer)` route group (`app/(drawer)/_layout.tsx`, `swipeEdgeWidth` as wide as the screen), and item pages are pushed over it by the root `Stack`, so on an item page there is no drawer and the swipe is the system back gesture. Plan: make the sidebar a root level left drawer around the whole stack (phone only; `react-native-drawer-layout` is already a dependency, `shell/DetailsDrawer.tsx` shows its use; `ui/inset-page.tsx` `PageEdge` reads `useDrawerProgress` from `expo-router/drawer` and must read it from `react-native-drawer-layout` instead; the `(drawer)` group becomes a plain stack with a menu button that opens the root drawer). Keep the system back gesture at the screen edge only. Watch the two drawers on item pages: the library's pan gesture (`Drawer.native.tsx`, `activeOffsetX([-10, 10])`, `hitSlop` of `swipeEdgeWidth`) activates in both directions, so the inner right hand details drawer may take a right swipe before the outer left drawer sees it; test on the simulator by scripting nothing: ask the user to swipe, or find a directional activation (a `gestureHandlerProps`, a wrapper gesture that fails on the wrong direction, or give only the outer drawer the full width swipe and the inner one an edge strip on the right). Update `DetailsDrawer` too, and the tests.

Parity gaps (phone and iPad):

- [x] P1 copy link (menu item; `ui/clipboard.tsx` seam; pastes as a mention like the desktop)
- [x] P2 import pages, tasks, assignments from Nookly files (`packages/shared/src/data/portable-import.ts`, sheet `new/import`, Space screen row, palette command). Block types the phone's shared converter knows are kept; others become paragraphs. Custom block content is not validated beyond that. Desktop written samples in `generated/desktop-samples` are kept current by `db/portable_desktop_samples_tests.rs` (`NOOKLY_UPDATE_SNAPSHOTS=1 cargo test --lib db::portable_desktop_samples_tests`) and read by `portable-import.test.ts`.
- [ ] P3 saved views for Assignments, and saved views listed under modules in the sidebar
- [~] P4 inline and block math drawn in the editor: code done and committed (`editor/math.ts` KaTeX as MathML, `math-views.ts` node views, tap a formula to edit its LaTeX, the person's macros from Settings passed as `macros`, `katex` added to `apps/mobile`), `math.test.ts` passes, but NOT seen working: the test page opened with the rows editor (open problem in section 7). Check on an old page: add `$x^2$` through the page client or a script, open it live.
- [ ] P5 series for sessions and calendar entries (create, edit scope, delete)
- [x] P6 assignment due session: `setAssignmentDueBeforeSession` and a read time resolution that mirrors `assignments.rs` (`resolveDue` in `packages/shared/src/data/study.ts`: the next session that has not started, a picked session, cancelled or trashed sessions move the day on). This also fixed a real bug: the phone used to show the stored due day of an assignment that follows sessions. Row on the assignment page: On a day or Before a session, days before, which session. Tests `assignment-due.test.ts`, `study.test.tsx`. The dashboard and lists use the resolved day.
- [ ] P7 dashboard briefing with links, semester setup wizard, decks piles screen
- [ ] P8 editor blocks: images, files, embeds, timelines, linked items, table column widths
- [x] P9 merge editor "keep both": the desktop only does it for text too, so the phone matches. D7's text about a copy of the item was never built: correct D7.
- [ ] P10 impossible on a phone, document why: Office conversion and OCR, bookmark screenshots made by the desktop, CLI, agent files, folder backups, external calendars (D14)

Notes from the iPad work:

- The dev client on the iPad was built from a clone at `<scratchpad>/native/nookly` (path without spaces) and points at Metro on **8092**; run `EXPO_PUBLIC_AUTOMATION_URL=http://127.0.0.1:4600 bunx expo start --port 8092 --lan --dev-client --clear` in `apps/mobile` (not 8093). Without it the app falls back to some other Metro and the automation hub hears nothing. After any hub restart, terminate and launch the app.
- A React Native `Modal` that closed while the page behind it changed crashed the app (`RCTViewComponentView unmountChildComponentView` assertion), so the palette is an in window overlay. Avoid `Modal` for things that close on navigation.
- The iPad Pro 13 simulator rotated to landscape by itself after the build (all orientations are allowed on iPad now). Landscape is 1376 wide, so the details pane shows; portrait (1032) keeps it hidden unless the sidebar is collapsed.

## 8c. Decisions to write in `DECISIONS.md` (not written yet)

D26 calendar as hour grids, views per width, colors shared (`calendar-style.ts`, drift test); D27 the iPad window (titlebar, palette, shortcuts, tabs, split, details pane, `Modal` avoided because it crashed); D28 item pages as property cards, the More menu, parts for main and details (F2); D29 assignment due days resolved at read time like the desktop (fixes a bug); D30 Nookly file import rules (unknown blocks become paragraphs; samples both ways); D31 sync rounds only when something is pending; D32 test seams instead of module mocks (window width, menu, clipboard, file picker, key system). Correct D7 (keep both is text only).

## 9. Working agreements and cautions

- Never touch the user's real data: `/Applications/Nookly.app`, `~/Library/Application Support/com.nookly.app`, and anything of theirs listed in 6.3. Debug builds use `apps/desktop/src-tauri/.dev-data` or `NOOKLY_DATA_DIR` and their own settings and token files.
- Do not stash, rebase or switch branches in a checkout of this branch; do not open PRs; do not commit `REPORT.md`, `.env` or `report/`.
- Mobile UI: copy the desktop's look through the shared class lists, no edits to `packages/ui`, system dark mode in the simulators.
- Lint forbids module mocking (`jest.mock`) and `typeof`: use the seams in `apps/mobile/src/test/` (`renderScreens(routes, data, url, { width, menu, clipboard, filePicker })`, `RecordingMenu`, `RecordingClipboard`, `FixedFilePicker`, `ShortcutHost keys=`).
- The user's rules this session: always use the same colors, shared between desktop and phone (`packages/shared/src/calendar-style.ts` and friends); never use em or en dashes in copy; update this file whenever the state changes.
- Update this file, `DECISIONS.md` (new decisions, ⚑ for doubtful ones) and `GAP_ANALYSIS.md` (marks) whenever the state changes.
