# Decisions: connected platform

Each decision: what, the alternatives, why. ⚑ marks the ones worth a second look. The long lived record stays `docs/06-decisions-log.md`; the entries that change how Nookly works are copied there too.

## D1. Build on the existing sync stack instead of starting over

- **Decision:** keep the sync engine in `packages/shared/src/sync` (per field records with hybrid logical clocks, server side merge, WebSocket notices, conflicts kept), the Elysia server and the Expo app. Add what the brief asks for on top: better-auth, S3 files, Yjs for page text, the merge editor, settings sync, migration UX.
- **Alternatives:** a new sync stack (ElectricSQL, PowerSync, Replicache, a hand made op log).
- **Why:** the existing engine already does exactly what the brief asks for structured fields: two devices changing different fields merge silently, only the same field changed concurrently counts as a conflict, and the losing value is never dropped. It has convergence tests against real Postgres. Replacing it would risk data and buy nothing.

## D2. The server is the authority; the desktop still works without an account ⚑

- **Decision:** once signed in, the server's merged record is the truth every device converges to; each device's SQLite is a cache plus an outbox (`sync_dirty`), never the authority over another device. Without an account the desktop keeps working exactly as before, local only.
- **Alternatives:** require an account on the desktop.
- **Why:** Nookly is released and people use it offline without accounts. Forcing sign in on update would lock them out of their own data. The brief's "local cache, never the authority" holds for every signed in device.

## D3. better-auth with username and password, email optional ⚑

- **Decision:** better-auth on the server with the `username` and `bearer` plugins. Sign up takes a username and a password; email is optional and only used for password reset and share invites. Clients store the session token in the OS keychain (desktop) or SecureStore (phone) and send it as a bearer token. Sessions last 60 days and renew on use, so people stay signed in. OAuth (Google, Apple, GitHub) becomes a `socialProviders` entry: the `account` table and the client's sign in screen already have a slot for providers.
- **Alternatives:** keep the custom JWT auth; cookie sessions.
- **Why:** the brief asks for better-auth. Bearer tokens work the same from a Tauri webview, React Native and the CLI; cookies don't cross those cleanly. An account needs an email column in better-auth, so an account without an email gets an internal placeholder (`<id>@users.nookly.invalid`, never shown, never mailed).

## D4. Existing server accounts move into better-auth without losing anything

- **Decision:** a Drizzle migration copies `users` into better-auth's `user` and `account` tables with the same ids, and better-auth checks passwords with the existing argon2id hashes (Bun's `Bun.password`), so nobody has to reset a password. Records, conflicts and shares keep their owner ids. The old tables stay in place, unused.
- **Alternatives:** drop the old tables (the server was never deployed).
- **Why:** development databases exist, and "never lose data" costs one migration here.

## D5. Devices have names, and every clock names its device

- **Decision:** a `devices` table on the server maps each sync device id (the last part of every clock) to a name and platform, registered with every session. Conflicts carry the device id of each side, so the merge editor says "This device (MacBook)" and "Other device (iPhone), 14:02", never "ours" and "theirs".
- **Why:** the brief's merge editor needs device names and times; clocks already carry both.

## D6. Page text merges with Yjs; block rows stay as the materialized form ⚑

- **Decision:** each page body is a Yjs document (`page:<entityId>`), edited through TipTap's Collaboration extension and synced through Hocuspocus over WebSockets, persisted in Postgres (`documents`). Concurrent edits, online or offline, merge in the CRDT and never show a conflict. Presence and carets come from Yjs awareness.
  - The `blocks` rows remain the stored form everything else reads (search, CLI, export, previews, offline-only users). The server writes them from the document after each change (it is the authority), and each device also writes them locally from its own copy without marking them as edits, so search works offline.
  - A document is created only by the server, from the page's block rows the first time a signed in device opens the page. Devices never seed one on their own, so two devices can't each turn the same page into a document and duplicate it.
  - A page a device has not yet opened online keeps the old path (blocks sync per block, conflicts kept) until it is opened online once.
  - Edits from outside the editor (CLI, agents, import) still write block rows; the server applies them to the document as a replacement of that block.
  - Every client builds its editor from the same schema (`packages/frontend/src/features/notes/editor-schema.ts`), tested to be identical on desktop and mobile, because y-prosemirror drops nodes a schema doesn't know. A document records the schema version it was written with, and a client with an older schema opens it read only instead of editing it.
- **Alternatives:** y-websocket (no auth hooks, no persistence hooks); Automerge (no TipTap binding); per block last writer wins (conflicts on concurrent text edits, which the brief rules out); making Yjs the only stored form (breaks CLI, search and offline-only users).
- **Why:** Yjs plus TipTap is the established pairing, Hocuspocus gives authentication, persistence and multiplexing over one socket.

## D7. Same field, both sides: newest wins for now, the other is kept and a badge asks ⚑

