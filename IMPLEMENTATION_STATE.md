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

The items come from the user's `NOTES.md` (2026-11-15, fifth round, with the sixth round's items added the same day and marked so). `NOTES.md` is the user's own file: read it, never edit it.

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
- [ ] (sixth round) Search field: the small x that appears on the right while typing is hard to hit. Instead a full X button morphs out of the input to its right (same background as the input) and clears it.
- [ ] (sixth round) The floating bars ("Paste a URL to save it" on Bookmarks, "Paste a link to add it" on Files) and their send buttons get their own corners: they sit at the bottom of the screen snug with the iPhone's own corner, about 8 from the left, right and bottom, their corners following the screen's curve at that distance; the send button gets the radius that fits inside. A shadow behind both so they stand out, more so when focused and lifted by the keyboard.
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
- [ ] (sixth round) New Semester sheet: the timespan only offers "No dates" and "Germany". Add "Custom", which shows a start and an end date input.
- [ ] (sixth round) Bookmark details: the Note field avoids the keyboard, so typing in it is never covered.
- [ ] (sixth round) Redesign the whole Dashboard for the phone: the desktop like layout does not fit. A page people want to use as a shortcut to most features.

### 3. Final checks and report

- [ ] (asked in chat) Dependabot: merge every open Dependabot version bump that makes sense into this branch, then close all Dependabot PRs, the ones not merged too (with a word on why).
- [ ] (asked in chat) CI on this branch's open PR is green at the end of the session. Never merge the PR.
- [ ] `bun run lint`, `bun run format:check`, `bun run typecheck`, `bun run test`, `cargo test` (in `apps/desktop/src-tauri`), `bun run duplication`; read the report only checks (`coverage`, `unused`, `audit`, `lint:rust:strict`).
- [ ] `CHANGELOG.md` and `whats-new.json` (1.0.0) describe what ships, once.
- [ ] Final report below.

## Needs the user

- On a real phone: typing a time with the keyboard (hour over the one shown, then the minute).

- On the phone with your own Moodle site: sign in from Settings, then check the course list, a course, a file with Import, and Moodle deadlines on the calendar.
- On a real phone (a release build): whether page changes and filter changes now feel quick.
- On a real phone: opening the sidebar with a swipe anywhere right of the leftmost tenth, and back from that tenth.
- On a real phone: the feel of swiping a task row (open on the button, full swipe to act, the haptic at the point).
- On a real phone: the editor caret and Undo after typing with the keyboard; "Add a sub-task" low on a task page staying above the keyboard; the feel of dragging; the editor toolbar on the keyboard and the slash menu; scanning a document.

## Progress log

- 2026-11-15: sixth round of `NOTES.md` added (search clear button, floating bars' corners, custom semester dates, the bookmark note and the keyboard, the Dashboard), plus Dependabot and CI from the chat.
- 2026-11-15: the full mobile run timed out the search label test while the machine sat at a load of 57 (another app at 580% CPU); it passes alone. Rerun at the end.
- 2026-11-15: asked in chat: a compose sheet leaves 16pt between its buttons and the title (test; on screen).
- 2026-11-15: dialog corners and padding done; search field height, centring and solid placeholders done.
- 2026-11-15: file refilled from the fifth round of `NOTES.md`. The fourth round (all done, final report included) is in git history up to 2821cbac and `DECISIONS.md` up to D74.

## Final report

(Written at the end.)
