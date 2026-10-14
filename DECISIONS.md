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
  - Keep both: for text it joins both versions in the combined editor; for a date, status or other single value it makes a copy of the item holding the other value ("<title> (from iPhone)").
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