- **Decision:** a real conflict (the same field changed on two devices without either seeing the other) never blocks anything. The item shows the newer value right away, the other value is stored in full, and a badge on the item and in the sidebar's sync status invites a decision. The merge editor shows both versions side by side (stacked on phones) with differences highlighted, and offers Keep this one, Keep the other, Keep both and Edit combined.
  - Keep both: for text it joins both versions in the combined editor. Single values (a date, a status) have no Keep both: the desktop does not offer it either, so Keep this one, Keep the other or Edit combined decide them. (An earlier version of this text promised a copy of the item; that was never built.)
  - A conflict stays until someone decides. Dismissing is the same as Keep this one, and nothing is deleted: the decision is recorded and the other value stays in the conflict log.
- **Alternatives:** freeze the item until resolved; always ask before applying.
- **Why:** the brief says conflicts never block and both versions are kept until resolved.

## D8. Files go to S3 by content hash, through the server

- **Decision:** file contents (Files, recipe banners, bookmark snapshots) are uploaded through the server (`PUT /v1/blobs/:sha256`), which hashes the body as it streams and refuses a mismatch, then stores it with S3's own SHA-256 checksum under `blobs/<owner>/<sha256>`. The AWS SDK v3 is the only S3 client; endpoint, bucket, region and keys come from env, so MinIO and real S3 are one setting apart. A synced column (`blob`) on each table holds the hash; the device local path stays local. Each device keeps an upload queue (`blob_uploads`) that retries with backoff and survives restarts; a file is downloaded on demand and checked against its hash before it is used.
- **Alternatives:** presigned URLs straight to S3 (the brief asks for "via the backend", and checksums are simpler to enforce on the server); syncing file bytes as records.
- **Why:** content addressing makes every upload idempotent and every retry safe, and duplicates cost nothing.

## D9. Settings that describe the person sync; settings that describe the device don't

- **Decision:** a new synced table `account_settings (key, value)`. Display name, time zone, date and time formats, effort scale, every Calendar setting and the editor settings except Vim keys sync. Theme, file viewer theme, backups, server address, Vim keys and shortcuts stay per device.
- **Alternatives:** sync `settings.json` whole; sync nothing.
- **Why:** a theme or a backup folder is about the machine. Per field merge works for settings too: two devices changing different settings merge silently.

## D10. The first sign in on a desktop with data migrates it, carefully

- **Decision:** before anything is sent: a full backup with the existing backup code (`<data>/backups/before-sync-<time>.nookly-backup`), checked by reading it back. Then every row is marked as a change (sync's existing `enable`), pushed in batches of 500 that the server applies idempotently; a mark is cleared only when the server confirms its row, so a crash resumes where it stopped and never duplicates. Files go into the upload queue. A progress dialog shows rows and files sent; the summary at the end ("1,204 items and 37 files are in your account") is kept in `sync_meta` and stays in Settings, Account. Local data is never deleted.
- **Account already has data:** rows from different devices have different ids, so they simply add up; rows that exist on both (the default statuses) merge per field by their real edit times, and any value that loses is kept as a conflict.

## D11. Two sockets: records and documents

- **Decision:** the existing sync socket (`/v1/sync/ws`) keeps announcing record changes; Hocuspocus runs on `/v1/collab` for documents. Both authenticate with the same bearer token.
- **Alternatives:** carry Yjs messages on the record socket.
- **Why:** Hocuspocus's protocol, multiplexing and auth hooks come for free on its own socket.

## D12. The phone gets the real editor through an Expo DOM component

- **Decision:** the page editor on mobile is the desktop's TipTap editor (same schema, same block extensions) running in an Expo DOM component (`"use dom"`), with the Yjs document living on the native side and its updates passed across. Everything else on mobile is native React Native.
- **Alternatives:** a native rich text editor (none supports this schema or Yjs); plain text boxes per block (today's version, which can't show half the block types).
- **Why:** one editor means one schema, which is what keeps y-prosemirror from dropping content (D6).

## D13. Mobile components follow react-native-reusables, styled with the desktop's classes

- **Decision:** rebuild the phone's primitives the way react-native-reusables does (`@rn-primitives/*` underneath, copied into `apps/mobile/src/ui`), on the class lists the desktop's primitives already use (`@nookly/ui/classes`). Navigation follows the Claude app: a sidebar behind the page, sheets for creating and editing, generous spacing. On an iPad wider than 768 points the sidebar stays open beside the page, closer to the desktop.
- **Why:** the brief points at reusables, and the shared class lists keep the look the desktop's.

## D14. External calendars stay a desktop overlay

- **Decision:** Google and iCloud calendar connections are not synced and not on mobile.
- **Why:** they are read only overlays with per device OAuth clients and keychain credentials (docs/03-modules/sessions-timetable.md). Syncing third party credentials through our server is a security decision the user should make, not this branch.

## D15. Desktop only features stay desktop only

- **Decision:** CLI, agent files, tabs and split view, keyboard shortcuts, folder backups, Office conversion and OCR are not built on mobile. GAP_ANALYSIS.md lists why for each.

## D16. One dev stack command

- **Decision:** `docker-compose.yml` at the root runs Postgres, MinIO (with its bucket made by a one shot `mc` container) and, under the `server` profile, the server. `bun run stack` starts the containers, applies migrations and runs the server on the host with watch mode; `bun run dev` keeps starting everything (server, desktop, mobile).

## D17. The phone's editor is ProseMirror on the desktop's exported schema (refines D12) ⚑

- **Decision:** the DOM component runs ProseMirror and y-tiptap directly, on a schema built from `packages/shared/src/generated/editor-schema.json`. A desktop test writes that file from the real TipTap extensions and fails when it drifts, so the two cannot disagree silently. The phone's own Yjs document (offline copy, socket, `PageDocs`) stays in React Native; the web view has a second document and the two swap updates as base64 over the bridge (Yjs makes repeats and order harmless). Awareness (carets and names) crosses the same way. The toolbar is native, above the keyboard. Blocks the phone has no editor for (timelines, images, files, embeds, linked items) show as labelled cards and keep their attributes untouched.
- **Alternatives:** bundle the desktop's TipTap extensions (they import the desktop's `#/` modules, React node views and settings, which the DOM bundle cannot resolve); a native editor with no schema guarantee.
- **Why:** the schema is what matters for y-prosemirror (D6), and a generated file with a drift test gives that without dragging the desktop's UI code into a web view. Check: edits made in the web view reach the phone's rows and the server, and an edit from another client shows in the phone's editor within a second (verified in the simulator).
- **To double check:** the phone cannot edit table cells' column widths, inline math, or the atom blocks' rows; they round trip but are not editable there.

