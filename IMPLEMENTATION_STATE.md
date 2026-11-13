# Implementation brief and state

> ## ⛔ DO NOT STOP WORKING. UNDER NO CIRCUMSTANCES.
>
> **You keep working until every item in "Definition of done" is ticked and the final report is written. There is no other reason to end a turn.**
>
> None of these is a reason to stop. Each one has its own next step:
>
> - **A batch is finished.** Pick the next unticked item.
> - **You want to report progress or summarise.** Write it in the progress log, commit, push and keep going.
> - **A server, Metro, the hub or the simulator stopped** (for example at the 2 hour background limit). Restart it, or move to work that does not need it.
> - **A side request from the user is done** (a bug fix, starting servers). Go straight back to this list.
> - **Context is filling up.** It compacts on its own, and this file carries you over.
> - **Something needs a real device, the user's eyes or a decision.** Decide yourself (record it in `DECISIONS.md`), or add it to "Needs the user", and move on.
> - **The session has been long.** Length does not matter.
>
> Agents stopped on 2026-11-12 and on 2026-11-13 for exactly these reasons. Every time, that was wrong. Stop only when the user explicitly says to stop for now. Even then, the next instruction to continue means continuing until done.

**This file is a ready to run prompt.** An autonomous coding agent is told "read `IMPLEMENTATION_STATE.md` and get to work", and then reads this file, `AGENTS.md` and `docs/00-index.md` and carries the whole list out from start to finish **without any human help**. The user reviews everything once, at the end. It is also the handover file: keep it current at all times (tick items, record findings, append to the progress log after every meaningful step) so a fresh session can resume after an interruption or a context reset.

## Situation

Written 2026-11-10 after a review session in which the user ran desktop and the iOS simulator side by side. Their verdict: the current state is not good. **Sync, the whole point of this branch (a connected product: one account, the same data live on desktop and phone), does not work between devices**, and the mobile app is ugly, hard to use and does not resemble the desktop. The earlier claims of "all phases done and verified" (in older versions of this file, `GAP_ANALYSIS.md`, `PAGES.md`, `DECISIONS.md`) must be treated as unverified. Those files describe intent and past work; trust the running app over them.

## Autonomy contract (read this first, it overrides any habit of asking)

- **NEVER STOP UNTIL EVERYTHING IS DONE. No exceptions, under no circumstances.** The only allowed end of work is the "Definition of done" below, every item ticked and the final report written. Not after a batch of items, not to report progress, not to summarise, not because a session feels long, not because context is filling up (it compacts on its own; this file carries you over), not because a service stopped (restart it), not because a check needs a device (put it on "Needs the user" and move on). Progress goes into the progress log and commits, never into a message that ends the turn. On 2026-11-12 an agent stopped after a batch only to report progress, with nothing blocking it; that was wrong and must not happen again. When a batch is done, pick the next unticked item at once.

