# Gap analysis: one connected Nookly

Written at the start of `feat/connected-platform` (from `mobile-app-and-backend`, desktop 0.36.2, mobile 0.4.1, server 0.1.0). This is the parity checklist: every row must end ticked in the **Done** column.

Legend: ✅ works, ⚠️ partial, ❌ missing, — not applicable (reason given).

## What the brief assumed vs what the repo has

| Brief says                                  | Repo actually has (verified)                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop not connected to backend at all     | Desktop 0.35 to 0.36 on this branch already has an opt in sync client (Settings, Sync): sign in, per field sync of every data table, sharing, conflict list. Never released (main is 0.33.30). No files, no settings sync, no live text merge, no status indicator, no merge editor, no migration progress or backup.                                                                                                  |
| Backend fundamentals exist but aren't wired | Elysia + Drizzle + Postgres server with its own JWT auth (argon2id, rotating refresh tokens), push/pull/WebSocket sync, sharing, 47 tests. Not better-auth, no S3/MinIO, no CRDT documents, no username accounts.                                                                                                                                                                                                      |
| Mobile has part of the features             | True. Expo app on the same SQLite schema and the same sync engine. Tasks, notes (plain text boxes per block, not the real editor), calendar entries, bookmarks, courses, exams, assignments, decks with study, labels, links, sharing, conflicts. Semesters, sessions, recipes, files and grades only list and open. Settings has only Sync and Theme. Components are hand rolled and inconsistent with the desktop's. |

## Infrastructure

| Item                                                  | Before                          | Done |
| ----------------------------------------------------- | ------------------------------- | ---- |
| One `docker compose up` for Postgres, MinIO, server   | ⚠️ server compose only Postgres | ✅   |
| `.env.example` with every variable                    | ⚠️ server only, no S3           | ✅   |
| Drizzle schema and migrations                         | ✅                              | ✅   |
| S3 client (AWS SDK v3) with endpoint/bucket/creds env | ❌                              | ✅   |
| better-auth: username + password                      | ❌ (custom email auth)          | ✅   |
| better-auth: OAuth ready (schema + client flow)       | ❌                              | ✅   |
| Sessions that stay signed in                          | ✅ (custom)                     | ✅   |
| Password reset (stubbed mailer)                       | ✅ (custom, console mailer)     | ✅   |
| Existing server accounts carried over                 | n/a                             | ✅   |
| WebSocket record notices                              | ✅                              | ✅   |
| CRDT document server (Yjs)                            | ❌                              | ✅   |
| File blobs: upload, download, checksum                | ❌                              | ✅   |
| Per field conflict detection with device and time     | ⚠️ (no device name)             | ✅   |

## Data entities and fields (sync coverage)

Every table below syncs per field today (`sync/registry.rs`). The gaps are the device local columns that point at files.

