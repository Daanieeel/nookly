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

- **Decision:** CLI, agent files, tabs and split view, keyboard shortcuts, Vim keys, folder backups, Office conversion and OCR are not built on mobile. GAP_ANALYSIS.md lists why for each.

## D16. One dev stack command

- **Decision:** `docker-compose.yml` at the root runs Postgres, MinIO (with its bucket made by a one shot `mc` container) and, under the `server` profile, the server. `bun run stack` starts the containers, applies migrations and runs the server on the host with watch mode; `bun run dev` keeps starting everything (server, desktop, mobile).

## D17. The phone's editor is ProseMirror on the desktop's exported schema (refines D12) ⚑

- **Decision:** the DOM component runs ProseMirror and y-tiptap directly, on a schema built from `packages/shared/src/generated/editor-schema.json`. A desktop test writes that file from the real TipTap extensions and fails when it drifts, so the two cannot disagree silently. The phone's own Yjs document (offline copy, socket, `PageDocs`) stays in React Native; the web view has a second document and the two swap updates as base64 over the bridge (Yjs makes repeats and order harmless). Awareness (carets and names) crosses the same way. The toolbar is native, above the keyboard. Blocks the phone has no editor for (timelines, images, files, embeds, linked items) show as labelled cards and keep their attributes untouched.
- **Alternatives:** bundle the desktop's TipTap extensions (they import the desktop's `#/` modules, React node views and settings, which the DOM bundle cannot resolve); a native editor with no schema guarantee.
- **Why:** the schema is what matters for y-prosemirror (D6), and a generated file with a drift test gives that without dragging the desktop's UI code into a web view. Check: edits made in the web view reach the phone's rows and the server, and an edit from another client shows in the phone's editor within a second (verified in the simulator).
- **To double check:** the phone cannot edit table cells' column widths, inline math, or the atom blocks' rows; they round trip but are not editable there.

## D18. Permanent deletes on the phone confirm with an alert, and Space deletion lists what goes ⚑

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

- **Decision:** every item type marks what belongs in the middle (`MainPart`: title, the description, its own lists) and what is a property or setting (`DetailsPart`); the same screen renders twice, in the page and in the details (`ItemParts.tsx`, `ui/parts.tsx`). On a phone the details are a drawer on the right (`shell/DetailsDrawer.tsx`), on a wide iPad the inspector beside the page. The native header is hidden on item pages; the page draws its own top bar (back, key, stepper, conflict badge, details, more) so the whole page, bar included, slides and is rounded.
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
- **Not built, on purpose:** restoring a backup on the phone (it would replace the open database; signing in on a new phone brings everything back and never replaces what is there), external calendars, Vim keys, Office conversion and OCR, the PDF paged viewer, series (D19).

## D34. A page made on the phone asks for its document again a few times

- **Decision:** a page made less than two minutes ago, while the phone is online, asks the server for its document up to three more times, three seconds apart, before it settles for the rows editor. The server refuses a page it has not received yet ("No such page"); the first sync round delivers it.
- **Why:** pages made on the phone opened in the rows editor instead of the live one.