- **Do not ask the user anything and do not wait for approval.** Nobody will answer. Work from start to finish in one go: merge, sync, desktop, mobile, polish, final report. Never end a turn with a plan, a question or "shall I continue"; finish the list. If you are about to stop with items left, pick the next unticked item instead.
- **When something is ambiguous, decide.** Order of authority: what the desktop app does (after the merge) beats `docs/` (`docs/00-index.md`, `05-ui-ux-direction.md`, `06-decisions-log.md`, `07-deferred-scope.md`), which beats your own judgement; the phone deviates from the desktop only where touch demands it. Record every non obvious decision in `DECISIONS.md` (decision, alternatives, why; a flag on the ones the user should double check). Continue.
- **When something truly cannot be done by you** (a feel that only a real iPhone gives, a paid account, real OAuth keys, a real mail provider): do not block. Build the best version you can verify, stub the rest behind an interface, and put it on the "Needs the user" list in the final report (see the end of this file). Do not claim what you could not verify.
- **Never pretend.** If a test fails, say so; if something is skipped, say so; do not tick an item that is not working in the running app. The previous "verified" claims were wrong, so "done" means: works in the running apps like a user would use them (screenshots you looked at critically) plus an automated test that would have caught the problem.
- **Safety, no exceptions:** Nookly is released and user data must never be lost (migration, sync, conflict, crash mid write, failed upload; everything destructive is recoverable). Never run migration or sync code against the user's real Nookly data, only copies and generated fixtures (`NOOKLY_DATA_DIR` scratch folders). Do not touch the user's own processes (ports 3000, 8081, 1420, the simulator "iPhone 17") or `/Applications/Nookly.app`. **Never merge anything into `main`, never push to `main`**, no force push to shared history, no tags, no pull requests, nothing outside this repository except starting and stopping your own dev servers and simulators. Never `git stash drop` or clear a stash (the stash list is shared with other checkouts). The only branch you delete is `mobile-app-and-backend`, in step 0.
- **Git: you own this branch (`t3/continue-mobile-backend-improvements`) and may manage it entirely yourself.** Commit after every meaningful step with a clear message that ends with the attribution lines your session gives you; push to `origin` whenever it helps (at least right after step 0 and the merge, after each of sections 1 to 3, and after every group of mobile items; `git push -u origin HEAD`); merge `main` into it (section 1) and again later if main moved; use fixup, amend or interactive cleanup only on commits that exist nowhere else; fetch, merge and retry if a push is rejected, and if you rewrite history of this branch use `--force-with-lease` and only after checking nobody else pushed. The one hard limit: **nothing from this branch goes into `main`** (no merge, no push, no PR). Committing is part of the job; it is the checkpoint that makes resuming possible.
- **Project rules (`AGENTS.md`, read it in full):** migrations append only and hashed; tests first for every bug fix or behaviour change (watch the test fail, then change the code); versions are already 1.0.0 (see section 1), no more bumps and never a major above 1, but every user visible change still needs its line in `CHANGELOG.md` under 1.0.0 and, for features, a card in `whats-new.json`; user facing copy has no em or en dashes and no hyphenated sentence structure; never modify existing primitives or tokens in `packages/ui` (add only); every new entity or field goes through the schema layer the CLI generates from; run new tests in isolation while working, the whole set at the end.
- **Context is limited:** after each meaningful step update the progress log at the bottom, tick items, commit. If your context is compacted or the session restarts, this file tells you where you are. Parallel work is allowed (sub agents for independent investigations such as profiling the slow editor) but you integrate and verify the results yourself.

## Definition of done (all of it, then stop)

0. The old duplicate branch `mobile-app-and-backend` is gone (local and on origin) after step 0 proved nothing was lost.
1. `main` is merged into the branch, everything from main works on desktop, nothing is lost for a database from released main, and every main feature is ported where it applies (sync and mobile), see section 1.
2. Sync works for real: desktop and phone in one account see each other's edits live, remote sign out is live, a headless two client test in the repository proves it and the real two device check is recorded, see section 2.
3. The desktop items of section 3 are done (account settings rework, cloud icon, slow editor).
4. Every item of section 4 is done and ticked with a before and after screenshot pair you compared with the desktop, and the mobile motion and haptics system exists and is used everywhere, see section 4.
5. `bun run lint`, `bun run format:check`, `bun run typecheck`, `bun run test` (with `TEST_DATABASE_URL`) and `cargo test` in `apps/desktop/src-tauri` pass, `bun run duplication` is under 1%, and you ran and read (not silenced) the report only checks: `bun run coverage`, `bun run unused`, `bun run audit`, `bun run lint:rust:strict`.
6. `AGENTS.md` and `DECISIONS.md` carry the new rules and decisions, `CHANGELOG.md` and `whats-new.json` describe the real 1.0.0 (rewrite the draft entries), this file has the final report and is current, and everything is committed and pushed.

## Order of work