| Table / entity                                                 | Desktop             | Server           | Mobile reads        | Mobile writes (before)              | Done                                                                                      |
| -------------------------------------------------------------- | ------------------- | ---------------- | ------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------- |
| spaces (name, icon, color, position)                           | ✅                  | ✅               | ✅                  | ✅ create; ❌ edit, reorder, delete | ✅                                                                                        |
| space_modules (add, hide, order)                               | ✅                  | ✅               | ✅                  | ❌                                  | ✅                                                                                        |
| entities (title, icon, pinned, space, key, trash)              | ✅                  | ✅               | ✅                  | ⚠️ no icon, no move to Space        | ✅                                                                                        |
| labels, entity_labels                                          | ✅                  | ✅               | ✅                  | ⚠️ attach only, no manage           | ✅                                                                                        |
| task_statuses (name, color, doneness, order)                   | ✅                  | ✅               | ✅                  | ❌                                  | — the desktop's statuses are fixed, so there is nothing to manage                         |
| tasks (status, start, due, completed, effort, repeat)          | ✅                  | ✅               | ✅                  | ⚠️ no effort, no repeat             | ✅                                                                                        |
| sub-tasks (`sub-task-of`)                                      | ✅                  | ✅               | ⚠️                  | ❌                                  | ✅                                                                                        |
| relationships (all types, block targets)                       | ✅                  | ✅               | ✅                  | ⚠️ `relates-to` only                | ✅                                                                                        |
| blocks (page body, every block type)                           | ✅                  | ✅               | ⚠️ text types only  | ⚠️ text types only                  | ✅                                                                                        |
| note_settings (code language)                                  | ✅                  | ✅               | ❌                  | ❌                                  | ✅                                                                                        |
| courses (professor, room)                                      | ✅                  | ✅               | ✅                  | ✅                                  | ✅                                                                                        |
| semesters (dates, term, year, current, order)                  | ✅                  | ✅               | ⚠️                  | ❌                                  | ✅                                                                                        |
| session_templates, sessions, series_slots                      | ✅                  | ✅               | ⚠️                  | ❌                                  | ⚠️ one occurrence can be changed; whole series are made and edited on the desktop         |
| calendar_entry_templates, calendar_entries                     | ✅                  | ✅               | ✅                  | ⚠️ single entries only              | ⚠️ one-off entries, multi day, and one occurrence of a series; series made on the desktop |
| exams, study_blocks                                            | ✅                  | ✅               | ✅                  | ⚠️ no study blocks                  | ✅                                                                                        |
| assignments (incl. due session offset)                         | ✅                  | ✅               | ✅                  | ⚠️ no due session                   | ⏳                                                                                        |
| index_card_decks, index_cards, index_card_reviews              | ✅                  | ✅               | ✅                  | ✅ (no undo review)                 | ✅                                                                                        |
| files (metadata)                                               | ✅                  | ✅               | ⚠️                  | ❌                                  | ✅                                                                                        |
| files (contents)                                               | local only          | ❌               | ❌                  | ❌                                  | ✅                                                                                        |
| bookmarks (+ screenshot file)                                  | ✅                  | ⚠️ no screenshot | ✅                  | ✅ create                           | ✅                                                                                        |
| recipes, ingredients, steps, recipe_tags, tag links (+ banner) | ✅                  | ⚠️ no banner     | ⚠️                  | ❌                                  | ✅                                                                                        |
| views (saved views)                                            | ✅                  | ✅               | ❌                  | ❌                                  | ✅                                                                                        |
| settings (`settings.json`)                                     | local only          | ❌               | ❌                  | ❌                                  | ✅                                                                                        |
| conflicts                                                      | ✅ list, bring back | ✅               | ✅ list, bring back |                                     | ✅ merge editor                                                                           |

## Desktop features and where they stand on mobile

### Shell and navigation

| Feature                                                                                 | Desktop      | Mobile before                                                         | Done                                                                                                 |
| --------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Sidebar: Dashboard, Calendar, Tasks, Assignments, Pinned, Quick Jot block               | ✅           | ⚠️ no Assignments overview, no Quick Jot                              | ✅                                                                                                   |
| Sidebar: hide and reorder the top block                                                 | ✅           | ❌                                                                    | ✅                                                                                                   |
| Spaces list with icon and accent color                                                  | ✅           | ✅                                                                    | ✅                                                                                                   |
| Space create (icon, color, template)                                                    | ✅           | ⚠️ no template                                                        | ✅                                                                                                   |
| Space settings: rename, icon, color, reorder, delete                                    | ✅           | ❌                                                                    | ✅                                                                                                   |
| Module rows per Space; Add Module; Remove Module (hide or trash)                        | ✅           | ⚠️ list only                                                          | ✅                                                                                                   |
| Saved views under modules                                                               | ✅           | ❌                                                                    | ⚠️ listed in the Tasks display panel                                                                 |
| Pinned                                                                                  | ✅           | ✅                                                                    | ✅                                                                                                   |
| Search (full text, keys)                                                                | ✅           | ⚠️ titles only                                                        | ✅                                                                                                   |
| Recents                                                                                 | ✅ (palette) | ✅                                                                    | ✅                                                                                                   |
| Trash: list, restore, empty                                                             | ✅           | ⚠️ no empty                                                           | ✅                                                                                                   |
| Command palette, quick open                                                             | ✅           | — keyboard only; search covers it on phone, hardware keyboard on iPad | ✅ (search)                                                                                          |
| Tabs and split view                                                                     | ✅           | — a phone shows one page; iPad gets sidebar + page instead            | —                                                                                                    |
| What's new dialog                                                                       | ✅           | ❌                                                                    | ✅ a What's New page in Settings                                                                     |
| Entity keys (`TSK-14`) in headers and lists                                             | ✅           | ⚠️                                                                    | ⏳                                                                                                   |
| Icon picker (emoji and icons)                                                           | ✅           | ❌                                                                    | ✅                                                                                                   |
| Context actions: rename, icon, pin, move to Space, duplicate, copy link, trash, restore | ✅           | ⚠️ pin, trash                                                         | ⚠️ rename, icon, pin, move, trash, restore, duplicate (tasks, pages, bookmarks); copy link not built |
| Right sidebar: Attachments, Mentioned, Mentioned in, Relationships                      | ✅           | ⚠️ Related only                                                       | ✅ Related, Attachments, Mentioned, Mentioned in                                                     |
| Labels: attach, create, rename, recolor, delete                                         | ✅           | ⚠️ attach and create                                                  | ✅                                                                                                   |
| Import and export pages, tasks, decks, assignments                                      | ✅           | ❌                                                                    | ⏳                                                                                                   |
| Share with people (pages, tasks)                                                        | ✅           | ✅                                                                    | ✅                                                                                                   |

