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

The items come from the user's `NOTES.md` (2026-11-14, second round). `NOTES.md` is the user's own file: read it, never edit it.

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

Reference images are in `.reference-images/` (gitignored, the user's own): `linear-examples/*` (the Linear app), `sidebar-spacer-switcher-bug.jpeg`, `choose-emoji-positioning-bug.png`, `desktop/space switcher blur bug.png`. Look at them before working on the item that names them.

The order below builds shared pieces first (the Linear style sheets), then the screens that use them.

### 0. First step

- [x] (done in the previous round, D60) The backmost background is a deep charcoal instead of full black on mobile and desktop. Check it still holds after this round's changes.

### 0b. Splash screen (asked 2026-11-14)

- [x] (2026-11-14, seen in the simulator after the rebuild) The user's new splash (`~/Downloads/splash.png`, flame over "Nookly" on #111111) replaces the old one entirely: `apps/mobile/assets/splash.png` (transparent corners filled with #111111), splash background #111111 in `app.json`. Still to see in the simulator after the next dev client rebuild (the `ios/` folder is generated).

### 1. Mobile: Linear style foundations (do first, the later items use them)

The user allows touching and replacing our phone's sheet and picker components for this (still exactly one sheet implementation, motion from `ui/motion.ts`, Tabler icons). Copy Linear exactly:

- [x] (2026-11-14, D65, checked on screen) **Floating picker card** (`linear-examples/status-picker.jpeg`, `label-picker.jpeg`, `milestone-picker.jpeg`): a rounded card floating in the middle of the screen over a dimmed backdrop, title top left, a round close button top right, optional pill search field ("Add labels..."), big rows (icon or colour dot, title, checkmark on the right for the chosen one). Sits above the keyboard when the search is focused. This replaces the generic list style bottom sheet for every select and picker (status, priority, labels, Space, course, link target, ...).
- [x] (2026-11-14, `DisplayGroup`, checked on screen) **Grouped bottom sheet** (`display-options.jpeg`, `filter-list-sheet.jpeg`): grabber, content as rounded grouped cards with separators, an optional pinned search field with an icon.
- [x] (2026-11-14, `InlineSelect`, checked on screen) **Inline menu** (`display-options-select-open.jpeg`): a value with an up/down chevron opens a blurred floating menu next to it with a checkmark on the chosen option.
- [x] (2026-11-14, `ui/sheet/Compose.tsx` pieces plus `SheetHeader` and `SheetFooter`; used by item 5) **Compose sheet** (`create-new-ticket.jpeg`): full height sheet, round close button top left, a context pill in the middle (the Space), round send button top right (disabled until there is a title), big title field, description below as a full block editor, a horizontally scrolling row of property pills (status, date, labels, ...) above the editor's toolbar on the keyboard.
- [x] (2026-11-14, `Segmented` as pills; look again on the calendar in item 6) **Tab switcher** redesign (used on the calendar and elsewhere): fits Nookly's style, not flat; Linear's pill tabs (`display-options.jpeg` top: "Assigned" chip on a raised pill, others plain) are the model.
- [x] (D65; `inline-menu.test.tsx`, card tests in `sheet.test.tsx`) Record the design in `DECISIONS.md` and add tests (rendering, selection, close, search).

### 2. Mobile: sidebar and navigation

- [x] (2026-11-14, bands of weaker blur under it, on screen) The header blur behind "Nookly" and the search button fades out as a gradient, no hard edge at its bottom.
- [x] (2026-11-14, on screen) Nav items get a bit more padding on the left only, so they no longer line up with the header box.
- [x] (2026-11-14, callout size, 500/600 weight; details rows too; on screen) Nav and detail sidebar item labels: one font size smaller, one weight heavier; icon size and opacity unchanged; the active nav item's icon is not coloured.
- [x] (2026-11-14, each icon box had no height; test; measured on screen) Bug: the Space icons at the bottom of the sidebar are misaligned (`sidebar-spacer-switcher-bug.jpeg`: the icons sit lower than + and the other buttons).
- [x] (2026-11-14, `GlassButton` on `expo-glass-effect`, dev client rebuilt) The search (magnifying glass) button in the sidebar header is a native button.
- [x] (2026-11-14, `TOP_LEVEL_SCREEN` gestureEnabled false on the top level stack; test) Navigating via nav items keeps Cmd + Left/Right for back and forward, but the swipe from the screen edge no longer navigates back.

### 3. Desktop

- [x] (2026-11-14, `-top-3` instead of `-top-10`; test; not yet looked at in the running desktop) The blur gradient behind the Space switcher at the bottom of the nav sidebar reaches too far up and covers the last item (`desktop/space switcher blur bug.png`). Make it shorter.
- [x] (2026-11-14, test) Swap the "Split" button and the sync indicator in the titlebar.

### 4. Mobile: markdown editor

- [x] (2026-11-14, the placeholder is drawn over the editor, not as a `::before` in its empty line, which kept WebKit from taking text there; typing into an empty page checked in the simulator; tests) An empty editor showing "Write something" shows a blinking cursor when tapped.
- [x] (2026-11-14, same cause as the caret: the placeholder inside the text) Bug: tap into an empty editor, close the keyboard, tap again: nothing happens until the page is reopened. Tapping must always focus.
- [x] (2026-11-14, `undo.test.ts`; in the simulator typed text, Undo twice, both steps came back out. Likely the same empty page cause: text typed there never reached the editor, so there was nothing to undo) Undo and redo buttons work.
- [x] (2026-11-14, `off` in the editor state, undo and redo too; tests) Indent and outdent buttons are disabled when they would do nothing.
- [x] (2026-11-14, `list-switch.test.ts`) With a list active, tapping another list type (bullet, ordered, todo) converts the list to that type.
- [x] (2026-11-14, the toolbar is cleared when the page loses focus, before the editor reports back) Leaving the page with the keyboard open: the toolbar above the keyboard disappears together with the keyboard, not a moment later floating mid screen.
- [x] (2026-11-14) The hide keyboard button gets a small chevron down on the keyboard icon.
- [x] (2026-11-14, a description keeps one line of room, no padding under it; test; on screen) Embedded editors (tasks, assignments, courses, semesters, ...) have no extra margin below them.
- [x] (2026-11-14, D66: the server keeps live documents for task, sub task, assignment and exam descriptions too; the phone opens them live; course and semester pages now edit the same notes page the desktop does, they edited other blocks before; server test; checked both ways between the simulator and a second client) Embedded editors sync as reliably as notes and jots (also right after coming back online) and show other devices' cursors.

### 5. Mobile: create sheets in the Linear compose style

- [x] (2026-11-14, `screens/ComposeForm.tsx` shared by New Task, Assignment and Exam; tests; checked in the simulator) Quick Jot, Create Task and Create Assignment use the compose sheet (item 1), with a full block editor for the description like the desktop.
- [x] (2026-11-14, the side by side fields are gone: day, times, All day and last day are pills; test; on screen) New Calendar Entry uses the compose sheet. Today labels overflow or are cut off after two letters and everything is crammed; fix all of it.
- [x] (2026-11-14, tests; on screen) New Session and New Semester use the compose sheet.
- [x] (2026-11-14, one question a step, a progress bar, Back, Continue pinned; test; on screen) "Set up semesters" wizard in the Linear style.
- [x] (2026-11-14, `shared/data/repeat.ts` makes series the way the desktop does: a weekly session or any repeating entry is a template with its occurrences and recorded slots; tests in shared and on the phone) Repeat: the phone offers the desktop's full repeat options (not only daily, weekly, monthly) on tasks, and repeat is added to New Session and New Calendar Entry (where the desktop has it).

### 6. Mobile: list pages

- [x] (2026-11-14, `ui/ListControls.tsx` on Bookmarks, Notes, Jots, Files, Trash and Exams with the desktop's fields; Tasks and Assignments had them; Recipes has none on the desktop; tests) Filter and display options on tasks, assignments and the other list pages in the Linear style (`display-options.jpeg`, `filter-list-sheet.jpeg`), keeping our list or board toggle.
- [x] (2026-11-14, test; on screen) Calendar header: keep date and week, no comma, "Week XY" at lower opacity.
- [x] (2026-11-14, an all day item on the page beside made the bar tall on a page that drew no cells; every page now draws them; test; on screen) Calendar bug: the all day row lacks the vertical day borders.
- [x] (2026-11-14, test; on screen) Semesters list: "Set dates" works when tapped; expanding a semester stays, plus a button that opens the semester directly.
- [x] (2026-11-14, the desktop's wand, `assets/toolbar/wand.png` drawn from Tabler; test; on screen) "Set up semesters" is a native header button left of +, not a big button on the page.
- [x] (2026-11-14, test; on screen) Exams timeline: less left padding; the "Today" row spans the full width.
- [x] (2026-11-14, test; on screen) Bookmarks: the "Paste a URL to save it" field is a floating bar at the bottom like the desktop, with its own corner radius following the iPhone's corners, a send button, and properly sized link items.
- [x] (2026-11-14, labels and site filters, grid or list, grouping, ordering, previews and descriptions; bookmarks now list their labels; tests) Bookmarks: display and filter options like the desktop (Linear style), keeping the list or grid toggle.
- [x] (2026-11-14, test) Jots list: the feather icon is plain black (bug); give it the right colour.
- [x] Moodle: the module does something useful on the phone (match the desktop), not only a list of entities.

### 7. Mobile: item pages

- [x] (2026-11-14, the page scrolls the field above the keyboard once it is up; the simulator shows no keyboard, so a real phone check is under Needs the user) Task: adding a sub task keeps the field above the keyboard.
- [x] (2026-11-14, dots and "A B +n"; test) Task: the labels badge shows a colour dot per label, abbreviates after 2 labels, and does not grow wide; no commas.
- [x] (2026-11-14, empty reads "Labels" faded like every other empty pill; test) Task: an empty Labels pill reads "None" instead of "Labels" (seen 2026-11-14).
- [x] (2026-11-14, a warning value tints its icon the same red, in Property; test) Task: an overdue date's calendar icon and label both use the destructive colour.
- [x] (2026-11-14, icons, full width, the next page to write in blue; test) Session detail: "Create Jot for this session" and "Create Note for This Session" get icons and full width; the primary one (no jot: jot; jot but no note: note; both exist: both secondary) uses the default (blue) variant, like the desktop.
- [x] (2026-11-14, the desktop's tinted tag chips with their icons; test) Recipes list: labels show their colours.
- [x] (2026-11-14, desktop banner placeholder with a small camera button, numbered rows typed in place with a menu, add rows across the width, details as property rows; test) Recipe detail rework: a placeholder for a missing banner like the desktop, a much quieter "Choose Banner", clean ingredient and step adding (inputs not squeezed by save buttons), better spacing in the detail sidebar.

### 8. Mobile: Space settings

- [x] (2026-11-14, muted text, the emoji drawn at its natural height) "Choose Emoji": lower text opacity; the emoji is aligned and not cut off (`choose-emoji-positioning-bug.png`).
- [x] (2026-11-14, a row with a colour dot opens the label's sheet: name, colours, delete; test) Label colours are set in a sheet opened by tapping a label, not inline under every label.
- [x] (2026-11-14, the desktop's words, the item count and the name typed first; test) Deleting a Space forever shows the same warning as the desktop.
- [x] (2026-11-14, a card sheet with search listing only missing modules; test) "Add module to Space" is a sheet (Linear style), not a page, and lists only modules the Space does not have.

### 9. Both apps

- [x] (2026-11-14, desktop and phone: a page over everything while it runs, Done or Try Again at the end; tests) Moving local items into an account shows a full page progress screen instead of a dialog (nothing else can be done meanwhile, and a dialog looks closable).

### 9b. Rounder corners (asked 2026-11-14)

- [x] (2026-11-14, RADIUS badge 8, control 12, section 14, sheet 20, and the shared rounded classes a step up; checked in the app) Mobile: a little more corner radius across the app (controls, fields, sections, cards, sheets, rows), not necessarily fully round. Through the phone's tokens (`ui/tokens.ts` `RADIUS`, the classes the phone uses), never per screen.
- [x] (2026-11-14, phone: `corner-shape: squircle` on the rounded classes, which NativeWind turns into the continuous curve, checked on the running app; desktop: `superellipse(1.6)` where supported, WebKit on macOS falls back to plain rounding; D67) Squircles, not plain rounding, on both apps, kept subtle (asked 2026-11-14: "not too strong or overwhelming"). Phone: `borderCurve: "continuous"` (`CORNER`) on every rounded surface, checked app wide. Desktop: CSS `corner-shape` with a gentle `superellipse(...)` where the web view supports it, plain `border-radius` as the fallback; check what the Tauri web view (WebKit on macOS) draws.
- [x] (2026-11-14, shared radius tokens a step up, D67; the desktop app on 1420 was left alone, so its look is checked by the user) Desktop: the same goal. The radii come from the design tokens in `packages/ui`; the user asked for this directly, which overrides the "never modify tokens" rule for this change only (record it in `DECISIONS.md`). Check dialogs, popovers, buttons, inputs, cards and the sidebar in the running desktop.

### 10. Final checks and report

- [x] (2026-11-14, see the final report) `bun run lint`, `bun run format:check`, `bun run typecheck`, `bun run test`, `cargo test` (in `apps/desktop/src-tauri`), `bun run duplication`; read the report only checks (`coverage`, `unused`, `audit`, `lint:rust:strict`).
- [x] (2026-11-14) `CHANGELOG.md` and `whats-new.json` (1.0.0) describe what ships, once.
- [x] Final report below.

### 11. Moodle on the phone does everything the desktop's does (asked 2026-11-14)

The desktop's module is listed in `docs/03-modules/moodle.md` and `packages/frontend/src/features/moodle/`. Each line is one desktop feature the phone must have.

- [x] Sign in in iOS's own sign in sheet (an auth session, `expo-web-browser`), which offers saved passwords and hands Moodle's redirect straight back; the passport check stays.
- [x] Courses: current ones first, then past ones; each with its banner, or its own gradient when it has none; its progress.
- [x] Contents: sections with their descriptions; images in Moodle text read as their description; a Moodle "Page" is read in Nookly; forum and assignment rows open that forum or assignment; anything else links to its page on Moodle.
- [x] Files: download once and stay on the phone (`moodle-files`), read in Nookly (PDF, picture, video, audio) with their details, anything else handed to another app.
- [x] Import a file into the Space: name, labels (course and section suggested, the course one picked, an existing label reused), the matching Nookly course; all or nothing; `origin` `moodle:<address>`; an imported file offers Show in Nookly (one in Trash counts as not imported).
- [x] Assignments: due soonest first, undated last; each opens with its description, attachments, submission status, grade and feedback.
- [x] Grades: grade, range, percentage, weight and feedback; the course total last.
- [x] Announcements and forums: announcements first; discussions; posts with their attachments; initials tiles for people.
- [x] Open in Moodle on every page.
- [x] The last answers are kept for reading offline and forgotten on sign out; downloaded files stay.
- [x] A loading page shows placeholders in its own shape.
- [x] Problems in plain words; an expired sign in offers Connect Again.
- [x] Moodle deadlines on the calendar from Moodle's calendar export link (Settings, Calendar connections; read only overlay).

Done so far (e25434c9): the desktop's pure helpers moved to `packages/shared/src/moodle/` (format, import, errors, path) and both apps use them. Phone: `moodle/api.ts` keeps each answer (`moodle/device.ts`, caches folder) and reads it back offline; `screens/MoodleScreens.tsx` (connect, courses), `MoodleCourse.tsx` (tabs, assignment, forum, discussion, page), `MoodleFile.tsx` (viewer, import sheet), `MoodleParts.tsx` (placeholders, problems, Open in Moodle, course art). Tests: `screens/moodle.test.tsx`. Sign in goes through `expo-web-browser`'s auth session (`service.signIn`, needs a native rebuild). The calendar feed is `moodle/calendar.ts` (link in the keychain, events in `moodle-calendar.json`), connected under Settings, Calendar, Calendar Connections, drawn dashed on the calendar and opened read only (`ExternalEventScreen.tsx`); tests `moodle/calendar.test.ts`, `screens/moodle-calendar.test.tsx`.

### 12. Mobile polish, third round of `NOTES.md` (asked 2026-11-14)

Reference image: `.reference-images/notes-page-empty-state-bug.png`. Look at it before item 2 below.

- [ ] Sidebar header: the blur behind "Nookly" and the search button looks and works right, but it is visibly staggered (the bands of item 2 show as steps). Make the fade smooth.
- [x] (2026-11-14, it is the desktop's page: the empty branch of Notes and Jots skipped the list's `p-6`; tests) Notes list empty state (`notes-page-empty-state-bug.png`): it has no horizontal padding. Fix it (check the other list pages' empty states too).
- [x] (2026-11-14, `sheetCard` through `useSurface` for every section, field and option card on a sheet, the chosen layout tile raised, D68; tests; on screen) Filter and display option sheets: swap the colours so inputs and options are lighter than the sheet they sit on (now the sheet is a light charcoal and the inputs darker). Inputs are always lighter than their surface, for the right sense of depth.
- [x] (2026-11-14, `FilterField` opens the floating picker card; test) Filter options open a select popover (the inline menu or the floating picker card of item 1), never a new bottom sheet covering the current one.
- [ ] New Note sheet in the same style as New Assignment and New Task (the compose sheet).
- [ ] Bookmarks: the "Paste a URL to save it" bar sits further down, so it fits the iPhone's corner radius.
- [x] (2026-11-14, iOS 26 drew a bare `Switch` at the top of the row; it sits in a centred box of its own; test; on screen) Display and filter option sheets: native switches are not vertically centred on their labels. Centre them everywhere.
- [ ] Redesign the New Bookmark sheet (compose style, like New Task).
- [x] (2026-11-14, test; on screen) Semesters list: semesters look squeezed. Give them room. Each row has an icon badge, the title on its own line, and the course count and short dates below, never cut off.
- [x] (2026-11-14, test) Semester detail sidebar: the "Open Notes" button goes.
- [ ] Start and end date pickers with a calendar (e.g. the semester detail sidebar): the inner calendar box gets a larger corner radius, matching the outer one.

### 13. Leftovers from item 11 and the final checks (found 2026-11-14)

- [ ] Moodle on the phone in the running app: the dev client is rebuilt (React Native from source: `RCT_USE_PREBUILT_RNCORE=0 RCT_USE_RN_DEP=0 pod install`, the prebuilt core lacked the debug build the gesture handler links against; never start Metro with `CI=1`, it stops watching files). It was being rebuilt for `expo-web-browser` (first try failed on a stale gesture handler object; this worktree's DerivedData was cleared and it rebuilds). Then check the course list, a course, a file with import, and Calendar Connections on screen.
- [x] (2026-11-14, all pass alone: load timing) `packages/frontend` tests: 5 failures in 4 files in a full run (`data-table.test.tsx`, `BackupSettings.test.tsx`, `ShortcutsTab.test.tsx` and one more). Run each alone; fix any caused by this branch, note any that are load timing only.
- [ ] Final checks again (lint, format, typecheck, all tests, cargo test, duplication) and a new final report.

## Needs the user

- On a real phone: the blinking caret on a tap into an empty page, tapping it again after closing the keyboard, and Undo after typing with the keyboard (the simulator here can't tap into a web view or type with keys; the fix is checked by typing through the browser's own input path).
- On a real phone: tapping "Add a sub-task" low on a task page keeps the field above the keyboard.
- Carried over: on a real phone, the feel of dragging; the iOS 27 scene fix (D59); the editor toolbar on the keyboard and the slash menu; scanning a document.

## Progress log

- 2026-11-14: item 11 done (Moodle parity on the phone, commits e25434c9 and 30c24399). Items 12 (third round of `NOTES.md`) and 13 (leftovers) added.

- 2026-11-14: file refilled from the second round of `NOTES.md`. The previous round (all items done) is in git history up to 750c4f10 and `DECISIONS.md` up to D64.

- 2026-11-14: items 2 to 10 done: Moodle on the phone (browser sign in to the university's page, courses, contents, assignments, grades, forums), task and session pages, recipe page, Space settings, the full page progress of the first sync on both apps, rounder squircle corners (D67), the new splash screen.

- 2026-11-14: item 1 (Linear foundations, D65). Also fixed a red error screen when leaving a page before its editor had loaded (`editor/handle.ts`). The repo formats with `node_modules/.bin/oxfmt <files>`; never prettier.

## Final report

(Round two, before items 12 and 13 were added.) Every item up to 11 is done. Checks on 2026-11-14:

- `bun run lint`, `bun run typecheck`, `bun run duplication` (0.17%): pass.
- `bun run format:check`: only `NOTES.md` is unformatted; it is the user's file and was left alone.
- `bun run test`: passes. Under full load two timing tests failed once each and pass alone (`sidebar.test.tsx` "goes for good once the swipe was used", server `two-devices.test.ts`); nothing in them changed this round.
- `cargo test`: 1543 pass; `search_stays_within_its_budget_on_20000_entities` missed its time budget under load and passes alone.
- Report only: `unused` lists older exports and the `tools/e2e` scripts (none left from this round); `audit` reports RustSEC advisories in dependencies (SQLite, CFB parser and others) and JS advisories; `lint:rust:strict` has three long function warnings, all older. `coverage` was not run.