0. [x] Step 0: done.
1. [~] Section 1, the merge: done; phone ports of a few main features still open (see section 1).
2. [~] Section 2, sync: done except the items left open in section 2.
3. [~] Section 3, desktop items: Account settings rework still open.
4. [ ] Section 4, mobile, in vertical slices so the app is never half rebuilt: (a) foundations first: the shared tokens (touch sizes, spacing, flat surfaces), the motion token file and the sheet, menu and popover rebuild, the haptics module and API; (b) the shell: sidebar with space switcher, header, mascot, dashboard; (c) list pages (Tasks, Assignments and the other modules); (d) item pages and the editor for every type; (e) settings and the remaining screens; (f) the mobile feature gaps; (g) a final sweep screen by screen in dark and light, phone and iPad. After each slice: screenshots compared with the desktop, tests, this file, commit, push.
5. [ ] The final checks (definition of done 5) and the final report.

How to judge your own UI work without a human: put the desktop screenshot and the phone screenshot side by side (you can read images), list every difference in hierarchy, spacing, typography, colour, iconography, boxes and density, fix them and repeat until you would not be able to tell they are the same product. Be harsh; the user's verdict on the current state is "ugly, useless, a UX nightmare".

## How to run everything (this machine)

Worktree: `/Users/daniel/.t3/worktrees/nookly/t3-ed31ca16` (local branch `t3/implementation-state-refresh`, pushed with `git push origin HEAD:t3/continue-mobile-backend-improvements`; the older worktree `t3-59771e54` holds the same branch and is idle, do not work in both). Nothing from the old checkout is installed here except what is listed below.

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

## Step 0: done (2026-11-11)

`mobile-app-and-backend` deleted (was `0b5bd915`, fully contained here). Stashes checked and kept. `feat/connected-platform` is contained too; mention in the final report.

## TODO

Done sections are summarised; open items keep their full text.

### 1. Merge main into this branch and port every new feature

**Done (2026-11-11/12, D39).** `main` 0.75.0 merged (merge `b34be7ef`, safe point `b3bdc02b`). Versions stay 1.0.0. Sync migrations re added as 51 to 54 after main's 42 to 50; `db::premerge` upgrades pre merge dev databases (checked on a real copy). Desktop uses main's `BlockEditor` with live collaboration; shared code and the phone follow main's data rules.

Open:

- [ ] Port the remaining main features to the phone: the sidebar (see section 4), the settings rework style, page font and size in the phone editor, flashcards edited with blocks on the phone. Moodle stays desktop only (record in `DECISIONS.md` if not yet).

### 2. Sync must actually work

**Done (2026-11-12, D40, D43).** Headless two device test `apps/server/test/two-devices.test.ts` plus a real check on desktop and phone: live edits both ways, live page bodies and cursors, conflicts and the merge editor (D37, D38), offline reconnect, remote sign out. Fixed: skipped older edits, a late 401 turning sync off, a sync left running after a session ended, doubled page documents and bodies (`PageDocs.open`, `claimPageCopies`). Sign out clears the device, sign in asks about local data. Testing trap: desktop scripts reach the runtime through the module URL the app loaded (see section 5), the phone's editor is automation device `phone-editor`.

Open:

- [ ] D40 (flagged): a clash shows only on the device that pulled first, unless the server saw both edits. Decide whether every device should offer it.
- [ ] Once, a phone edit stayed pending after a sign in plus restart during the first sync's checking phase; not reproduced in 4 tries. Try again.
- [ ] Re-run the old definition of done for real (account made on mobile and used on desktop, offline conflict and the merge editor on both apps) and record it.

### 3. Desktop

**Done (2026-11-12).** New pages open at once (4 s to under 300 ms; editable in about 120 ms signed in). Cloud sync icon (D41). Account settings as cards (`features/sync/AccountCards.tsx`), the phone's Account page in the same structure.

Open:

- [ ] Desktop is otherwise in good shape (two months of development); do not redesign it. Only account and sync UI and the items above change.

### 4. Mobile app: redesign to match desktop

The user's assessment: ugly, not useful, a UX nightmare, and it does not resemble the desktop in UX, UI or style. Treat the mobile app as needing a redesign, screen by screen, with the desktop (after the merge) as the reference, not as polishing. Reopen everything `PAGES.md` and `GAP_ANALYSIS.md` call done. Useful process: for each screen, take a desktop screenshot at a narrow width and a phone screenshot, list the differences, fix, repeat. Mobile rules from `AGENTS.md` still apply (one shared bottom sheet for popovers, selects, pickers, menus and confirmations, never native dialogs; copy the desktop styling exactly but size for touch; shared size and spacing tokens, no per screen tweaks).