### Modules

| Module                                                                       | Desktop                     | Mobile before       | Done                                                                                       |
| ---------------------------------------------------------------------------- | --------------------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| Dashboard: briefing, Assignments, Tasks, Decks, Jots, today's Calendar       | ✅                          | ⚠️ simplified       | ✅ a plain sentence instead of the desktop's linked one                                    |
| Calendar (unified): day, week, month; sessions, entries, exams, study blocks | ✅                          | ⚠️ agenda list only | ✅ agenda, day, week, month                                                                |
| External calendar overlay (Google, iCloud)                                   | ✅ (device local, keychain) | ❌                  | — desktop only, see DECISIONS D14                                                          |
| Tasks: board, list, group, filter, display options, overview                 | ✅                          | ⚠️ list             | ✅                                                                                         |
| Tasks: quick create with status, label, date, link                           | ✅                          | ⚠️                  | ✅                                                                                         |
| Tasks: effort, repeat, sub-tasks, start date                                 | ✅                          | ❌                  | ✅                                                                                         |
| Task statuses: rename, recolor, doneness, add, delete                        | ✅                          | ❌                  | — the desktop has fixed statuses                                                           |
| Notes: block editor with every block type                                    | ✅                          | ⚠️ text boxes       | ✅ shared editor                                                                           |
| Notes: live collaboration, carets, presence                                  | ❌                          | ❌                  | ✅                                                                                         |
| Notes: mentions, slash menu, inline math, highlight                          | ✅                          | ❌                  | ⏳                                                                                         |
| Jots: instant capture, refine into note                                      | ✅                          | ⚠️ no refine        | ✅                                                                                         |
| Courses: grid, detail, professor, room, semester, sequels                    | ✅                          | ⚠️                  | ✅ list with semester, exams, assignments, sessions                                        |
| Semesters: list, detail, setup wizard, current                               | ✅                          | ⚠️ list             | ✅ a simpler setup than the wizard: system, term, year, region dates                       |
| Sessions: series, overrides, edit scope, cancel, jot and note                | ✅                          | ⚠️ list             | ⚠️ sessions list, edit one session, cancel, one-off; series made and edited on the desktop |
| Calendar entries: series, all day, multi day                                 | ✅                          | ⚠️ single           | ⚠️ one-off, all day, multi day; whole series on the desktop                                |
| Exams: list, detail, date, time, room, weight, grade, status                 | ✅                          | ✅                  | ✅                                                                                         |
| Study blocks                                                                 | ✅                          | ❌                  | ✅                                                                                         |
| Assignments: list, overview, due session                                     | ✅                          | ⚠️                  | ✅                                                                                         |
| Decks: piles, writing desk, study, undo review                               | ✅                          | ⚠️ no undo          | ✅ stats and study with undo; no separate piles screen                                     |
| Grades report                                                                | ✅                          | ❌                  | ✅                                                                                         |
| Files: grid, viewer (images, PDF, text, code, markdown)                      | ✅                          | ❌                  | ✅                                                                                         |
| Files: Office conversion, OCR, open in                                       | ✅ (LibreOffice, Vision)    | ❌                  | ⚠️ Office files open in the system's viewers through Open In, not converted                |
| Files: add from picker, camera, share                                        | ✅ (drop, picker)           | ❌                  | ✅                                                                                         |
| Bookmarks: grid, preview, metadata refresh, snapshot                         | ✅                          | ⚠️                  | ⏳                                                                                         |
| Recipes: list, detail, ingredients, steps, tags, banner                      | ✅                          | ⚠️ list             | ✅                                                                                         |
| Views (saved views)                                                          | ✅                          | ❌                  | ⚠️ saved views of Tasks: open, save, delete; Assignments views not built                   |
| Trash                                                                        | ✅                          | ⚠️                  | ✅                                                                                         |

### Settings screens

