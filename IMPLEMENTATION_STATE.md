# Implementation brief and state

> ## ⛔ DO NOT STOP WORKING. UNDER NO CIRCUMSTANCES.
>
> **Keep working until every item below is ticked and the final report at the end is written. There is no other reason to end a turn.**
>
> - **A batch is finished.** Pick the next unticked item.
> - **You want to report progress.** Write it in the progress log, commit, push, keep going.
> - **A server, Metro or the simulator stopped.** Restart it, or move to work that does not need it.
> - **A side request from the user is done.** Go straight back to this list.
> - **Context is filling up.** It compacts on its own; this file carries you over.
> - **Something needs a real device, the user's eyes or a decision.** Decide (record it in `DECISIONS.md`) or add it to "Needs the user", and move on.

**This file is a ready to run prompt and the handover file.** An agent told "read `IMPLEMENTATION_STATE.md` and get to work" reads this file, `AGENTS.md` and `docs/00-index.md`, then carries the list out from start to finish without human help. Keep it current: tick items, note findings, append to the progress log after every meaningful step.

The items come from the user's `NOTES.md` (2026-11-15, fourth round). `NOTES.md` is the user's own file: read it, never edit it.

## Rules

- **Do not ask, do not wait.** When something is ambiguous, decide: what the desktop app does beats `docs/`, which beats your own judgement; the phone deviates from the desktop only where touch demands it. Record non obvious decisions in `DECISIONS.md` and continue.
- **Never pretend.** Done means it works in the running app (screenshots you looked at critically) plus an automated test that would have caught the problem. If something cannot be verified here (real device feel), build the best version and put it under "Needs the user".
- **Safety, no exceptions.** Nookly is released and user data must never be lost. Never run migration or sync code against the user's real Nookly data, only copies and fixtures (`NOOKLY_DATA_DIR` scratch folders). Leave the user's own processes alone: ports 3000, 8081, 1420, the simulator "iPhone 17" `45B8BECE-...`, `/Applications/Nookly.app`. **Never merge into `main`, never push to `main`**, no force push to shared history, no tags, no pull requests. Never `git stash drop` or clear a stash. Kill processes by port or task, never `pkill -f` on the app binary.
- **Git.** Work on `feat/connected-platform`. Commit after every meaningful step, push often (`git push`).
- **Project rules (`AGENTS.md`).** Migrations append only and hashed; a test first for every fix or behaviour change (watch it fail); versions stay 1.0.0, but every user visible change gets its line in `CHANGELOG.md` under 1.0.0 and features a card in `whats-new.json`; copy has no em or en dashes and no hyphenated sentence structure; never modify primitives or tokens in `packages/ui` (add only); new entities and fields go through the schema layer the CLI generates from; dialogs and menus get an axe test; permanent actions use `ConfirmPermanentDialog`.
- **Mobile rules (`AGENTS.md`).** The desktop's Tabler icons only, the same icon per concept (`ui/kit/desktop-icons.test.ts`); exactly one sheet implementation (`apps/mobile/src/ui/sheet/`); motion only from `ui/motion.ts`; touch targets of 44pt or more; native iOS feel with Nookly's identity.
- Run new tests in isolation while working; the whole set at the end.

## How to run everything (this machine)

Worktree: `/Users/daniel/.t3/worktrees/nookly/t3-ed31ca16` (branch `feat/connected-platform`, tracking `origin/feat/connected-platform`, so a plain `git push`; the old branch `t3/continue-mobile-backend-improvements` and its worktree `t3-59771e54` were removed on 2026-11-13 after being fast forwarded into it). Nothing from the old checkout is installed here except what is listed below.

```sh
cp .env.example .env                 # then set PORT=3100 (the user's own dev server uses 3000); .env is gitignored
bun install
docker compose up -d --wait postgres minio     # containers nookly-postgres-1 (5433), nookly-minio-1 (9000, console 9001); volumes keep old data
bun run stack                        # migrations, then the server with watch mode on http://localhost:3100 (health: /health)
cd apps/mobile && EXPO_NO_TELEMETRY=1 bunx expo start --port 8092 --lan --dev-client --clear   # the dev client remembers port 8092
cd apps/desktop/src-tauri && cargo build                  # first build about 2 minutes
bun tools/fixtures/desktop.ts <empty scratch folder>      # disposable desktop data: 120 notes, 40 tasks, study data
cd apps/desktop && NOOKLY_DATA_DIR=<that folder> bun run tauri dev    # vite on 1420
```