**Done (2026-11-12).** Recents gone from the sidebar. Every bar button is native and round like back, through `ui/bar.ts` (D45). Add Block removed, every page uses the real editor (D42). Dashboard like the desktop (faded glue words, quiet `PageTabs`, opens on a tab with content, mascot beside the date, no +). Tasks, Assignments, Notes and Jots lists flat with status icons, one meta line, secondary Filter, Display and Sort. Item pages show properties as chips at a glance for every type (`AtAGlance`). Sidebar like the desktop: mascot card, one Space at a time, switcher at the bottom. Touch sizes drawn through `CONTROL_SIZE` in `ui/touch.ts`. Boxes only where the desktop has them. Editor: no blank line per open, tap under the text types on a free line. Duplicate Spaces were fixture data (D48, flagged). Automation hooks `openSidebar`/`openDetails`. Faded colours fixed with a react-native-css patch (test in `styles.test.ts`). Screenshots in `docs/todo-screenshots/mobile-*`.

**Priority (user, 2026-11-12): phones first.** Finish the phone app before the iPad; iPad layouts are the next priority right after.

**Redesign direction (user, 2026-11-12, after seeing how ugly the searchable selects look). This governs every component from here on and supersedes "copy the desktop styling exactly" and the compact menus of D46 (see D50).** In the user's words:

> Build all custom components in the redesign so they feel native to iOS rather than like flat, desktop-style widgets: use semantic adaptive colors (PlatformColor / useColorScheme), SF Symbols via expo-symbols with tinted rounded-square icon badges, continuous corner curves, blur/translucency for sheets and bars, and subtle depth between surfaces. Present selects and pickers as bottom sheets (or native form sheets) with a pinned search field, large 44pt+ full-row touch targets, sectioned lists with sticky headers, an icon + title + subtitle layout, and a checkmark for the selected item, instead of desktop-style dropdowns. Add the details that make it feel alive: Reanimated spring animations and layout transitions, instant pressed-state feedback, expo-haptics on selection and toggle events, and interruptible gestures like drag-to-dismiss and swipe-back. Respect safe areas, keyboard avoidance, Dynamic Type and accessibility roles/labels, and include empty, loading and error states for every component. Before building more, extract design tokens (color, spacing, radius, typography, shadow) and a small set of base components, and reuse them everywhere so the whole app stays consistent.

Work it in this order, and tick each item here as it lands (tests, screenshots in dark and light, commit, push):