## D18. Permanent deletes on the phone confirm with an alert, and Space deletion lists what goes ⚑ (superseded by D35)

- **Decision:** emptying Trash, deleting one item forever and deleting a Space ask first with the system alert (the phone's counterpart to `ConfirmPermanentDialog`); a Space's alert says how many items go with it. Everything else (trash, move, hide a module) is undoable and does not ask.
- **Alternatives:** a custom sheet like the desktop's dialog; no confirmation.
- **Why:** a system alert is what a phone person expects for a destructive choice, and the rule that a permanent action always asks holds. A custom sheet would add code for the same result.

## D19. Series, assignment due sessions and a few overview screens stay on the desktop ⚑

- **Decision:** the phone shows and moves single sessions, calendar entries and study blocks, and edits one occurrence of a series (an override), but a series itself is created and changed on the computer. The Dashboard briefing and semester setup are simpler than the desktop's. GAP_ANALYSIS.md marks each as partial with the reason.
- **Alternatives:** port the series editor and the briefing text in full.
- **Why:** both are dense forms that would need a design of their own on a phone; what the phone cannot edit it still shows correctly and never overwrites.

## D20. The phone shares the desktop's data rules by running the same code ⚑

- **Decision:** the rules that used to live only in the desktop's Rust (update, reorder, delete, modules, duplicate, labels, tasks, files, recipes, sessions, calendar overrides, semesters and grades, views, relationships, jots, review undo, bookmark metadata, portable files) are ported to TypeScript in `packages/shared/src/data`, with tests against the real schema. Where an output is a file other devices read (Nookly page, task, deck, assignment files), samples written by the TypeScript are imported by a Rust test (`db/portable_phone_tests.rs`) so the two cannot drift.
- **Alternatives:** call the desktop's Rust through a server; write different rules for the phone.
- **Why:** the phone works offline on its own database, so the rules have to run there. Two copies of a rule is the risk, and the cross check is the guard.
- **To double check:** anything that changes in `db/*.rs` needs the same change in `packages/shared/src/data`.

## D21. A bookmark's note is never overwritten by a fetch

- **Decision:** fetching a bookmark's page details fills title, description and icon only where they are empty; what the person wrote stays.
- **Why:** data a person typed outranks data a website claims.

## D22. A tablet shows the sidebar beside the page from 768 points

- **Decision:** the root layout puts the sidebar next to the screen stack on a wide window (the drawer is switched off then); pages keep a reading width and the week calendar and merge editor use the pane's own width. The test device name for scripts is `tablet` (`EXPO_PUBLIC_AUTOMATION_DEVICE`).
- **Alternatives:** a different navigator for tablets.
- **Why:** one set of screens, with only the shell changing, keeps the two from drifting.

## D23. The sidebar's colours are set from the theme where a class is not enough

- **Decision:** the sidebar's headings and the lit row take their colour from the theme object on the phone, because the shared class list resolved to near black on black in dark mode there. `packages/ui` is untouched.
- **Why:** the primitives are off limits; a colour from the theme is the smallest local fix.

## D24. Auth requests carry no cookie, a silent socket is dropped, and a stopped sync writes nothing ⚑

- **Decision:** a phone's networking layer attaches the cookie of an earlier sign in and sends no Origin, which better-auth refuses ("Missing or null Origin"); the client sends `credentials: "omit"` and the server removes cookies from auth requests except for provider sign in. A live socket pings every 15 s and is reopened after 40 s of silence, and reconnects wait at most 10 s. A sync that is stopped (sign out) drops what it received instead of writing it; sign out waits for the one in flight; turning sync on starts from the beginning of the new server (never from a cursor the last account left).
- **Why:** each was a real failure found by running two accounts on an iPad and a desktop: sign up refused, a second account never seeing its own data, and changes arriving a minute late.
- **To double check:** the cookie removal list in `apps/server/src/auth/cookies.ts` once OAuth providers are enabled.

## D25. Local changes go out after 400 ms

- **Decision:** the debounce before a local change is sent is 400 ms (it was 1.5 s), so an edit shows on another device in about a second.
- **Why:** the brief asks for about a second; a batch every 400 ms during continuous edits is cheap.

## D26. The calendar is hour grids, and its colours come from one shared file

- **Decision:** the phone shows Day, 3 Days and Week as hour grids plus an Agenda; an iPad shows the desktop's Day, Work Week, Week and Month. `packages/shared/src/calendar-style.ts` and `blocks/highlight-colors.ts` hold the colours of items and highlights; `desktop-drift.test.ts` checks the desktop's Tailwind classes against them.
- **Why:** the user asked that colours are always the same on every client, shared in one place.

## D27. The iPad window is the desktop's: titlebar, palette, shortcuts, tabs, split view

- **Decision:** from 768 points the shell has a titlebar strip, a tab strip, the details pane beside an open item (from 900 points of page width) and a split view; the command palette is an in window overlay.
- **Alternatives:** a `Modal` for the palette. It crashed the app when it closed while the page behind changed (`RCTViewComponentView unmountChildComponentView`).
- **To double check:** the Swift key commands (`modules/nookly-keys`) were never exercised on a hardware keyboard.

## D28. An item's page has a page and details, and its own top bar

- **Decision:** every item type marks what belongs in the middle (`MainPart`: title, the description, its own lists) and what is a property or setting (`DetailsPart`); the same screen renders twice, in the page and in the details (`ItemParts.tsx`, `ui/parts.tsx`). On a phone the details are a drawer on the right (`shell/DetailsDrawer.tsx`), on a wide iPad the inspector beside the page. Item pages keep the system's own bar: its back button is native, and details and more are native bar buttons (`Stack.Toolbar`); the key, stepper and conflict badge sit in the page's first row. (First built as a bar drawn inside the page so it slid with the details; replaced 2026-10-21 so back and the bar buttons are the system's.) Header `+` buttons are native the same way. The sidebar and the details never swipe into each other: from either, a swipe goes back to the page first (`shell/panes.tsx`).
- **Why:** the user's feedback (2026-10-20): black showed above the rounded corners, and properties crowded the main page.

## D29. The sidebar is one drawer around the whole app

- **Decision:** on a phone `shell/SidebarDrawer.tsx` (`react-native-drawer-layout`) wraps the whole stack, so a swipe to the right opens the sidebar from any page. It claims only drags to the right, and leaves the left 24 points to the system's back swipe on a page that can go back; the details drawer claims drags to the left. A touch may drift 16 points sideways before it stops being a tap.
- **To double check:** swiping was never verified with a finger or a simulator (my tooling cannot swipe).

## D30. Assignment due days are resolved at read time, as on the desktop

- **Decision:** an assignment that follows a session shows the day of that session minus its days before, computed when it is read (`resolveDue`); the stored day is not trusted. This fixed a real bug on the phone.

## D31. Nookly file import: unknown blocks become paragraphs; samples are checked both ways

- **Decision:** a block type the phone cannot edit becomes a paragraph on import; the desktop writes its samples, the phone reads them (`db/portable_desktop_samples_tests.rs`, `portable-import.test.ts`).

## D32. Sync rounds only when something is pending; test seams instead of module mocks

- **Decision:** a local change with nothing to send starts no sync round (`notifyLocalChange` checks `pendingCount`). Lint forbids module mocking, so a test supplies window width, the menu, the clipboard, the file picker and the key system through providers (`renderScreens(..., options)`).

## D33. `PAGES.md` is the source of truth for what a mobile page shows

- **Decision:** pages follow `PAGES.md` (written from desktop 0.38.3). New pure helpers keep the rules testable: `dashboard-model.ts`, `briefing-runs.ts` (the desktop's sentence), `assignment-view.ts`, `course-stats.ts`, `pinned-groups.ts`. Shared data got `listPageSummaries`, `courseSemesters`, `addFileLink`, `createSessionPage`.
- **Decided on the way:** a Space's Tasks open as a board on an iPad and a list by status on a phone, the overview as a list by due date; Assignments group by deadline with a round checkbox; the Dashboard's "Show N more" expands in place (no filtered overview to jump to); a link pasted in Files is kept only if it is a Drive, Dropbox or iCloud link or a direct file link, a web page is refused (as on the desktop); a bookmark's page is read after it is saved; a jot's "Refine into New Note" is on its details.
- **Also built:** the five step semester setup (`SetupSemestersScreen.tsx`, `semester-setup.ts`) and the line of semester averages on Grades.
- **Not built, on purpose:** restoring a backup on the phone (it would replace the open database; signing in on a new phone brings everything back and never replaces what is there), external calendars, Office conversion and OCR, the PDF paged viewer, series (D19).

## D34. A page made on the phone asks for its document again a few times

- **Decision:** a page made less than two minutes ago, while the phone is online, asks the server for its document up to three more times, three seconds apart, before it settles for the rows editor. The server refuses a page it has not received yet ("No such page"); the first sync round delivers it.
- **Why:** pages made on the phone opened in the rows editor instead of the live one.

## D35. One bottom sheet for every desktop input on the phone, and touch sized controls

- **Decision:** every popover, select, date and time picker, color or icon picker, context menu, overflow menu and confirmation the desktop has opens on the phone in one in app bottom sheet (`apps/mobile/src/ui/sheet/`, Reanimated and Gesture Handler), never a system alert, action sheet or picker, and never an accordion or an expanding panel. The create forms that were native `formSheet` routes are now routes drawn as the same sheet (`presentation: "transparentModal"`, `sheetRoute`). The sheet sizes to its content up to nearly the full screen, scrolls inside, has a handle, goes away with a swipe down, a tap on the page or the system's back, and lifts above the keyboard. A pick of one closes it, ticking several keeps it open, and a field inside a sheet (a form's Space, a due date's steps) pushes a step onto the same sheet with a back button. Contents are shared: `OptionList`, `DayPicker` (the desktop's calendar), `TimePicker` (the desktop's typed time field), `MenuList`, `ConfirmContent`, and the Display and Filter parts. Confirmations are sheets too (the user's call), which replaces D18's system alert. Every item row has the desktop's right click menu on a long press, and the More menu holds the same items plus what only an open item has.
- **Touch:** controls keep the desktop's look; `ui/touch.ts` grows each one to 44 points on iOS and 48 on Android, by its size where it can grow (fields, rows) and by its hit area where it can't (buttons, chips, swatches), with gaps that keep neighbouring hit areas apart.
- **Alternatives:** keep the system's form sheet as the one sheet and drive pickers through a route (callbacks through a store, no content sizing, a different look on Android); a sheet library such as `@gorhom/bottom-sheet` (another dependency for what Reanimated already does).
- **Kept as they are, on purpose:** segmented controls and tabs (layout, calendar view, presets, settings with two or three values, Can view or Can edit), which the desktop also shows in place; the editor's slash and @ menus, which follow the cursor while typing (now with rows a finger tall); the system `Switch`; the block menu of the old rows editor (`PageEditor.tsx`), left out by the user. The native bar buttons now draw Tabler icons from `assets/toolbar/`.
- **Not verified by touch:** the swipe down to dismiss and the keyboard lift were checked in code and tests, not with a finger (the simulator tooling cannot swipe or type on the soft keyboard).

## D36. Vim keys on the phone: one plugin for both editors

- **Decision:** the desktop's Vim keys moved out of its TipTap extension into a plain ProseMirror plugin in `packages/shared/src/editor/vim.ts` (`vimPlugin({ enabled, undo, redo })`, with `vim-core.ts` and the key list in `vim-keys.ts`). The desktop's `VimMode` extension wraps it; the phone's editor runs it first among its plugins. The setting `notes.vimMode` moved to the shared settings, stays per device (not synced, D9) and is under Settings, Editor, Editing on both. On the phone the mode shows in the editor's corner as on the desktop, and `?` opens the key list in the app's sheet. It needs a hardware keyboard (iPad keyboards, a Bluetooth keyboard); the soft keyboard sends no usable key events.
- **Alternatives:** a second Vim implementation for the phone (two copies to keep in step); leaving Vim keys desktop only (an iPad with a keyboard is a real writing setup).
- **Found on the way:** the desktop's Vim cursor styles were lost in an earlier change, so normal mode had no visible block cursor; restored with a test (desktop 0.38.5).
- **Not verified with a real keyboard:** checked with key events dispatched in the iPad simulator's editor and with tests.

## D37. A conflict only the server logged counts like any other

- **Decision:** the sync status's conflict count is the merge editor's list: this device's log plus the server's, without repeats (`SyncRuntime.openConflicts`, passed to `SyncClient` as `countConflicts`). Settings reads the same count. One extra request per sync round, and rounds only run when something changed (D32).
- **Why:** two devices online that change the same field at the same moment each push before seeing the other; the server keeps the losing value in its log, and no device records one. Nothing was lost, but nothing offered it either.
- **Alternatives:** the server pushing the conflict to both devices' logs (a protocol change for the same result).

## D38. The merge editor draws differences as a code review tool does

- **Decision:** `diffLines` (shared) pairs the lines of both versions: lines both share stay plain, lines that differ are paired with the most alike line across from them (shared words and punctuation, in order), and words are marked only inside a pair that partly matches, never indentation. The desktop and a wide iPad show it split: the other version left in red with a minus, the one showing now right in green with a plus, line numbers in gutters, a shaded cell where a side has no line, both sides in one grid so wrapped lines stay level. A phone shows the same rows stacked, with both line numbers, red above green. Code is in a monospaced face (Menlo on the phone).
- **Why:** the user found the old view (two cards with yellow word marks) flat; asked for the look of a git client. The words stay plain ("Showing now", device names), no version control vocabulary.
- **Alternatives:** character level marks (noisier for prose); a diff library (the existing word diff extended in a few lines).

## D39. Merging main (0.75.0) into the connected platform ⚑

- **Migrations:** main's released 42 to 50 stay untouched. This branch's sync migrations, numbered 42 to 44 before, are now 51 to 53 (rerunnable: `IF NOT EXISTS`), and 54 adds sync triggers for main's `entity_references`. A development database of this branch from before the merge claims 44 without main's 42 to 44: `db::premerge` recognises it (sync tables, no `assignments.ungraded`), renames the three blob columns aside, steps back to 41, and copies them back after migrating. No released database is touched by it. ⚑ Check: an old development database opens with everything (fixture tested in `premerge.rs`).
- **What syncs of main's new data:** `entity_references` syncs, except `last_seen_at` and `last_result` (each device finds those out itself); `reference_device_paths` never syncs (a path means something on one computer only). New columns (`ungraded`, `evaluated_at`, `due_session_after`, `origin`, card `front_blocks` and `back_blocks`) sync with their rows. `study_blocks` keeps syncing its rows although main removed the feature, so no old row is dropped.
- **One page editor:** main's `BlockEditor` (find bar, spelling, drop targets, table handles, page font) is the only editor. On a live page it adds Yjs collaboration and carets and skips its own row loading and saving; this branch's separate `CollaborativeEditor` and `editor-hooks.tsx` are gone, presence moved to `page-presence.tsx`. Alternative: keep two editors (signed in pages would lose every main feature).
- **Debug builds keep their own settings:** main lets a dev build share `settings.json` and keeps a separate `preferences.dev.json`; this branch keeps both files in the debug build's own data folder (`storePath`, `store_dir`), because with settings sync a fixture account would otherwise write into the installed app's settings.
- **Shared code wins the location, main wins the content:** where this branch had moved code to `packages/shared` for the phone (modules, settings, whats-new, block markdown and custom rows, text colors, tokens in `theme.css`, badge classes) and main changed the frontend copy, main's changes were ported into the shared file. Settings: page font and size are shared and synced; spelling stays desktop only. Settings got an Account page in main's new navigation (the full rework is section 3).
- **The phone follows main's data rules (D20):** `graded` is `evaluated` (with `evaluated_at` stamped), ungraded assignments stay out of grades, "due before the next session" follows the session that was next when it was set, editing a card's text drops its blocks, and the phone reads Nookly files of version 2 (Files inside are stored as Files when the caller gives `storeFile`, else their blocks become paragraphs; cards written as blocks arrive as their text). The phone still writes version 1. The phone's import screen passes `storeFile` (`storeBase64`), so pictures arrive as Files.
- **Versions:** 1.0.0 stays (main is 0.75.0). Main's changelog history is kept whole; this branch's own 0.34 to 0.38 numbers collided with main's and are folded into 1.0.0.

## D40. Sync is held to a headless test of two app runtimes; where a clash shows ⚑

- **Test:** `apps/server/test/two-devices.test.ts` runs two `SyncRuntime`s (what the apps run) against the real server over HTTP and WebSocket, with a network the test can unplug: an edit shows on the other device within 1.5 seconds both ways, edits of different fields merge, the same field changed at the same moment keeps the losing version and offers it, an offline device's edits arrive on reconnect, and ending a session signs that device out at once without touching its data.
- **Found by it, fixed:** a push that lost on every field (the other device's newer edit already stored) was skipped by the server before it looked for losses, answered as taken, and the device dropped its edit: lost without a trace (about 1 in 7 runs). The server now logs it. Ending a session from another device now tells that device's live socket, so it signs out at once.
- **Found in the real apps, fixed:** after signing out and into another account on the phone, a late request of the old session came back 401, and the old client wiped the device's one token store (the new account's token) and reported a sign out. Sync turned off; after the next launch the phone was signed out, so its edits were never even recorded for sending: "edits on the phone never reach the desktop". A client now only clears the store and reports a sign out while the store holds its own token, and the runtime only listens to its current client (`stale-session.test.ts`).
- **Phone build:** the merge's lockfile gave Expo `lightningcss` 1.33, which `react-native-css` can not drive (the bundle failed). Pinned to 1.30.1 workspace wide (root `overrides`); the desktop's Vite build is fine with it.
- **Where a clash shows ⚑:** when the server sees both edits, every device offers the clash. When a device pulls the other edit before sending its own, the clash is kept on that device only, and only it offers the merge editor. Nothing is lost either way. Alternative not built yet: devices report their own clashes to the server so every device offers every clash (needs resolving them on both sides together).
- **Not covered by the test:** the platforms' own wiring (the desktop's Tauri SQL bridge, the phone's SQLite driver and its app lifecycle), which the real two device check covers.

## D41. The titlebar's sync icon turns green after a sync that moved something

- **Decision:** the sync icon sits left of Import, a ghost button as before. It turns green for two seconds when a round sent changes from this device or brought changes from another (`SyncStatus.lastChangedAt`), never for a round that only checked (the minute timer, a reconnect that found nothing), and not for what was already synced when the window opened. Only a colour change, no movement, so it needs nothing different for reduced motion. The tooltip stays.
- **Alternatives:** after every round (the minute timer would make it blink for nothing); a toast (too loud).

## D42. One page editor on the phone, live or not

- **Decision:** a page without a live document (an item's description, a page made here that the server has not seen, a page offline that was never opened) is edited in the same ProseMirror editor as a live page, with its `/` menu and toolbar, on a document kept only on the phone (`RowsPage`). The old list of text fields with its "Add Block" button and its native action sheet is gone. What changes is written back as block rows half a second after typing stops, and only what was edited, field by field (`@nookly/shared/data` `page-rows`): a block another device changed meanwhile keeps that change, and blocks changed elsewhere come into the open editor when this one did not touch them.
- **Alternatives:** keep the text fields without the button (still not the desktop's editor, and a native action sheet against the rules); a server document for every item (descriptions are rows by design, D6).

## D43. Signing out clears the device; signing in asks about what is on it ⚑

- **Decision (sign out):** a sign out the person asks for leaves the device as a new one: every synced row goes (`SyncEngine.wipe`), the rows a new database starts with come back, and the data stays in the account and on the other devices. Before that the device tries once more to send what waits; if something is still unsent (row changes, typing in pages, files) the whole device is backed up first, and when that backup fails nothing happens and the device stays signed in. Both apps say so in a confirmation before it happens.
- **Decision (sign in):** a device that holds items and is not syncing is asked what should happen to them, and the form can't be sent without an answer: "Add to the account" (the first sync as before, after a backup) or "Keep out of the account" (a backup is made, then the device is cleared, so only the account's data shows). Nothing joins an account silently. A device with nothing on it is not asked.
- **A sign out the server did keeps the data ⚑:** a session ended from another device, a password reset, a deleted account or a server that lost its database all look the same to a device. Clearing on that signal could remove the last copy of someone's data, so the device keeps everything and the next sign in asks the question above. Deleting the account from a device also keeps that device's data (`SyncRuntime.detach`).
- **Backups that hold the only copy are never cleaned up:** the backup of data kept out of an account, and the one made before a sign out with unsent changes, go to `kept-backups` (desktop data folder, phone documents), where nothing is pruned. The first sync's own backups stay in `pre-sync-backups` (newest three).
- **Not done, worth a second look ⚑:** data kept out of an account does not come back by itself on sign out; it is restored from its backup (desktop: Settings, Backup; the phone has no restore yet, see the feature gaps). File contents on disk are not deleted by the clearing, only their rows, so nothing unsent can be lost with them; a later pass can remove contents the account is known to hold.
- **Alternatives:** keep the old behaviour (rows stay after sign out, the next account silently takes them: the mixing the user reported); clear on every sign out including the server's (a lost server would empty every device).

## D44. A device's page copies belong to one account

- **Decision:** the copies of page documents a device keeps (`page_docs`) are tied to the account and server they came from (`sync_meta` key `pages_account`). Copies from another one are dropped before any page opens; text in them that never reached a server goes as row edits. Nothing about a page is written after sync stops, and opening a page is shared, so two opens side by side use one document.
- **Why:** two documents of the same page (one from an earlier sign in) merge into a page with its body twice, and two documents opened side by side closed each other, which showed as "nothing is live".
- **No repair** for documents doubled before this: sync never shipped, only dev data was affected.

## D45. Corner buttons keep the system's round background

- **Context:** bar buttons hid iOS 26's glass background to look like the desktop's ghost icon buttons, so they looked unlike the back button beside them.
- **Decision (user):** every top corner button is the system's own bar button with its round background, like the back button. `bar.test.ts` forbids `hidesSharedBackground: true`. The Dashboard has no + (it only ever made a task).

## D46. A few choices open as a compact menu (superseded by D50)

- **Context:** every select opened a bottom sheet, which the user found too much for picking one of a few.
- **Decision:** a select or choice property with at most `COMPACT_CHOICES` (8) options opens `Popover`, a small menu at its trigger like the desktop dropdown (under it, above when there is no room, closed by a pick or a tap beside it). Longer lists, date, icon and colour pickers, forms, item menus and confirmations stay in the sheet. `OptionList` serves both through `SheetCloser`.
- **Decision (user):** a compact menu is the desktop popover in full: its search field with the desktop's placeholder ("Change status…", "Set effort…"), every icon, the right hand details (`Option.detail`) and the same extra rows ("Remove effort" under a separator). Only keyboard number shortcuts are left out, as a tap can't use them. It moves clear of the keyboard while its search is typed in.

## D47. Phone motion: iOS springs from one token file

- **Decision:** `apps/mobile/src/ui/motion.ts` holds the springs (`SPRING.sheet` 420 ms no overshoot, `menu` 300 ms light bounce, `press` 260 ms), the fades for Reduce Motion and the pure helpers (`rubberBand`, `dragFrom`, `settleSheet`), which are unit tested. The sheet springs with the release velocity, stops under a touch and resists past its top; the compact menu grows out of its trigger. Rule in `AGENTS.md`.

## D48. Same named Spaces from two devices stay two Spaces

- **Context:** the dev account showed Study three times and Personal twice. Cause: the scratch fixture was added to the same account several times, each copy with fresh ids. No device makes Spaces on its own, so a real person only gets two Spaces of one name when two devices each hold their own data and "Add to the account" is chosen on the second.
- **Decision:** keep both; nothing merges by name. A silent merge would mix two sets of items, labels, statuses and key counters (two `TSK-1`), which could not be undone cleanly. Alternative for later: a "Merge into…" action on a Space that moves its items with the existing move logic.
- **Flag:** the user should double check that keeping both is wanted.

## D49. Phone haptics: Core Haptics patterns behind one named API

- **Decision:** a local Expo module `apps/mobile/modules/nookly-haptics` plays beats on `CHHapticEngine` and falls back to the system feedback generators when the engine cannot start. The patterns live in JavaScript (`apps/mobile/src/ui/haptics.ts`) as one set: `tap`, `select`, `toggle`, `open`, `detent`, `edge`, `complete`, `success`, `warning`, `error`, each at most a quarter second. Screens call `haptic(name)` and never touch the engine.
- **Rate limit:** within 80 ms of a pattern only a stronger one plays (a weaker one folds into it), and each pattern has its own least gap, so scrolling a picker never buzzes. Unit tested.
- **Where:** a pick in a list or menu, a segment or tab change (select), switches (toggle), the sidebar and details drawers opening (open), a sheet falling back onto its stop (detent), a swipe row revealing its actions (edge), a task done by swipe (complete), a button's result (success, error).
- **Off:** iPads and the simulator have no Taptic Engine, so nothing plays. Android plays nothing for now (the brief allows short vibrations at most; none is better than a buzz that does not match). A switch under Settings, Appearance, This phone turns haptics off on this phone; the system's own System Haptics switch also silences the fallback presets.
- **Build note:** `@expo/plist` 0.8 calls the XML parser without a mime type, which the pinned `@xmldom/xmldom` 0.9 rejects, so `expo prebuild` failed. A one line patch (`patches/@expo%2Fplist@0.8.2.patch`) passes `text/xml`.

## D50. The phone feels native to iOS; selects are sheets with a pinned search

- **Context:** the user saw the searchable selects and found them ugly, and asked for components that feel native to iOS rather than flat desktop widgets (the full brief is in `IMPLEMENTATION_STATE.md`, section 4).
- **Decision (user):** semantic adaptive colours, SF Symbols in tinted rounded square badges, continuous corners, blur for sheets and bars, subtle depth. Selects and pickers open the bottom sheet with a pinned search, sticky section headers, icon, title and subtitle rows and a checkmark. Design tokens and a small set of base components come first and are reused everywhere. This replaces the compact menus of D46 and the rule to copy the desktop styling exactly; the desktop stays the reference for content, metadata, hierarchy and copy, and Nookly's accent and status colours stay.
- **Kept:** D47 motion, D49 haptics (Core Haptics covers the brief's expo-haptics), the user's rule that pickers keep every icon and detail the desktop shows. A Space's own chosen icon stays the Tabler icon the user picked.

## D51. Modules get an SF Symbol and a tint on the phone

- **Context:** D50 asks for SF Symbols in tinted badges; the desktop draws each module with a muted Tabler icon.
- **Decision:** `ui/kit/symbols.ts` maps every module to an SF Symbol close to its desktop icon, keeps that Tabler icon as the fallback, and gives each a tint (tasks and assignments blue, notes and jots yellow, courses and semesters purple, calendar and exams red, decks pink, sessions, recipes and grades green, files and Moodle gray). Item pickers (links, a new task's link, courses, exams) show the module's badge with the item's key or the course's professor under the title. Items with their own icon keep it. Statuses, labels and Spaces tint their badge with their own colour.
- **Why:** mixed lists read at a glance, like iOS Settings. **Flag:** the tint per module is a judgement call; the desktop has none.

## D52. Form fields are iOS form rows

- **Context:** D50. The phone's fields were the desktop's (label above an outlined box).
- **Decision:** `Field`, `SelectField`, `MultiSelectField`, `DateField` and `SheetTrigger` draw as rows of an iOS grouped form: the name at the start, the value at the end in secondary text with the up and down chevrons of a pop up button (or a clear button), several lines with the name small above. `FormSection` (`ui/kit/Form.tsx`) groups consecutive fields on one surface with hairlines; a field outside one brings its own rounded surface. Errors show under the row in red. Empty values read "None", as iOS does.
- **Why:** the user's brief; the desktop's labels and required marks stay.

## D53. Buttons are iOS capsules

- **Context:** D50. Buttons were the desktop's `buttonVariants`, small rectangles.
- **Decision:** `Button` keeps its variants and sizes but draws them as iOS's button styles in capsules: `default` filled with the accent (prominent), `secondary` on the gray fill, `destructive`, `positive`, `warning` tinted, `ghost` and `link` only words, semibold on filled ones. Heights stay `CONTROL_SIZE`.
- **Why:** capsules match iOS 26 and the round bar buttons (D45).

## D54. Moodle stays on the desktop

- **Context:** main added Moodle import (signing in to a Moodle site, pulling courses, files and assignments).
- **Decision:** the phone does not connect to Moodle. What the desktop imports syncs to the phone like any other item; files from Moodle open there as files.
- **Why:** the import runs long, downloads many files and keeps a Moodle token; the desktop is where the user sets a semester up. **Flag:** revisit if users ask to import from the phone.

## D55. A card's faces are written as blocks on the phone

- **Context:** the desktop stores a card's faces as blocks (`front_blocks`, `back_blocks`) with the markdown text beside them. The phone wrote plain text and cleared the blocks, so an edit on the phone lost the desktop's formatting on both faces.
- **Decision:** the phone writes cards with the page editor (`CardFaceEditor`), stores blocks and the text made from them, and saves only the face that changed (`updateCardFaces`). The draft of a new card is kept as blocks; an old text draft is carried over.
- **Why:** data safety; one editor everywhere.