- Always start the desktop with `NOOKLY_DATA_DIR` pointing at a scratch fixture. Without it the dev build opens the user's real Nookly data.
- Mobile: the dev client `app.nookly.mobile` is installed on the **iPhone 17 Pro** simulator `EF9F00F7-BA0F-491C-A3C7-97240AFBAF2B` (dark mode: `xcrun simctl ui <id> appearance dark`). The iPad Pro 13-inch (M5) is `ABFEE424-8EE0-4228-BCC2-1C9FDB94BE6D`. The user's own "iPhone 17" `45B8BECE-...` and anything on ports 3000, 8081 and 1420 are theirs, leave them. Native code changes need a rebuild of the dev client (`bunx expo run:ios -d <id> --port 8092`, from a path without spaces; this worktree has none). Expo Go is avoided. Screenshots: `xcrun simctl io <id> screenshot file.png`.
- Dev accounts in the dev Postgres: `ada` / `correct horse battery` (the desktop fixture's data), `grace` / `grace hopper compiler`. Server address in the apps: `http://localhost:3100`.
- Tests: `bun run test` (needs `TEST_DATABASE_URL=postgres://nookly:nookly@127.0.0.1:5433/nookly_test`, create the database once); single suites: shared `cd packages/shared && bunx vitest run`, frontend `cd packages/frontend && bunx vitest run <file>`, mobile `cd apps/mobile && bunx jest`, server `bun test apps/server/test/<file>`, Rust `cargo test --lib <filter>` (full `cargo test` is slow, run it alone).
- Automation (scripts that drive the apps): desktop `NOOKLY_AUTOMATION_PORT=4568` plus `bun tools/e2e/desktop.ts 4568 "<script>"` or `--shot out.png`; mobile `tools/e2e/mobile.ts` (hub; Metro must be started with `EXPO_PUBLIC_AUTOMATION_URL=http://127.0.0.1:4600`); `tools/e2e/page-client.ts` acts as another device on a page. See the comments in those files. These scripts are what produced the old "verified" claims, so they are not proof that a real user gets working sync.
- Nothing is guaranteed to be running. Start what you need (server, Metro, the desktop on a fixture, a simulator) and stop what you started when you are done.

## Items

Order: shared pieces first (the input field, the centred dialog, list rows and gestures), then the screens that use them, then the features both apps share.

### 1. Mobile: shared pieces

- [x] (2026-11-15, D69: a raised box with a hairline edge, accent edge, name and glow while focused; tests; on screen) Redesign the regular text input field. It looks flat and plain now; give it Nookly's style (depth, the squircle radius, a clear focus state), through `ui/` only, used everywhere.
- [x] (2026-11-15, the clear button asked for a percent of a height the row lacked; test; on screen) Bug: the round search bars (e.g. in the relationship picker) double their height once you start typing.
- [x] (2026-11-15, a field on its own in a card rounds with the card; test; on screen) The relationship picker's "kind of link" select trigger below the search bar is not rounded. Round it.
- [x] (2026-11-15, `FilterField` is the round `SearchField` on Notes, Jots and Trash, and the global search too; test) The "Filter notes" search bar on the Notes list gets the regular round search bar design (check every list page's search bar).
- [x] (2026-11-15, 12 under the close button as above and beside it; test; on screen) Dialogs (the centred floating card): the space below the close button equals its space to the right and top.
- [x] (2026-11-15, `ui/row-edge.tsx`: a page's gutter as context, rows reach out by it and pad back in, dividers stay as wide as the content; Row, tasks, notes, jots, assignments, bookmarks; tests; measured on screen, 0 to 402) List rows (tasks, notes, jots, every item list): the side padding moves from the list container into each row, so the pressed colour and swipe actions run from screen edge to edge.
- [x] (2026-11-15, `SwipeRow` rebuilt on a pan: follows the finger, the action's colour fills from the screen edge with its icon and name, rests open past half the button, acts past 55% of the row with a haptic at that point, a side without an action rubber bands, a touch stops it, Reduce Motion fades; `SWIPE`, `swipeDrag`, `settleSwipe` in `motion.ts`; tests; the feel needs a real finger, see Needs the user) Swipe actions on rows feel like iOS Mail: actions revealed from outside the screen edge, full swipe to act, spring motion from `ui/motion.ts`, haptics.
- [x] (2026-11-15, D70: the drawer wraps every route; back keeps the leftmost tenth, the sidebar takes the other nine tenths, the calendar's edge is that tenth too; test; the feel needs a real finger) Sidebar drag gesture: works on every page, from anywhere in the right 90% of the screen; only the leftmost 10% is for going back. Follows the finger, carries its speed on release.
- [x] (2026-11-15, measured in the dev build by the longest frame after a change: about 400ms per page change and per grouping change. Fixed: a preference change re-rendered every list that remembers anything and re-read the store on every render (now kept in memory, per key); the navigation theme was rebuilt on every page change, re-rendering every screen (memoised, the path read in a small `AppShell`); the sidebar rendered on every commit (memo) and closed only after the new page was built (now closes first); every row built its hidden swipe buttons (now on the first swipe); long lists build their first 24 rows with the page, the rest over the next frames (Notes 540 to 660ms became about 430ms). Tests for each. The rest is the cost of building a page in a dev build; release feel under Needs the user) Speed: navigation and view changes (filters, display options, sidebar nav) are slow. Measure, find the causes, fix them.

### 2. Mobile: sidebar

- [x] (2026-11-15, the blur ends where the list starts, its fade inside the header's lower edge; test; on screen) The header blur behind "Nookly" and the search button reaches too far down: unscrolled, it must not touch the Blobatar box at the top.
- [x] (2026-11-15, D71; test; on screen) The + at the bottom left opens a dialog (the centred card) instead of a bottom sheet.
- [x] (2026-11-15, D71, `SpacesDialog`; test; on screen) The three dots showing the hidden Spaces open a dialog with a search bar.
- [x] (2026-11-15, D71: every Space in order with a fixed line under the first three, dragged across it; test; on screen) Spaces can be dragged from that hidden Spaces dialog into the three shown in the sidebar (and back).
- [x] (2026-11-15, a full touch target with a 20pt icon, a dialog; test; on screen) The three dot button on a Space (Add Module, Space Settings) is bigger, and opens a dialog instead of a bottom sheet.

### 3. Mobile: list pages and modules

- [x] (2026-11-15, Set Dates in the row's menu, the badge and the Current label in the primary blue; tests; on screen) Semesters list: less crammed. "Set dates" moves into the row's three dot menu. The logo and the "Current" badge use the regular blue, not green.
- [ ] Decks: they are very buggy. Go through every deck flow (list, create, edit cards, study, results) against the desktop and fix all of it.
- [ ] Files list: thumbnails for files that have them on the desktop.
- [ ] Bookmarks: the floating paste bar moves up a little.
- [ ] Bookmarks: the filter options sheet is empty (bug). Fill it.
- [ ] Global search gets the same filter options as the desktop's Cmd+K search.

### 4. Mobile: Moodle

- [ ] Sign out and "Open in Moodle" are icon buttons in the page header.
- [ ] An open Moodle file: "Import to Nookly" is full width at the bottom (Open in Moodle is in the header now).
- [ ] The "Import to Nookly" sheet looks like the other Nookly sheets, not iOS's plain form fields.

### 5. Both apps

- [ ] Many more filter options on every list page (desktop and phone): every property a list's items have can be filtered on.
- [ ] Search (Cmd+K and the phone's search): typing an entity id like "TSK-" or "TSK" first shows results that contain it or match it fuzzily, then lists the tasks.
- [ ] Files: a lasting way to browse and find files by their labels (desktop and phone, synced), and a quiet nudge to label files that have none. Decide the design in `DECISIONS.md` first.

### 6. Final checks and report

- [ ] `bun run lint`, `bun run format:check`, `bun run typecheck`, `bun run test`, `cargo test` (in `apps/desktop/src-tauri`), `bun run duplication`; read the report only checks (`coverage`, `unused`, `audit`, `lint:rust:strict`).
- [ ] `CHANGELOG.md` and `whats-new.json` (1.0.0) describe what ships, once.
- [ ] Final report below.

## Needs the user

- On the phone with your own Moodle site: sign in from Settings, then check the course list, a course, a file with Import, and Moodle deadlines on the calendar.
- On a real phone (a release build): whether page changes and filter changes now feel quick.
- On a real phone: opening the sidebar with a swipe anywhere right of the leftmost tenth, and back from that tenth.
- On a real phone: the feel of swiping a task row (open on the button, full swipe to act, the haptic at the point).
- On a real phone: the editor caret and Undo after typing with the keyboard; "Add a sub-task" low on a task page staying above the keyboard; the feel of dragging; the editor toolbar on the keyboard and the slash menu; scanning a document.

## Progress log

- 2026-11-15: file refilled from the fourth round of `NOTES.md`. The previous rounds (all items done) are in git history up to 61d46e9d and `DECISIONS.md` up to D68.

## Final report

(Written at the end.)