- [ ] (partly, 2026-11-12: `ui/tokens.ts` with semantic iOS colours, Nookly tints from the desktop tokens, spacing, radius with continuous corners, iOS text styles and depth, tested; `touch.ts`, `motion.ts` and `theme.ts` still beside it, the old NativeWind classes still used by most screens) **Tokens first, before any more screens.** One token module in `apps/mobile/src/ui/` for colour (semantic adaptive iOS colours for surfaces, grouped backgrounds, labels, separators and fills via `PlatformColor`, with Nookly's accent and status colours from the desktop tokens on top; light and dark), spacing, radius (continuous curves), typography (Dynamic Type aware sizes mapped to iOS text styles) and shadow or depth levels. Fold the existing `touch.ts`, `motion.ts` and theme values into it or beside it so there is one source. Unit test what can be tested (every token defined for both schemes).
- [ ] (partly, 2026-11-12: `ui/kit/` has `Label`, `Glyph` (SF Symbol with a Tabler fallback), `IconBadge`, `ListRow`, `GroupedSection` and `SectionHeader`, `SearchField`, `EmptyState`, `LoadingState`, `ErrorState`; screens not migrated yet) **A small set of base components on those tokens**, used everywhere: surface (grouped list section with depth), list row (icon badge, title, subtitle, accessory, pressed state), icon badge (SF Symbol in a tinted rounded square), button, field, sheet, sheet header with a pinned search, section header (sticky), empty, loading and error states. Migrate screens to them; no screen styles its own rows.
- [ ] **Icons:** add `expo-symbols`; a map from Nookly's interface icons to SF Symbols with a Tabler fallback for Android and for the user's own chosen icons (a Space's icon stays the icon they picked).
- [ ] (partly, 2026-11-12: every `OptionList` select, choice property, `SelectField` and sort opens the sheet with a pinned search, grouped rows of badge, title, subtitle and detail, a check, sections whose header stays pinned while scrolled, and a No Results state; the compact menu is deleted; the sheet is blurred material with rounded continuous corners (`docs/todo-screenshots/mobile-select-sheet.png`). Still: tint status badges by status colour, entity, label, date, colour and icon pickers on the kit) **Selects and pickers rebuilt** (the trigger of this direction): every select, choice property, entity picker, label picker, space, course and exam picker opens the bottom sheet with a pinned search field, sticky section headers where the options have groups, rows of icon badge, title and subtitle (the desktop's details: dates, counts, keys, descriptions), a checkmark on the chosen one, 44pt or taller rows, haptic tick on pick. The compact menu (`ui/sheet/Popover.tsx`) leaves selects; remove it if nothing else needs it. Keep every piece of desktop metadata (the user's earlier rule).
- [ ] **Sheets and bars:** blur and translucency (`expo-blur`) for the sheet background and bars, subtle depth between the page and grouped surfaces, drag to dismiss and the back swipe stay interruptible (D47).
- [ ] **Alive:** springs and layout transitions on every list and sheet (D47), instant pressed states on every row and control, haptics on selection and toggles (D49 already plays Core Haptics through `ui/haptics.ts`, which goes beyond expo-haptics' presets and covers the brief).
- [ ] **Every component:** safe areas, keyboard avoidance, Dynamic Type (text grows without clipping), accessibility roles and labels, and an empty, loading and error state, each covered by a test.
- [ ] Then continue the screen by screen redesign (and the final sweep) on these tokens and components, comparing with the desktop for content and hierarchy and with iOS system apps (Settings, Reminders, Notes) for feel.

Open, named by the user:

- [ ] (partly, D47: `ui/motion.ts` tokens and tested helpers; the sheet on interruptible springs with velocity and rubber banding; compact menus grow from their trigger; page tabs slide their underline; buttons, icon buttons and chips give way under a finger (`ui/press.ts`). task, sub-task, note and jot rows fade in and out and the rest slide into place (`ui/ListMotion.tsx`). Still to do: detents, press feedback on rows and checkboxes, layout transitions for lists, drawer springs, screen recordings; haptics done, D49) **Move towards a more iOS native feel for our own styled components (motion).** iOS interactives move, morph and animate; ours just appear. Selects, popovers, menus and most other interactive parts show up and vanish instantly and feel clunky. The bottom sheet is the only part with real animation (`ui/sheet/Sheet.tsx`: a fixed duration `withTiming` slide of the panel plus a fading backdrop) and even that feels clunky. Only four files use Reanimated today (`ui/sheet/Sheet.tsx`, `ui/inset-page.tsx`, `screens/period-swipe.ts`, `screens/TimeGrid.tsx`); `react-native-reanimated` 4.5 and `react-native-gesture-handler` are installed. Goal: our custom components behave like iOS system ones, still looking like the desktop app but moving like iOS. **General rule for all mobile motion: copy Apple's iOS animation style.** Custom animations that feel interactive and physical, driven by springs and by the finger rather than by canned timelines. The most important property of great iOS animation is that it is **interruptible and cancellable**: touch a moving sheet, menu or drawer and it stops under the finger at its current position and velocity (nothing jumps or restarts); let go and it **springs** to wherever the gesture points, carrying the release velocity; dragging is always 1 to 1 with the finger with rubber banding at the limits; a tap during an animation reverses it smoothly instead of waiting for it to finish. So: animate with Reanimated springs (`withSpring`, with `velocity` from the gesture) and gesture handler pans, keep animation state in shared values that gestures can take over at any moment, never a fixed duration timeline for anything a user can interrupt, and never block input during an animation. Match iOS spring feel (about 0.3 to 0.5 s response, light overshoot only where iOS overshoots) and put these values in the one shared motion token file. Add this as a rule to the mobile section of `AGENTS.md` and a decision to `DECISIONS.md`, and write tests that interrupt animations (start, interrupt mid way, check it continues from the current value) where the logic is testable. Do it through shared building blocks (one motion token file with the springs, durations and easing, one place per component kind), never per screen tweaks. Concretely:
  - Sheet: spring based (interruptible, velocity carrying) instead of fixed duration timing; drag to dismiss follows the finger and settles with the release velocity; the backdrop fades with the panel's position; detents (medium and large) with rubber banding at the edges; content and keyboard resize smoothly; a small handle; dismissal by swipe down anywhere on the header or non scrolling content.
  - Menus, selects and popovers (see the item above about simple selects): scale and fade in from the trigger's anchor point with a spring, the way iOS context menus and pull down menus do, and morph out of the trigger where it makes sense; rows highlight on press with a soft highlight and tracking finger drag across rows; dismiss with a quick fade.
  - Pressables: a subtle press scale or highlight with a quick spring back on buttons, rows, tabs, chips, and the checkbox (check mark drawn in), toggles and tab changes with animated selection (a sliding indicator, not an instant switch), list changes (add, remove, reorder, expand and collapse of groups, sub-tasks) animated with layout transitions, screen transitions and drawers that follow the finger.
  - [x] Custom haptics (D49): Core Haptics module `modules/nookly-haptics`, named patterns in `ui/haptics.ts`, wired into picks, tabs, switches, drawers, sheets, swipes, task done and button results, Settings switch under Appearance. Feel needs a real iPhone.
  - Respect Reduce Motion (swap springs for short fades), keep everything at 60 fps (worklets on the UI thread, no JS driven animation in lists), and test in the simulator (Reduce Motion on and off).
  - Verify by screen recording on the simulator (`xcrun simctl io <id> recordVideo`) and compare against Apple's own apps (Settings, Notes, Reminders) for timing and feel; keep the recordings in a scratch folder (not in git) and look at frames from them yourself; the final feel on a real device goes on the "Needs the user" list.
- [ ] Overall pass: after the above, review every screen for desktop likeness (typography, spacing, colour, icons, hierarchy), with phone and iPad screenshots in dark and light mode.

Open, named by the user (2026-11-12, late):

- [ ] (partly: the web view's own bar is hidden (`hideKeyboardAccessoryView`), the app's toolbar carries Hide Keyboard and sits in the page's `KeyboardAvoidingView`; checked without a software keyboard only, the headless simulator cannot show one, so **needs the user** on a device) **Editor actions hide under the keyboard.** The editor toolbar (format buttons, up and down, done check) sits below the keyboard or under iOS's keyboard accessory bar (screenshot from the user: the bar is cut off at the bottom). Anchor it correctly above the keyboard, on top of the accessory bar or replacing it.

Open, own findings (2026-11-10):

- [ ] **Item pages (task, assignment, course and the other types) do not resemble the desktop at all** (user feedback after looking at the list pages and opening entities; checked on the phone 2026-11-10). What the phone shows for a task: native back and two native bar buttons (details, more), a small `TSK-1 · Study · 1 / 14` line with up and down arrows, the title, an "Add Block" button, then a "Sub-tasks" section in a boxed list. An assignment shows only `ASG-1 · Study`, the title and "Add Block": status, due date, course, size, labels, grade and every other property sit behind the details drawer, which a native bar button opens, so the page itself looks empty. Rebuild each item page from the desktop's page (title, properties, body and the details area, what it shows for each type) as a phone layout, with the important properties visible on the page. The desktop item page was not screenshot in this session (the desktop automation click on a row did not open it); capture it first from the desktop with `bun tools/e2e/desktop.ts` (open the item through Quick open or the CLI) and compare type by type.
- [ ] Mobile feature gaps from the old list, lower priority than the redesign but still part of parity. Decide per feature (record in `DECISIONS.md`) whether it ships on the phone or stays desktop only, and build the ones that ship: restoring a backup, external calendars, saved views for Assignments, the PDF paged viewer, series (repeating sessions and calendar entries; the phone only edits one occurrence), editor blocks beyond text, tables and formulas. Verify whether the semester setup wizard is really there (a recent commit adds a five step setup, an older note says it was missing).
- [ ] Never verified by touch (tooling cannot send touches): swiping the sidebar and the details drawer, the back swipe edge, the Swift key commands (`modules/nookly-keys`), the native action sheet of More, sidebar row tap targets. Check what you can in the simulator with the hooks above; list what you could not verify under "Needs the user".
- [ ] The red "finalizeAsync / database is locked" LogBox error after Metro hot reloads `_layout.tsx` is a dev artifact (the database is opened again while the old connection has statements); a cold relaunch clears it.

### 5. Process notes for the next agent

- The old state said sync was verified in simulators and desktop debug builds. The user's real use showed otherwise. For sync and UI work, "done" means checked in the running apps like a user would (screenshots saved to `docs/todo-screenshots/` when they prove something), plus an automated test that would have caught it.
- Start Metro without `CI=1`: with it Metro does not watch files and the phone keeps running old code after an edit. After a change to `packages/shared`, relaunch the phone app (`xcrun simctl terminate` then `openurl`) when in doubt, and check a changed text on screen before trusting a phone check.
- Desktop scripts: import app modules by the URL the app itself loaded (`performance.getEntriesByType('resource')`, the name ending in `sync-instance.ts` with its `?t=` stamp). A plain `/@fs/...` import after a hot update is a second copy of the module with its own, signed out sync.
- `two-devices.test.ts` "brings an offline device's edits in on reconnect" failed once while the desktop was compiling beside it and passed 7 of 7 after; its 1.5 s waits are tight on a busy machine.
- Kill what you start by port (`lsof -iTCP:<port> -sTCP:LISTEN`), never `pkill -f` on the app binary path (that could hit `/Applications/Nookly.app`). If `bun --watch src/index.ts` lingers after stopping the stack, kill that process too.
- Docs to read and update when the merge lands: `docs/00-index.md`, `docs/05-ui-ux-direction.md`, `docs/06-decisions-log.md`, `DECISIONS.md` (this branch's decisions D1 to D35), `GAP_ANALYSIS.md`, `PAGES.md`. Record new decisions in `DECISIONS.md`.
- `REPORT.md` (untracked, never commit it) is stale; refresh it only if the user asks.

## Progress log

Append newest last: date, what was done, what is next. Earlier entries (2026-11-10 to 2026-11-12) are folded into the section summaries above.

- 2026-11-12: merge (D39), sync fixed and checked on two devices (D40, D43), desktop editor speed, cloud icon and Account cards, phone redesign pass (Dashboard, lists, item glances, sidebar and mascot, touch sizes, flat lists, bar buttons, editor fixes), motion (D47), compact menus (D46, later superseded by D50), haptics (D49).
- 2026-11-12/13: redesign direction from the user (D50): tokens, base kit, selects as a blurred sheet with a pinned search, compact menu removed; desktop hidden sidebar got a solid background. Next: the D50 checklist in section 4, from tinted status badges and the remaining pickers on.

## Final report (fill in when everything above is done)

Write this at the very end, plainly and honestly, in this section (not in `REPORT.md`, which is untracked and stale):

- What was done per section, with commit ranges.
- Decisions made (summary, with the ones worth a second look marked; the details are in `DECISIONS.md`).
- Anything stubbed, skipped, partial or fragile, stated plainly.
- **Needs the user** (things you could not verify or decide alone), for example: the iPad keyboard shortcut module's Swift source was never in git (an ignore rule hid `modules/*/ios`); it was recovered from the main checkout and committed, check it matches what you expect; the feel of the haptics and the animations on a real iPhone, touch and swipe gestures on a real device, OAuth providers with real keys, a real mail provider for password reset, the rewritten 1.0.0 release notes, releasing 1.0.0 (tag and push, which you did not do).
- How to run everything and a manual test checklist of at most 15 minutes (two devices, offline conflict and the merge editor, the main mobile screens).
- Where the before and after screenshots are (`docs/todo-screenshots/`).