| Setting (`settings.json` id)                                                                      | Desktop | Mobile before | Syncs (Done) | Mobile (Done)                                                                               |
| ------------------------------------------------------------------------------------------------- | ------- | ------------- | ------------ | ------------------------------------------------------------------------------------------- |
| General: display name (`general.displayName`)                                                     | ✅      | ❌            | ✅           | ✅                                                                                          |
| General: time zone                                                                                | ✅      | ❌            | ✅           | ✅                                                                                          |
| General: date format, time format                                                                 | ✅      | ❌            | ✅           | ✅                                                                                          |
| General: effort scale                                                                             | ✅      | ❌            | ✅           | ✅                                                                                          |
| Appearance: theme                                                                                 | ✅      | ✅            | per device   | ✅                                                                                          |
| Appearance: file viewer theme                                                                     | ✅      | ❌            | per device   | ✅                                                                                          |
| Calendar: session length, entry length, week start, day start, today color, today intensity, snap | ✅      | ❌            | ✅           | ✅                                                                                          |
| Editor: default code language, format on paste, arrow ligatures, LaTeX macros                     | ✅      | ❌            | ✅           | ✅                                                                                          |
| Editor: Vim keys                                                                                  | ✅      | ❌            | per device   | — needs a hardware keyboard; iPad only                                                      |
| Backup: folder, daily, back up now, restore                                                       | ✅      | ❌            | per device   | — the server is the phone's backup; see D15                                                 |
| Agent files                                                                                       | ✅      | ❌            | per device   | — they feed a desktop coding agent                                                          |
| Shortcuts                                                                                         | ✅      | ❌            | per device   | — hardware keyboard only                                                                    |
| Account: sign in, sign up, sign out, username, email, password                                    | ⚠️      | ⚠️            | ✅           | ✅                                                                                          |
| Account: devices, sign out a device                                                               | ✅      | ✅            | ✅           | ✅                                                                                          |
| Account: delete account                                                                           | ✅      | ✅            | ✅           | ✅                                                                                          |
| Sync: status, sync now, conflicts                                                                 | ✅      | ✅            | ✅           | ✅                                                                                          |
| Shared with me                                                                                    | ✅      | ✅            | ✅           | ✅                                                                                          |
| Task statuses, labels, recipe tags (managed in place on desktop)                                  | ✅      | ❌            | ✅           | ✅ labels in Space settings; statuses and recipe tags are fixed catalogs on the desktop too |

### Desktop only by nature

These exist on the desktop and are deliberately not built on mobile. Each needs something a phone doesn't have.

| Feature                          | Why not on mobile                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| CLI and its install card         | No shell on a phone.                                                                              |
| Agent files                      | They are read by a coding agent on the computer.                                                  |
| Tabs, split view, shortcuts, Vim | Keyboard and window concepts. iPad gets the persistent sidebar layout instead of tabs.            |
| Backups to a folder, restore     | The server holds the account; the desktop keeps its backups.                                      |
| External calendar overlay        | OAuth client and keychain credentials are per desktop; overlay is read only and not account data. |
| Office to PDF conversion, OCR    | Need LibreOffice and macOS Vision; the phone hands those files to the system viewer.              |
| Updater                          | The App Store updates the phone.                                                                  |

## Sync and data safety (new)

| Item                                                                                                     | Before                                      | Done      |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------- |
| First sign in on a desktop with data: backup first                                                       | ❌                                          | ✅        |
| Migration progress and summary                                                                           | ❌                                          | ✅        |
| Migration idempotent and resumable                                                                       | ✅ (dirty marks cleared only on server ack) | ✅ tested |
| Files uploaded with checksum                                                                             | ❌                                          | ✅        |
| Merge into an account with data                                                                          | ✅ (per field, by edit time)                | ✅ tested |
| Live text merge (CRDT)                                                                                   | ❌ (per block last writer)                  | ✅        |
| Same field on two offline devices becomes a conflict                                                     | ✅                                          | ✅        |
| Different fields merge silently                                                                          | ✅                                          | ✅        |
| Merge editor (This device / Other device, side by side, keep this, keep other, keep both, edit combined) | ❌                                          | ✅        |
| Conflict badge on the item                                                                               | ❌                                          | ✅        |
| Sync status indicator                                                                                    | ⚠️ text in Settings                         | ✅        |
| Upload queue with retry                                                                                  | ❌                                          | ✅        |
| Tests: crash mid sync, offline mid upload, two devices same item                                         | ⚠️                                          | ✅        |
