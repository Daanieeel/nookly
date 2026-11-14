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

The items come from the user's `NOTES.md` (2026-11-13). `NOTES.md` is the user's own file: read it, never edit it.

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

### 0. First step

- [x] (2026-11-13, #111111, D60) The app's backmost background is a deep charcoal instead of full black, on mobile and on desktop (dark mode). Add new tokens where needed; do not edit existing ones in `packages/ui`.

### 1. Mobile: sidebar

- [x] (2026-11-13) Bigger text and icons in the nav sidebar.
- [x] (2026-11-13, every menu) Bigger text and icons in the menu the + next to the Space icons opens.
- [x] (2026-11-13, the sidebar snapped back to the open page's Space; test) Switching Spaces works every time; clicking a Space icon always switches.
- [x] (2026-11-13) The overflow (three dot) menu of hidden Spaces shows each Space's icon and colour.
- [x] (2026-11-13) Emoji Space icons are centred, not shifted up and cut off.
- [x] (2026-11-13) The day card at the top: the date a little bigger, the cycling line a little heavier.
- [x] (2026-11-13) A "Nookly" title (Inter Tight, very heavy) as an always visible header at the top, with a native search icon button (magnifier) on the other side (space between). It replaces the "Search" row, which goes. A blur gradient behind it so it reads as a proper header.
- [x] (2026-11-13) Sidebar icons at about 85 to 90% opacity, so they do not look irrelevant.

### 2. Mobile: menus and sheets

- [x] (2026-11-13, MenuList: body text, 22pt icons, 50pt rows) Items in popovers and menus (the long press sheet on entities and every other menu) get larger text and icons for touch.
- [x] (2026-11-13, Assignments gains Ordering; Tasks had both; tiles and rows larger) The display options sheet gets back grouping and ordering options, and its list and board boxes grow with the larger menu items.

### 3. Mobile: forms and settings

- [x] (2026-11-13) Input fields: no more `[label | input]` rows, which look like placeholders. The label sits above the field in a smaller font; a row may lead with an icon instead, `[(icon) | input]`, so the input stays big.
- [x] (2026-11-13) Settings avoid the `[label | input]` layout too, so long labels are not cut off and content is not squished.
- [x] (2026-11-13) Settings show their setting keys above the labels, as on desktop.
- [x] (2026-11-13, flags as emoji, D61) Time zone is the same kind of select as on desktop, not a text field.
- [x] (2026-11-13) Date format and time format switchers show the same flag icons as on desktop.
- [x] (2026-11-13, preview cards) Theme and file viewer theme switchers get the desktop's icons.
- [x] (2026-11-13) Default code language (editor settings) is the desktop's popover, not a text field.
- [x] (2026-11-13, `ui/NumberInput.tsx`) "Day starts at" uses a port of the desktop's number input component.
- [x] Sidebar settings: keep the separate page and the switches, but items are reordered by dragging, not by arrow buttons.
- [x] LaTeX settings: adding macros feels like on desktop (with a preview, proper inputs), cut to fit mobile.
- [x] Sign in and sign up screens get a real design and hierarchy (creating an account is clearly not the same weight as "Forgot Password", and is phrased better than "Create an Account Instead").

### 4. Mobile: lists and boards

- [x] Tapping the status icon of a task or assignment in a list opens the status sheet instead of marking it done.
- [x] Board view for tasks and assignments looks like the desktop: items as cards, columns keep their width. Items can be dragged: a long press makes every card wobble (each with its own time offset, like iOS home screen icons), then cards can be dragged between columns.
- [x] The "Empty Trash" button stretches across the full width of the page.

### 5. Mobile: page editor

- [x] Code blocks get syntax highlighting.
- [x] Code blocks get the desktop's header: file title, language select and a copy button.
- [x] The slash menu looks like the desktop's (groups, icon in a box, a description) and scrolls through every result, not just the top five.
- [x] The formatting toolbar sits above the keyboard, not hidden below it.
- [x] A button to dismiss the keyboard.
- [x] Toolbar buttons are large enough for touch.

### 6. Mobile: item pages and pickers

- [x] The exam time chip shows AM/PM only where the time format uses it, like the popover already does.
- [x] The time popover: much bigger hour and minute fields that feel like a real clock face (Inter), no background, two underlines under hour and minute, as if typing into the popover itself. "Clear time" is a destructive button, "Done" is primary.
- [x] (2026-11-13, UI and agenda; rows untouched) Study blocks are removed from the mobile app (the feature no longer exists).
- [x] The course page's semester select shows semesters with their metadata (icon etc.) like the desktop.
- [x] The assignment due date selector offers "Specific session" as the desktop does.
- [x] The due date selector's option boxes are a little bigger.
- [x] The "Clear due date" button is taller and its x icon is no longer full black.
- [x] The calendar creates an entry on a long press, as real calendars do.
- [x] A calendar entry's page has a "Move to Trash" button at the bottom.
- [x] Bookmark previews load instead of saying "Couldn't reach it".

### 7. Mobile: Space settings

- [x] No "Position" setting anymore; the Space icons at the bottom of the sidebar are reordered by dragging instead.
- [x] Modules are reordered by dragging, as in the sidebar settings page.
- [x] The Add Module button moves above the modules and takes the full width.
- [x] The icon picker shows all of Nookly's provided icons inline, then a ghost button "Choose Emoji" that opens the sheet with emojis only (no tab switcher). A new component; the universal "Choose an Icon" sheet stays as it is for other entities.

### 8. Mobile: files

- [x] (2026-11-13, PDFKit with search and page count, Quick Look, thumbnails; checked in the simulator) A full file viewer for PDFs and other files.
- [x] (2026-11-14, VisionKit pages joined into one PDF with PDFKit; sheet with name, labels and link applied on Save; button checked in the simulator, which has no camera) A scan button next to + on the Files page, using `expo-document-scanner` (https://github.com/DineshKachhot/expo-document-scanner). After scanning, a bottom sheet for title, labels, relationships etc., prefilled with sensible defaults (file name etc.). The document uploads in the background while the sheet is open; the sheet only applies the user's edits afterwards.

### 9. Mobile: app

- [x] (2026-11-14, full screen, corners filled; checked in the simulator) `/Users/daniel/Downloads/splash.png` becomes the splash screen.

### 10. Desktop

- [x] The sign in and sign up dialog is redesigned so it invites creating an account and could be sold to real customers (free closed beta of the connected platform). Buttons for Google, Apple, GitHub and Notion with their logos under "or sign in using", disabled, with a tooltip saying they are coming soon.

### 11. Both

- [x] (2026-11-14, patched y-tiptap: a cursor anchored on living text keeps that anchor; both apps) Live sync: when another device types and the word your cursor is in moves, your cursor moves with it, so it seems not to move at all.
- [x] (2026-11-14, the name goes under the caret in the first block, phone and desktop) The "xyz on iPhone" cursor label no longer disappears at the top when the other device is in the first line of a note.

### 11b. Merge main (asked 2026-11-13)

- [x] Merge `main` into this branch again and adapt the fixes it brought to this branch's code (the rebuilt mobile screens, sync). Never push to `main`.

### 12. Final checks and report

- [ ] `bun run lint`, `bun run format:check`, `bun run typecheck`, `bun run test` (with `TEST_DATABASE_URL`), `cargo test` in `apps/desktop/src-tauri`, `bun run duplication` under 1%; report only checks run and read: `bun run coverage`, `bun run unused`, `bun run audit`, `bun run lint:rust:strict`.
- [ ] `CHANGELOG.md` and `whats-new.json` describe the changes; `DECISIONS.md` carries the decisions; the final report below is written; everything committed and pushed.

## Needs the user

- On a real phone: the feel of dragging (sidebar settings rows, board cards with the wobble, the board scrolling near its edges). The simulator can't drag with a finger, so the gestures are checked by tests and by screen reader actions only.
- On a real phone: the iOS 27 scene lifecycle fix (D59).
- On a real phone: the editor's toolbar riding on the keyboard, and the slash menu (grouped, with icons, scrolling). The simulator here shows no software keyboard to type a slash into; both are covered by tests, and the code block header and colours were checked on screen.
- On a real phone: scanning a document (the simulator has no camera). The button, the sheet after a scan and saving its name, labels and link are covered by tests; joining the pages into one PDF runs only on a device.

## Progress log

- 2026-11-13: file refilled from `NOTES.md`.
- 2026-11-13: charcoal background (D60); sidebar (sizes, header, Space switching fix, overflow icons, emoji centring, opacity); menus larger; study blocks gone from the phone; file viewer (`modules/nookly-file-viewer`). Simulator dev build: Debug in the scratch `dd-debug` folder, Metro on 8092 with `RCT_jsLocation` set in the app's defaults (no dev client package). Earlier work (sync, merge, the first mobile rebuild) is in git history and `DECISIONS.md` up to D59.

- 2026-11-13: settings (input fields, layout, keys, time zones, flags, theme cards, code languages, Day starts at, sidebar drag, LaTeX macros with previews); sign in and sign up on both apps (D62); assignment status sheet; Empty Trash full width; boards as cards with wobble and drag across columns (`ui/Board.tsx`).

## Final report

(written at the end)
