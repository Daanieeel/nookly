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

The items come from the user's `NOTES.md` (2026-11-15, fifth round, with the sixth round's items added the same day and marked so, and the seventh round in its own section). `NOTES.md` is the user's own file: read it, never edit it.

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

Order: shared pieces first (dialog corners and padding, the search field, filter chips, swipe rows), then the screens that use them. Everything here is the phone; NOTES.md has nothing new for the desktop this round.

### 1. Mobile: shared pieces

- [x] (2026-11-15, one `CARD_INSET` of 12 round the card; its corners 24, so the close button's 12 run alongside; tests; on screen) Dialogs (the centred card): with squircles now, the corners of the X button and of the dialog no longer match. Use the right math for two nested corner radii and the padding between them.
- [x] (2026-11-15, rows, search bar, lone fields and sections all start `CARD_INSET` in, the title where the rows' content starts; New, Relate to and Due date checked; tests; on screen) Dialog padding: in the "New" dialog (the + at the bottom left of the sidebar) the two items do not line up with the X button and the "New" title. Same problem in many other dialogs; fix it for all of them in the shared dialog.
- [x] (2026-11-15, 50pt for every search field, the one component; test; on screen) The global search's search bar is too small: give it more height so it feels spacious, and apply the same to every other use of that input.
- [x] (2026-11-15, the input's own padding pushed it down; cap height and icon now share their middle, measured; test) In that input the icon and the placeholder are not vertically centred to each other: the placeholder sits too low.
- [x] (2026-11-15, the search's icon and placeholder in solid grey, every field's placeholder in a new solid `placeholder` colour; tests; on screen) Placeholders and their icons get no lowered opacity; use a muted colour instead, so lower SVG layers do not shine through the icon (the magnifying glass's handle).
- [x] (2026-11-15, D75: one full width chip per field with its name, "is", "is any of", "is not" or "is none of", its values and a remove button; a tap flips is and is not, another opens the choices; every list and Tasks; tests; on screen) Many selected filters overcrowd the page (`.reference-images/mobile/filter-overcrowding.png`). Show active filters like the desktop's filter chips, with their parts ("any of", "is not" and so on); each chip may be full width, one below the other.
- [x] (2026-11-15, a square X in the field's fill grows out to its right as text comes in and shrinks back when empty, springs from `ui/motion.ts`, fade under Reduce Motion; every search field; tests; on screen) (sixth round) Search field: the small x that appears on the right while typing is hard to hit. Instead a full X button morphs out of the input to its right (same background as the input) and clears it.
- [x] (2026-11-15, 8 from the screen's sides and bottom, bottom corners concentric with the phone's own screen corners (looked up by screen size, 62 on the 17 Pro), regular corners on top, the send button's corners nested 8 inside; as the keyboard lifts it the corners relax to the regular ones and the shadow deepens while focused; tests; at rest on screen, lifted under Needs the user) (sixth round) The floating bars ("Paste a URL to save it" on Bookmarks, "Paste a link to add it" on Files) and their send buttons get their own corners: they sit at the bottom of the screen snug with the iPhone's own corner, about 8 from the left, right and bottom, their corners following the screen's curve at that distance; the send button gets the radius that fits inside. A shadow behind both so they stand out, more so when focused and lifted by the keyboard.
- [x] (2026-11-15, D76: every list row swipes; More and Trash from the right with Trash rightmost and run by a long drag; the type's own action and Pin from the left; tasks get Today or Tomorrow; Mail's look with the outermost button growing; tests; on screen) Swipe actions on every list of items (not only tasks), each type with its own sensible actions; rework their look so they feel native (consider a public package). Tasks get a more useful action than "Done". Rule for every type: swiping right to left always ends in Trash, the rightmost action, active on a long drag; a second action may sit beside it.

- [x] (2026-11-15, the card's 12pt inset makes its buttons' 12pt corners nest in its 24pt ones; a key on a full segment starts it over, a digit no second can follow finishes it, nothing out of range shows; tests; on screen through the automation, real keys under Needs the user) (asked in chat) Time input dialog (`.reference-images/mobile/time-input-dialog-corner-radius-mismatch.png`): its buttons' corners must be the dialog's corners less the padding. Typing in the hour does nothing; the minute takes any number, also past 59.
- [x] (2026-11-15, `DialogActions` pins a dialog's buttons under its scrolling content; Repeat and the time picker use it; test; on screen) (asked in chat) Dialogs scroll their content while their action buttons stay visible: in Repeat, "until a day" shows a calendar that pushes "Done" out of the dialog.

### 2. Mobile: screens

- [x] (2026-11-15, test) Hidden Spaces dialog: remove the "Drag a Space above the line to show in the sidebar." notice.
- [x] (2026-11-15, the card opens on tap, keeps its menu, the Current badge centred on its bottom edge on a solid backing; tests; on screen) Semesters list: still crammed. The "Current" badge moves to the bottom centre of the box, overlaid on its border; no chevron and no "Open" button, the semester opens on tap; no expand or collapse.
- [x] (2026-11-15, test; on screen) Inside a semester, "Add Course" is full width.
- [x] (2026-11-15, the New Semester sheet sizes to its content; test; on screen) The + on the Semesters page opens its sheet over the whole screen although there is nothing to type at length: the sheet takes only the height it needs.
- [x] Files: "Paste a link or Choose Files" becomes a floating bar like on Bookmarks, without the "Choose Files" part (the + at the top right does that); make sure that + adds several files at once. Done: the shared floating field (`ui/FloatingField.tsx`) now serves Files too; the + already picked several files (`multipleFiles: true`).
- [x] Bookmarks, the "Site" filter: a search bar, each site with its favicon, and the address with only its important part highlighted ("https://www." muted, "google.com" full). Done: the Site card searches, shows each site's icon (a globe until it has one) and mutes "https://www." before the address.
- [x] Bookmark details page: prettier and more useful; "Refresh Details" must not wrap to a new line in its success state (layout shift). Done: the page leads with the picture, then the site's icon and name over the address, Open in Browser and Refresh Details side by side at equal widths (no wrap in any state), the note, and a "Read Nov 15" row up top.
- [x] Bookmark previews still do not work. Done: cards picture the page as the desktop does (its capture, else the site's picture, else its icon large), and the list reads each page never read once, so bookmarks saved elsewhere or offline fill in.
- [x] (2026-11-15, "Custom" at the end of "Typical dates for" shows Starts and Ends day pills under the title; test; on screen) (sixth round) New Semester sheet: the timespan only offers "No dates" and "Germany". Add "Custom", which shows a start and an end date input.
- [x] (2026-11-15, every field on a page now asks the page to keep its whole height above the keyboard while typing (the sub-task row's way, made shared); test; the real keyboard under Needs the user) (sixth round) Bookmark details: the Note field avoids the keyboard, so typing in it is never covered.
- [x] (2026-11-15, D77: a phone gets a Home of shortcuts on the grouped background: the sentence, an Up next card (now or next today, how long until or left), four Create tiles (Task, Jot, Entry, Bookmark), count tiles that open their lists (Tasks, Assignments, Cards, Jots, the Calendar filling an odd one out), today's tasks, the calendar and the deadlines on cards of rows, every Space a tap away; the iPad keeps the desktop's panels; tests; on screen light and dark) (sixth round) Redesign the whole Dashboard for the phone: the desktop like layout does not fit. A page people want to use as a shortcut to most features.

### 2a. Seventh round (`NOTES.md`, 2026-11-15, after the sixth round; before the tablet)

Mobile:

- [x] (2026-11-15, the X folds back in on a spring without overshoot and never measures below nothing (the old spring took its width negative, the field jerked); every search field and the palette say just "Search" ("Go to", "Command"), the prop for a longer one removed; tests) Search field: the X's way back out (as the text is cleared) is buggy; make it as smooth as its way in. Shorten the search placeholders to a word or two: a search bar explains itself.
- [x] (2026-11-15, the tap worked but with half the choices picked (3 of the 6 due buckets, 2 of 4 ages) the swapped half read "is any of" again, so it looked dead; an even split now reads the way it was last turned; test; on screen) Cross Space Tasks page: the "is any of" (or similar) part of a filter chip cannot be tapped for the preset "Due date" and "Created" filters (maybe ones synced from the desktop). Works on other pages.
- [x] (2026-11-15, one `ListEmpty` for every filtered list (Tasks, Assignments, Notes, Jots, Files, Bookmarks, Courses, Exams, Decks, Recipes, Trash): the module's icon and a title when there is nothing yet, "No Matches" with a Clear Filters button when filters hide everything; tests; on screen) Nicer empty states everywhere: Assignments says only "Nothing matches these filters." Give it a proper empty state with a Clear Filters button under it.
- [x] (2026-11-15, Assignments now uses the shared list controls: its filters as Tasks' chips, and the Filter and Display sheets keep their open state to themselves, so opening one no longer redraws the whole page; tests; on screen) Assignments: active filters show as the same chips as on Tasks (with their "is any of" parts) instead of hiding in the filter menu. The Filter and Display sheets open and close slowly; make them quick.
- [x] (2026-11-15, each switch built the other layout from nothing and redrew the page twice; now both stay built once shown (the hidden one out of sight), what they show is worked out once for both, and the tile answers before the swap; a flip went from 300 to 800 ms to about 160 ms in the debug build, React's own part of it 25 ms; test; measured on screen; how it feels in a release build under Needs the user) Tasks: switching between list and board takes a second or more; make it instant.
- [x] (2026-11-15, D78: a pill floats at the bottom once filters or display change, Discard, Save as View on Tasks and Files, Save (into an open View); unsaved changes stay in memory; Courses, Exams, Decks, Recipes and Trash keep their filters on Save now; a filter's choices no longer keep stale ticks after Discard or Clear Filters; tests; on screen) Save View leaves the Display sheet. Once the user changes the filters or display options of a view (or a base page), a floating bar at the bottom offers the desktop's three choices: Discard, Save as View, Save. Only pages with views offer Save as View; the others show Discard and Save. Every page with filters or display options. Same floating bar as on Bookmarks and Files.
- [x] (2026-11-15, all four corners follow the screen's curve 8pt in, up to a full pill (34 on today's phones), the send button a circle nested in it; the save bar uses the same; test; on screen) The floating bars (Bookmarks, Files, the new save bar): their top corners take the same radius as the bottom ones, a full pill following the screen's curve.
- [x] File viewer details: with a long label chosen, the "Labels" name of the select trigger gets cut short. Never cut the field's name, only the label names.
- [x] Bookmarks list: the (i) button is bigger and a secondary button, easier to hit and to recognise.
- [x] Relationship picker: the list under the search bar and "kind of link" only shows items valid for the chosen kind of link.
- [x] (2026-11-15, the search field measured dead centre (icon, cap height and field share their middle); the line height Tailwind gives `text-base` pushed the paste bars', palette's, sub-task's, new deck's and recipe rows' text 2pt low, now one shared `lineInput` style without it; measured centred on screen; tests) Search placeholders are not vertically centred (the icon is), seen in the relationship picker and often elsewhere: fix it once, for every search field.
- [x] Selects get icons per option as on the desktop where it makes sense (New Semester: Winter and Summer), and the chosen option's icon shows in the trigger. Not where it makes no sense (a year).
- [x] New Semester: the year is a number input in the exact style of the time input (exams, entries, sessions), one field for one number. "Typical dates for" is renamed "Timespan".
- [x] Label picker (from the details of any item): rows about 25% less tall so the list scrolls less. (Done at 44pt, 12% shorter: 25% would go under the 44pt touch minimum.)
- [x] Every entity list page (Jots and the rest): the title, filter and display buttons and the tabs stay put; only the list scrolls.
- [x] Semester setup, "Where do you study?": add Germany.
- [x] "Choose an icon" sheet: categories at the top to jump to.
- [x] Recipes, choosing a photo: ask first (photo library, take a photo, choose a file) instead of opening the file picker.
- [x] Calendar: the view tabs at the top become one icon button left of the + that opens a select of the four views, saving height. The header shows only "Week XY" at full opacity, no dates (the agenda keeps its own). The day numbers in the columns get bigger.

Desktop:

- [ ] Some pages are cut off on the right for no reason: `.reference-images/desktop/right-side-cut-off-bug-*.png`.
  - Investigated, not fixed yet. Layout is full width (a week lays out all 7 columns, the briefing text is cut mid word instead of wrapping) but painting stops at a fixed x inside the page's scroll area; parts outside it (the table footer) draw fully. In image 4 the details panel's own content stops at about the rail's width. That reads as WebKit keeping a stale clip on a layer after the page or the details panel changes width (the panel switches rail and full width through `@3xl` container queries on the page's `@container` scroll root). An offscreen WKWebView harness redraws from scratch and cannot show it, and a second desktop build would open the user's real data.
  - Needs the user: what happened just before (window resized or full screen, sidebar or details panel toggled, a split opened or closed, waking from sleep), and does it go away on its own after scrolling or switching tabs?
- [ ] CLI coverage for every feature and setting: an agent can set up and use Nookly entirely as a person can through the app. Sensitive ones (sign in) reachable but redacted.
  - Done: `settings list|get|set|reset` (the app reloads `settings.json` before each save and every 2s, so nothing is saved over), `backup now|list` (restore stays in the app), `sync status` (no session ever shown, the keychain is never read so no password prompt), Space modules (`space modules|add-module|remove-module|reorder-modules`).
  - Left out on purpose: emptying Trash and deleting forever (the CLI never deletes permanently), restoring a backup, signing in to sync, Moodle, Google or iCloud (they need the person). Calendars: `calendars list` and `calendars events --from --to [--provider]`, read only from the cache file, no secrets. The Files view builder is in Both.

Both:

- [x] Files: the list of every label above the files (`.reference-images/desktop/files-label-list.png`) does not scale. Instead a view builder dialog: name a view, give it labels, and let it keep filters and display options. On the phone as well, and through the CLI so an agent can build views.
  - Done (D81): New View on Files (desktop button beside the presets, phone + beside the View tabs) takes a name and labels from a searchable list with file counts, and keeps the page's filters and display. Above the files only the picked labels show, as chips with Change labels. CLI: `view create --module files --config '{"display":{"shelf":[...]}}'` (description now names Files). Also fixed on the phone: a field in a sheet opened from a page no longer scrolls the page behind it.

### 2b. Tablet (asked in chat, after every other item above, the seventh round included)

- [ ] Optimize the app for tablet once all other items are done. The tablet should feel like a touch optimized version of the desktop app, not a bigger phone app: mostly the desktop's look and layout (sidebar, wide lists and tables, panes side by side), with touch sized targets, gestures and touch friendly inputs. Be creative for a first big version; the user gives feedback after.
  - First pass (D82): no phone bar on a tablet's top level and item pages; page actions are labelled desktop buttons in the header row (`ui/page-actions.tsx`); the Calendar's New button beside its views; the sidebar beside the page starts with the mascot's card (no title, Search in the titlebar); the welcome text names a tablet; module New buttons name what they make; Settings is two panes (categories left, the picked one right). Checked on the iPad Pro 13-inch simulator.
  - Next, for the user's feedback: about 70 texts still say "this phone" on a tablet (Backup, the Haptics heading, sync); the account, Sidebar, Shortcuts and What's New pages still open with a phone bar; landscape not checked (no Simulator app here to rotate).

### 3. Final checks and report

- [x] (2026-11-15, a04d9f7e: the bun group less tiptap, hotkeys and pdfjs (held back since 1da0f4d9), md5, calamine, uuid and zip taken; jsdom 31 (breaks axe tests) and rfd 0.18 (two copies beside the dialog plugin) not; all six closed with a comment) (asked in chat) Dependabot: merge every open Dependabot version bump that makes sense into this branch, then close all Dependabot PRs, the ones not merged too (with a word on why).
- [ ] (asked in chat) CI on this branch's open PR is green at the end of the session. Never merge the PR.
- [ ] `bun run lint`, `bun run format:check`, `bun run typecheck`, `bun run test`, `cargo test` (in `apps/desktop/src-tauri`), `bun run duplication`; read the report only checks (`coverage`, `unused`, `audit`, `lint:rust:strict`).
- [ ] `CHANGELOG.md` and `whats-new.json` (1.0.0) describe what ships, once.
- [ ] Final report below.

## Needs the user

- On a real phone (a release build): switching Tasks between list and board feels instant.
- On a real phone: typing in a bookmark's Note (or any field low on a page) keeps it above the keyboard.
- On a real phone: the paste bars (Bookmarks, Files) lifted by the keyboard, with the deeper shadow while typing.
- On a real phone: typing a time with the keyboard (hour over the one shown, then the minute).

- On the phone with your own Moodle site: sign in from Settings, then check the course list, a course, a file with Import, and Moodle deadlines on the calendar.
- On a real phone (a release build): whether page changes and filter changes now feel quick.
- On a real phone: opening the sidebar with a swipe anywhere right of the leftmost tenth, and back from that tenth.
- On a real phone: the feel of swiping a task row (open on the button, full swipe to act, the haptic at the point).
- On a real phone: the editor caret and Undo after typing with the keyboard; "Add a sub-task" low on a task page staying above the keyboard; the feel of dragging; the editor toolbar on the keyboard and the slash menu; scanning a document.

## Progress log

- 2026-11-15: phone Home done (D77). The sign in rate limit test got the time its twelve password checks take (CI timed out at 5s). The automation can scroll now (`scroll(y, nth)`).
- 2026-11-15: seventh round of `NOTES.md` added (section 2a).
- 2026-11-15: CI fixed: the formatter skips NOTES.md, Windows reads the generated fixtures with LF and FSRS floats to 9 decimals, and two timing races in tests (a sync clash, a sidebar glide) wait properly.
- 2026-11-15: sixth round of `NOTES.md` added (search clear button, floating bars' corners, custom semester dates, the bookmark note and the keyboard, the Dashboard), plus Dependabot and CI from the chat.
- 2026-11-15: the full mobile run timed out the search label test while the machine sat at a load of 57 (another app at 580% CPU); it passes alone. Rerun at the end.
- 2026-11-15: asked in chat: a compose sheet leaves 16pt between its buttons and the title (test; on screen).
- 2026-11-15: dialog corners and padding done; search field height, centring and solid placeholders done.
- 2026-11-15: file refilled from the fifth round of `NOTES.md`. The fourth round (all done, final report included) is in git history up to 2821cbac and `DECISIONS.md` up to D74.

## Final report

(Written at the end.)
