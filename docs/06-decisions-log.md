# Decisions Log

Each entry follows a lightweight ADR format: the decision, why it was made, and which alternatives were rejected. Check this log before reversing any decision.

---

### Modules split into Data Providers and Viewers

**Why:** the community can reskin data without forking or editing the original module. Core modules stay stable and only ever grow.

**Rejected:** a single, flat "module" concept. It would tie UI and data ownership together and block alternate viewers.

---

### Opinionated modules over a flexible canvas

**Why:** Notion's total flexibility is overstimulating. Constrained page types, as in Jira and Linear, keep capture focused. Many specialized modules give enough variety without overwhelming any single one.

**Rejected:** one universal, flexible block canvas for everything (a pure Notion clone).

---

### The relationship system is the only linking mechanism

**Why:** pages cannot nest, since each one belongs to exactly one Space. Nookly needs one consistent way to connect anything to anything, across modules and Spaces.

**Rejected:** letting each module invent its own ad hoc linking or reference fields (for example, Course prequel and sequel as dedicated fields). That creates competing mechanisms and defeats the goal of a single core one.

---

### Relationships are directed, use a fixed enum, and have unrestricted cardinality

**Why:**

- **Directed:** inverse labels are derived cleanly with no duplicate storage.
- **Fixed enum:** the graph stays predictable and queryable, and modules extend it at build time.
- **Unrestricted cardinality at the data layer:** the core engine stays simpler. Stricter rules (such as a single parent) apply only to specific structural relationship types where they are truly needed.

**Rejected:** freeform string labels (impossible to govern), symmetric relationships by default (loses direction), and enforced cardinality on every type (overconstrains the generic case).

---

### Attachments are a relationship type; Mentions stay outside the graph

**Why:** this avoids a fourth competing linking mechanism. An Attachment is the relationship type "attached-file." A Mention is an inline markdown reference and stays separate from the formal graph, because it is contextual rather than structural.

**Rejected:** fully separate attachment and mention engines with no connection to the core relationship system.

---

### Labels are siloed per Space, not global

**Why:** the user does not want an "Algorithms" label bleeding into the Work Space, or "Department XYZ" cluttering the Study Space. Siloing solves this for free through the existing `space_id` field.

**Rejected:** global labels with an optional "show everywhere" flag. It adds UI complexity for a need siloing already covers.

---

### Four pairs are structural relationships

Task and Sub-task, Session and Course, Exam and Course, and Assignment and Course. Deck and Exam was one until Decks became their own module (see below).

**Why:** the child is meaningless without its parent. A session without a course makes no sense. Structural relationships are enforced at the data layer, not just by convention, which sets them apart from generic, unenforced ones like a Course `sequel-of`.

**Rejected:** treating every relationship as equally generic. That would allow orphaned Sessions, Exams, and Assignments with no parent, which never makes sense in the real world.

---

### Modules are packaged at compile time, not loaded as runtime plugins

**Why:** the app is personal first and its audience is technical (open source and forkable). Recompiling to add a module is acceptable for that audience, and it avoids building a whole plugin runtime with sandboxing and versioning before the module API is proven.

**Rejected:** a runtime plugin architecture (WASM or dynamic loading) for v1. It is premature abstraction with real engineering cost and no proven API to stabilize yet. Deferred to the future.

---

### No git-backed local repo and no version history

**Why:** git was originally proposed to power undo, rollback, and optional data publishing. It was dropped once the user considered attachment bloat: binary files make a repo's history huge and impractical.

**Resolution:** undo and redo use an in-memory action stack scoped to the session. Durable history is fully out of scope until cloud sync arrives, at which point large files go to S3-like storage instead of being versioned locally.

---

### Soft delete everywhere, no hard delete, no auto-purge by default

**Why:** with git and version history rejected, soft delete plus Trash is the **only** remaining safety net against accidental deletion.

**Resolution:** wherever a soft-deleted entity is still referenced (relationships, attachments, mentions), render it at reduced opacity instead of hiding it or breaking the link.

---

### Spaces are a hard wall with a short list of exceptions

The exceptions are Dashboard, Pinned, and Search, plus Recents, which was added later (see below).

**Why:** this matches how Notion actually behaves, which the user pointed to with a screenshot. It keeps the mental model simple: a Space is a folder, not a boundary for scoping or config.

**Rejected:** global views per module (for example "all Tasks in every Space"). The user confirmed that Spaces should be a hard wall and that Pinned and the Dashboard cover cross-Space needs.

---

### A single global Dashboard (not per Space, not multiple)

**Why:** the user wants one page for quick access across Spaces. Per-Space dashboards are wanted eventually, but were deliberately deferred to keep this decision small and shippable now.

---

### Dashboard panels: Assignments, Jots, Tasks, Calendar, Decks

Reworked in 0.33.0 from Today, Unrefined Jots and This Week. Five flat panels in two columns under the briefing,.

Originally exactly three, in that order. Every count in the briefing sentence opens its module's list, every name opens that entity and renders as a bounded pill. They render as flat sections, not cards.

**Rejected:** Recent, Pinned, Spaces and Overview cards. Pinned and Spaces repeat the sidebar, Recents lives in the palette, and raw counts are not useful. A bento grid of cards was also dropped; the user preferred the content flat.

---

### Files are copied into local storage, not referenced by path

**Why:** it is predictable and portable, and it survives the user moving, renaming, or deleting the original file elsewhere on disk.

**Rejected:** storing only a path reference. It is fragile and breaks silently when the source file moves.

---

### Files as links are provider-aware (Drive, Dropbox, iCloud) with a generic URL fallback

**Why:** it opens the door to provider-specific features later (thumbnails, live status) without blocking on them now. The generic URL fallback covers everything else with no extra engineering.

---

### Bookmarks are a separate entity from files as links

**Why:** the intent differs. A file as link says "this is a document"; a Bookmark says "this is a reference or webpage." Merging them would muddle the Attachments UI and the meaning of exports.

---

### Full-text search spans the whole app and ignores the Space wall

**Why:** search is a utility action, not a view. The user should not have to guess which Space something lives in just to find it.

**Rejected:** search scoped to a Space. It would undercut the point of having one unified app for one person's whole life.

---

### Recents is the fourth sanctioned cross-Space exception

The full list is now Dashboard, Pinned, Search, and Recents.

**Why:** it offers a fast way back to items actually in use without drilling from Space to module to entity every time. It differs from Pinned, which is curated by hand, because it is automatic and driven by usage.

**Rejected:** folding it into Pinned (mixes manual curation with usage history), and making cross-Space access a general capability that modules can opt into (already ruled out by the "one at a time, deliberately" rule).

---

### Jots are refined into Notes, there is no Refinement type

**Why:** a Refinement was already conceptually a Note on the same canvas. A second page type only split the same content across two lists.

**Rejected:** keeping Refinement as its own entity type.

---

### Code blocks highlight with twinkleplop, Shiki is the fallback

Every language twinkleplop ships goes through it. Shiki only covers the picker languages twinkleplop lacks (C#, Java, PHP, Ruby, INI, JSONC, Assembly). Both map onto the same accent tokens.

**Why:** the edited block is retokenized synchronously on every keystroke. Shiki's JS engine takes about 16ms for an 80 line block, a full frame, while twinkleplop takes under 0.1ms. First highlight after launch drops from about 300ms to about 20ms.

**Rejected:** a full swap now (loses six languages), and staying on Shiki alone. Twinkleplop is 0.x, so versions are pinned exactly and its API is contained in `twinkleplop-highlighter.ts`.

---

### Updates come from GitHub Releases through the Tauri updater

The app reads `latest.json` from the newest published release, checks on launch, every 30 minutes (also while the window is hidden) and when the window regains focus, and installs plus restarts in one click from the sidebar card or the Settings dialog.

**Why:** releases already live on GitHub, and `tauri-action` generates and uploads the signed update manifest for free.

**Rejected:** a custom update server, and silent background installs.

---

### Custom blocks export as mdxcn framed ASCII

Custom blocks (callout, timeline, progress, tree, steps, stats, details) serialize to mdxcn's fenced ASCII figures, ported to Rust in `ascii_frame.rs` (MIT).

**Why:** plain markdown has no form for a timeline or progress bar. A fenced figure keeps the export complete and reads the same in a README, GitHub or Linear.

**Rejected:** installing mdxcn's React components (Geist Mono, dashed frames, their own tokens clash with the design system), and GFM alerts for callouts (kept one export style for every custom block).

---

### Media, bookmark and linked item blocks point at entities

Image, video, audio and file blocks hold a mention of a File entity, a web bookmark block a Bookmark entity, and a linked item card any entity. Uploads are imported into the page's Space.

**Why:** Files and Bookmarks already own that data. The block is a viewer, the mention puts the page under the entity's Mentioned in, and nothing becomes a fourth linking mechanism.

**Rejected:** storing uploads privately inside the page, invisible to the Files module.

### Files are real files; a typed path is referenced until copied

A pasted link is downloaded into storage, and a webpage is offered as a Bookmark instead. A path typed into the Files bar is referenced where it lives; "Copy into Nookly" copies it in. Drops and the file picker still copy right away. A File can convert into a Bookmark in place through the generic `convert` registry.

**Why:** the file viewer needs the bytes, and a link to a webpage is a reference, which is what Bookmarks are for. Referencing a typed path keeps a file that is still being edited elsewhere in sync.

**Rejected:** link only Files the viewer can't open, and a one off CLI command for the conversion.

---

### Index cards schedule with FSRS through `rs-fsrs`

**Why:** FSRS is what Anki schedules with. `rs-fsrs` (MIT) is the scheduler alone and depends only on chrono.

**Rejected:** embedding Anki's `rslib` (a second data model next to entities), the `fsrs` crate (pulls in an ML stack for its optimizer), and Leitner boxes.

---

### Records an entity owns reach the CLI as child collections

A `ChildCollectionDef` registered next to a type's schema gives the CLI `<plural>`, `add-`, `get-`, `update-`, `delete-`, `restore-` and one verb per action for that record, like `review-card`. Index cards are the first.

**Why:** cards need full CLI coverage without becoming entities (keys, search, Recents for every card) and without a one off command.

**Rejected:** making every card an entity.

---

### Decks are their own module, and an Exam is optional

**Why:** decks are studied daily, well before and apart from any exam (vocabulary, general knowledge). A deck can still be filed under one Exam and shows on its Decks tab.

**Rejected:** keeping decks inside Exams with a required Exam, which forces an exam to exist before any card can be written.

---

### External calendars are a read only overlay, not Sessions

Google Calendar, iCloud and Moodle events show on the Sessions calendar but are never entities: no Space, no relationships, no Course, no CLI exposure. Nookly never writes to any of them.

**Why:** converting them to Sessions would force a Course onto events like "Dentist" and break the Session and Course structural rule.

**Rejected:** importing external events as Sessions or any other entity type, and two way sync.

---

### Moodle is a read only module with no entities

Moodle courses, assignments, grades and forum posts are read from the user's site and shown in a Moodle module that can be added to any Space. They are not entities: no Space of their own, no relationships, no search, no CLI exposure. Nookly never writes to Moodle.

**Why:** the data belongs to the university, changes there without Nookly knowing, and can disappear after a term. Copying it into entities would need conflict rules and would put a second, possibly stale, copy of someone else's records in the user's data. Files the user downloads stay on disk, so nothing they saved is lost when a course closes.

**Rejected:** importing Moodle into Courses and Assignments (conflict handling and stale copies), and a username and password login (fails on single sign on sites).

**Amended:** linking a Moodle course to a Nookly Course needs a relationship to something that is not an entity. That is now a hidden reference behind a File (see [below](#references-are-a-hidden-record-behind-a-file-not-an-entity)): the Moodle data is still not copied.

---

### References are a hidden record behind a File, not an entity

A reference holds identity and a last known title for a file path, a link or a Moodle object, and gives a File an availability: one of five states, worked out live on each device and never stored (see [References](03-modules/references.md)).

**Why:** each feature handled a missing or offline target its own way or not at all, and with cloud sync a file path from one device means nothing on another. Users should see only Files, so a reference is never an entity of its own: a File that only points elsewhere keeps its type, id and key, and the record sits behind it. Relationships, mentions, the Files page and the old columns (for a rollback) do not change.

**Rejected:** a visible `reference` entity (a second kind of thing in every list and picker), storing the state in the synced record (wrong on some device), and copying Moodle content into entities (stale copies). Bookmarks are untouched: they own real content (favicon, preview, snapshot).

---

### Relationships moved to the bottom of the right sidebar

**Why:** Relationships is usually the largest section, so putting it first pushed Attachments, Mentioned and Mentioned in far down the page on entities with many links.

**Resolution:** the right sidebar's fixed order is now Attachments, Mentioned, Mentioned in, Relationships.

---

### Turborepo monorepo with separate ui and frontend packages

The design system lives in `@nookly/ui`, every other component and all app logic in `@nookly/frontend`, shared tooling config in `@nookly/config`, and the Tauri shell in `apps/desktop`.

**Why:** a future web app can reuse the whole frontend without copying it, and the primitives stay isolated from app code, which keeps the frozen design system easy to guard.

**Rejected:** one package with path aliases, which ties every component to the Tauri app; and a single shared package for ui and frontend, which lets primitives depend on app state.

---

### Saved Views are entities, listed under their module in the sidebar

A View is a `view` entity holding a module (Tasks or Assignments) and a JSON config of that page's filters and display options. Its module's sidebar row expands to list the Space's Views, and opening one applies its config to the module page, where edits are a draft until saved. The CLI gets Views through the generic schema registry.

**Why:** an entity brings the title, icon, pin, trash, duplicate and search for free, and keeps user made Views in the database, its backups and the CLI. The Space wall stays intact, since a View's filters (statuses, Courses, labels) only make sense inside one Space.

**Rejected:** storing Views in the device preferences file (not in backups or the CLI) and a section apart from the modules in the sidebar.

---

### Backups go to a folder, and restores install at the next launch

Settings has a Backup tab that writes one zip to a chosen folder, on demand or daily. The zip holds a snapshot of `nookly.db` and every other file in the app data folder (stored files, recipe banners, bookmark previews, preferences, external calendar settings), except caches that rebuild themselves. A restore is staged, then installed by the next launch before the database opens, and the replaced data is kept in `restore-safety/` inside the app data folder.

**Why:** a folder needs no OAuth or network code, and pointing it into iCloud Drive, Google Drive or Dropbox reaches all of them. Backing up the whole app data folder, not a list of tables, means a new kind of stored data is covered without extra work. Swapping a live database is unsafe, so the swap happens when nothing has it open.

**Rejected:** a Google Drive API integration (OAuth and upload code for one provider), and keeping the live database inside a synced folder (sync clients corrupt SQLite).

---

### Linux packages and SHA256SUMS get detached GPG signatures

The release workflow signs `.deb`, `.rpm`, `.AppImage` and `SHA256SUMS` with a project GPG key and uploads `<file>.asc` beside them. The public key is committed as `nookly-release.asc`.

**Why:** the Tauri updater key only protects in-app updates. A manual download needs a signature users can check against a key that lives in the repo, not only on the release page. Signing `SHA256SUMS` extends that to macOS and Windows files.

**Rejected:** a signed apt repo (hosting and maintenance for one app) and AppImage embedded signatures (need the same key, verified by fewer tools).

---

### Removing a module from a Space hides or trashes its content

Remove Module on a sidebar row offers two choices. Hide keeps every entity and marks it `hidden_at` (and `deleted_at`, so all existing queries skip it). Trash soft deletes them like any other deletion. Re-adding the module restores only the hidden ones.

**Why:** reusing `deleted_at` hides the content from search, Pinned, the Dashboard and the Calendar without touching dozens of queries. `hidden_at` keeps it out of Trash, restore, Delete Forever and Empty Trash, so kept data can never be erased from there.

**Rejected:** hard deleting on removal (data loss), and only hiding the sidebar row (content would still show in search and Pinned).

---

### The Tasks and Assignments overviews are cross-Space exceptions

A Tasks page below Calendar lists every Space's tasks, and an Assignments page below it does the same for assignments, each marked with its Space's color. Labels are left out of it, since they belong to a Space. Sidebar items that span Spaces can be hidden and reordered from a settings button, stored as a device preference.

**Why:** with several Spaces, "what is due across everything" was only answerable one Space at a time. The sidebar was also filling up with cross-Space entries not everyone uses.

The overviews can be saved as Views (modules `tasks-overview` and `assignments-overview`) and take the view presets. Like every entity, a View still belongs to one Space, which is the active one when saving, and is listed under the Tasks row of the sidebar. Trashing that Space trashes its Views with it.

**Rejected:** a View without a Space (breaks one Space per entity), and a cross-Space task create (a task needs a Space to live in).

---

### Agent files are plain files, with no AI integration

Settings has an Agent tab for markdown files (`AGENTS.md` and others) in a folder the user hands to their own coding agent. Nookly only manages the files. It runs no agent, calls no model and stores no keys.

**Why:** The app stays free of AI features and API keys, while a shared folder of instructions still lets a coding agent work through the `nookly` CLI.

---

### Pages port between Nookly instances as JSON, not markdown

A Note or Jot exports as a `nookly-page` JSON file that keeps every block with its settings, and imports as a new page. Markdown stays the format for reading elsewhere.

**Why:** the markdown export flattens custom blocks into ASCII figures, so a page could not come back whole. Links, labels and files belong to one instance and stay behind: mentions become text, and media blocks become a paragraph with the file name.

---

### Tasks, Decks and Assignments port as JSON, one format per type

A Task exports as `nookly-task`, a Deck as `nookly-deck` and an Assignment as `nookly-assignment`, next to `nookly-page`. Each has `format`, `version` and `kind`, is read strictly (an unknown or missing field refuses the whole file) and imports as a new entity, never changing an existing one. A `PortableDef` registered next to the type drives the app, the commands and the CLI's generic `export` and `import` verbs, so a new type needs no new command.

- **One format per type, not one shared envelope.** Each type has its own fields and its own version, so one can change without touching the others, and a file says clearly what it is. An import reads `format` to know which.
- **Tasks keep their Sub-tasks**, nested one level under `subtasks` (title, status, dates, effort and description blocks), as in the app. The status travels as its name and doneness: an import uses the status with that name, else the first with the same doneness, else the first. A finished one arrives finished and, when it repeats, starts no next occurrence. Labels, links (so its Course) and the completion time stay behind.
- **Decks export their cards' front and back only.** When a card is due, how well it is known and its review history belong to the person who studied it, so imported cards start as new. The Exam a Deck is filed under stays behind.
- **Assignments export title, status, due day, grade, weight and description.** An Assignment has no sub-items: its Tasks are separate entities and stay behind with the other relationships. A due day that followed a session travels as the plain day it resolved to. The Course is named as text and never looked up, and the import is filed under a Course the user picks, because every Assignment belongs to exactly one.

**Why:** Pages already move this way, and the same rule fits: what belongs to one instance (ids, timestamps, labels, relationships, the Space, scheduling) never travels, and a reference to another entity becomes plain text. No schema changes, so no migration.

---

### Split view: two tab groups, the focused one mirrored in the store

Up to two tab groups sit side by side. The nav store keeps the focused group's tabs and its active tab's view and history in the same live fields as before (`tabs`, `view`, `backStack`, ...), and the other group in `groups`. Group operations are pure functions in `lib/store/tab-groups.ts`. Everything rendered inside a group reads its own view and tab through `useTabGroupScope`, and view shortcuts only fire in the focused group.

- **The focused group drives everything global.** The sidebar, palettes, Back and Forward, Recents and Cmd click act on it, and pressing or focusing inside a group focuses it first, so a click in a group navigates that group without each caller knowing about groups.
- **Split Right copies the tab, dragging moves it.** As in VS Code. A group with no tabs closes, so the right group only exists while it has one.
- **One key, both shapes.** `nookly:tabs` still lists every tab flat, which is all the previous release reads, and adds `groups` with tab ids. An older release drops `groups` when it saves, and its tabs then load into one group, so going back and forth never loses a tab.
- **The same page in both groups has one writer.** Each editor keeps its own document and saves block by block, so two typing at once would overwrite each other. Only the focused group's editor is editable; the other is read only, follows the saves and takes over once its group is focused and no save of the other is in flight.
- **Views size to their pane.** Page level breakpoints are container queries on the group's scroller, so a list in half the window lays out like a narrow window.
- **Narrow windows show one group.** Below twice the 360px minimum, only the focused group shows, with a button to switch.

**Rejected:** more than two groups or vertical splits (more layout to manage than a personal tool needs), a store rewritten around a list of groups with derived live fields (touches every navigation call for no behavior gain), sharing one editor document between groups (a large editor refactor), and blocking the same page from opening twice (VS Code allows it and it is useful for long pages).

---

### Sync: local first, opt in, row records with per field clocks

Each device's SQLite stays the source of truth; the app keeps working fully offline and with no account, and the server is never required. While sync is on, triggers mark changed rows, and every synced row becomes a record with a hybrid logical clock per field and a delete clock (see [sync protocol](development/sync-protocol.md)). Merges are last writer wins per field, as a CRDT, so devices converge in any order; losing concurrent edits go to a conflicts log on both ends.

**Why:** rows already carry stable ids, and a per row record maps to every table without per module code. Triggers catch every write, including the CLI's. Field level clocks keep unrelated edits apart (a title on one device, a due date on another).

**Rejected:** syncing whole entities as documents (every module would need its own serializer), operation logs replayed in order (needs a total order the offline devices don't have), and CRDT text for page bodies (a big dependency for a personal tool; blocks are already rows, which gives block level merges for free).

---

### Sync: one engine in TypeScript for every device

The engine (collect, merge, apply) and the client (push, pull, live updates, backoff) live in `packages/shared` and run unchanged in the desktop's frontend, the mobile app and the tests. The desktop gives it a small SQL command (`sync_query`, `sync_batch`, one transaction with guards) and rebuilds its search index after remote changes.

**Why:** the same code on every device can't disagree about merges, and every behavior is tested once against real SQLite.

**Rejected:** a Rust engine for the desktop and a TypeScript one for mobile (two implementations of the subtlest code to keep identical), and syncing in Rust only (the phone can't run it).

---

### Sync: the desktop schema is the shared schema

A Rust snapshot test writes the synced tables (with their SQL, columns, keys, scope and merge mode), sync's own tables and triggers, seed rows, and the registered entity and relationship types to `packages/shared/src/generated/desktop-schema.json`. The server validates against it, the mobile app builds its database from it. A test fails when a new table is neither synced nor excluded.

**Why:** a new entity, field or table reaches every client by registration on the desktop, with nothing written by hand twice.

---

### Sync: entity keys may collide briefly

Migration 42 makes `idx_entities_key` non unique. Two devices can give new entities the same key offline; after applying, the one created later moves to the next free number, which syncs like any edit.

**Why:** a key is assigned offline and must stay readable (`TSK-14`); refusing the second row would stop sync.

**Rejected:** keys handed out by the server (breaks offline creation), and keys with a device suffix (changes every key users already know).

---

### Files sync as metadata only

A File's row syncs (title, name, URL), its local path and the file itself do not. Later, file content goes to S3 like storage: the server hands out presigned upload and download URLs per file, stored by content hash so a file uploaded twice is stored once, and a device downloads a file when it is opened.

**Why:** attachments are large and binary; the MVP keeps sync small and safe first.

---

### The sync server: Bun, Elysia, Postgres, one process

The server is optional (see [server](development/server.md)). Drizzle with postgres.js for typed queries and SQL migrations, jose for access tokens, argon2id through Bun. Rate limits and the live socket registry live in memory.

**Why:** one process on one VPS is the deployment the project targets; in memory state keeps it simple, and Postgres row locks give per account ordering without a queue.

**Rejected:** a hosted backend (the server must be self hostable), Redis for rate limits and fan out (one more service for a single machine; LISTEN/NOTIFY can replace the in memory hub if it ever runs as several processes), and syncing through a file service (no live updates, no sharing).

---

### Sharing hands out one page, conservatively

A recipient gets the shared page, its blocks and its settings only, inside a Space of their own named after the owner. Relationships, labels, other entities and the owner's Space never leave the owner. Viewers can't write; editors may change the title, icon and blocks, never move or trash the page. Sharing needs a confirmed email, and an invite link only works for the address it was sent to.

**Why:** a recipient must never get anything that wasn't explicitly shared, and the owner's Space wall stays where it is.

**Rejected:** giving recipients the owner's Space (leaks its name and invites edits to it), and sharing related items along (one share would quietly reach further than the owner meant). Sharing a whole Space is designed but not built (see [server](development/server.md)).

---

### Deleting an account removes its server data for real

Soft delete is the rule for entities on devices. Account deletion is different: it removes every server row of the account (sessions, records, conflicts, shares both ways). The devices keep their own data.

**Why:** people expect "delete my account" to delete it, and a server should not keep data its owner asked it to drop.

---

### The mobile app shares logic, data and tokens with the desktop, not components

`apps/mobile` is Expo with Expo Router, on `expo-sqlite` with the desktop's exported schema (`ensureSchema` creates it and adds what a newer desktop schema has, never removing a row). Its reads and writes come from `packages/shared/src/data`, which does what the desktop's Rust functions do (key numbers, Space modules, Trash with Sub-tasks, task completion and repeats), and sync is the same `SyncRuntime` and engine the desktop runs. Colors, radius and type sizes came from `packages/shared/src/tokens.ts` at first; the phone now uses the desktop's stylesheet itself (see below). Same libraries as the desktop: TanStack Query, TanStack Form with Zod, Zustand, Tabler icons.

**Why:** a phone can't run the Rust core or the web components, but everything that decides what a row looks like, how it syncs and how it looks on screen can be one implementation.

**Rejected:** NativeWind (it needs Tailwind 3 while the desktop uses Tailwind 4, and two Tailwinds in one workspace collide), React Native Reanimated (only the swipe rows animated; Gesture Handler's Animated version does it without another native module), a web view of the desktop UI (not a native app), and a second sync implementation for mobile.

**Also:** React is pinned to 19.2.3 for the whole workspace (root `overrides`), because React Native requires the exact React its renderer was built with and the workspace hoists one copy.

---

### What the phone does in the first version

Shell: Dashboard (today, due, pinned), Calendar (two weeks, every Space), Tasks (every Space, by status), Spaces with their modules, Search with Recents, Trash, Settings for sync. Full list, detail, create, edit, Trash and restore for Tasks, Notes and Jots (text blocks), Calendar entries and Bookmarks. Every other module lists its entities and opens them with title, Pin and Trash. Sessions show on the Calendar and are changed on the desktop, since a series and its overrides need the desktop's rules.

**Why:** the modules people reach for on a phone first, done properly, before breadth.

---

### The phone's sidebar, and study on the phone

The tab bar gives way to a sidebar like the desktop's and Claude's app: Search, Dashboard, Calendar, Tasks, Pinned, each Space with its modules, Recents, Trash and Settings. It slides the page aside (`drawerType: "slide"`) and opens with the menu button or a swipe to the right anywhere; a row with its own swipe actions keeps its swipe. It runs on `expo-router/drawer`, which needs Reanimated, so Reanimated comes back for it.

Courses, Exams, Assignments and Decks are edited on the phone with their own fields, and decks are studied there. FSRS is ported to TypeScript (`packages/shared/src/data/fsrs.ts`) from `rs-fsrs` 1.2.1 at the desktop's defaults, and a Rust test writes reviews the desktop scheduled to `generated/fsrs-fixtures.json`, which the TypeScript replays, so a card comes back on the same day whichever device studied it. Days and times are picked with the system's picker (`@react-native-community/datetimepicker`). Accent colors and the exam and assignment statuses live in `@nookly/shared/colors` for both apps.

**Why:** one navigation model across desktop and phone, and a review on the phone must schedule exactly like one on the desktop.

---

### The phone styles with the desktop's classes (NativeWind)

Supersedes the earlier rejection of NativeWind. NativeWind 5 runs on Tailwind 4, like the desktop, so the phone now styles with the desktop's classes instead of its own style objects. It is a release candidate (`nativewind@5.0.0-rc.0`, `react-native-css@3.1.0-rc.0`, pinned exactly), and `lightningcss` is pinned to 1.30.1, the version its compiler reads.

- **Tokens:** `packages/ui/src/theme.css` is the one place colors and radii are written. The desktop's `styles.css` and the phone's `global.css` both import it. Dark values sit under `@variant dark`, which the desktop defines as its `.dark` class and the phone as the system setting. Radii are written out (`8px`, not `calc(var(--radius) - 2px)`), since the phone's style engine can't do `calc()` with a variable. No generated files, no copies.
- **Primitives:** `@nookly/ui/classes` is where the primitives' classes are written (`buttonVariants`, `badgeVariants`, the sidebar's and the rest as constants). The primitives import them, and so does the phone. `packages/frontend/src/test/ui-classes.test.tsx` checks every primitive renders them.
- **Components:** `@nookly/frontend/classes` holds the classes of the desktop's own components (`FormField`, `FieldError`, settings headings, list rows, the color swatch, the segmented role toggle), and those components use the constants themselves.
- **On the phone:** `apps/mobile/src/ui` rebuilds the primitives with those classes. Text classes move onto the `Text` inside a box (React Native doesn't inherit them), `data-[state]:` classes resolve from the component's own state, and `flex` gets `flex-row` where the desktop means a row. Inter loads per weight, so `font-medium` and the like pick the face. Inputs are `h-10` for touch. Icons, the system pickers and the navigation bars read the same variables at run time (`useUnstableNativeVariable`), so there is no copy of the colors in TypeScript.

**Why:** one set of classes for both apps, so the phone looks like the desktop and keeps doing so.

---

### Filter chips join with AND, or with OR between neighbours

A filter chip carries an optional `join` (`"and"` or `"or"`) saying how it connects to the chip before it. Chips linked by `or` form a group, and an item must pass every group and one chip of each: `A, B or C, D` reads `A and (B or C) and D`. One `matchesFilters` in `filter-menu.tsx` evaluates every list, so a page uses it instead of `every`. No `join` means `and`, so saved Views and remembered filters from before need no migration.

**Why:** the common case stays a plain row of chips, and the one extra control is the word between two chips, which flips on a click.

**Rejected:** nested groups and an AND/OR builder (heavy for a chip row), and an OR that binds looser than AND (`A and B or C` is easy to misread without brackets).

---

### PDF, Word and OpenDocument exports are made in the webview from one print layout

A page turns into one print layout (`page-document.ts`) of a few shared pieces, and a writer per format draws it: pdfmake for PDF, the `docx` package for Word, hand written ODF XML zipped for OpenDocument. Figures are drawn in the webview, formulas with MathJax since KaTeX's HTML can't become a picture. The backend only writes the bytes (`write_page_export`).

**Why:** formulas, diagrams and circuits are drawn by the frontend already, so the exports show them as pictures instead of source. One layout keeps the three formats alike, and a new block type needs one entry, not three.

**Rejected:** printing the webview to PDF (no control over pages from the app, and no Word or OpenDocument), writing the files in Rust (every figure would come out as source), and embedding fonts in Word and OpenDocument files (a much bigger file for fonts readers mostly have stand ins for).

---

### A mention is stored with the id and written out with the key

A mention is saved as `[Title](mention:<id>)`. Wherever it is written out as text (Copy Mention, Copy as Markdown, the Markdown export, the CLI) it reads `[Title](mention:JOT-12)` with the readable key. Content that comes in with a key (CLI blocks, a pasted link) is turned into the id before it is saved, in `db/mention_keys.rs`. Both forms open the same page and count as the same backlink. Code and other source blocks are left exactly as typed.

**Why:** ids survive renames and every stored mention already uses them, so nothing in an existing database changes. The key is what people see in the app, so it is what they should read and write.

**Rejected:** storing the key (needs a rewrite of every stored mention, and a key lookup on every read) and rewriting old mentions to keys (touches user data for no gain).

---

### The section search is a new component next to `ScrollProgress`

The section navigator of a page (`ScrollProgressSearch`) is a copy of `ScrollProgress` with a search field in its open list, and Notes and Jots use it. The field only shows from six headings on. The box is always sized by the full list, so it keeps its size while a query narrows the rows.

**Why:** primitives in `packages/ui` are frozen, so the search is added beside the old one instead of changing it.

**Rejected:** a `search` prop on `ScrollProgress` (edits a primitive) and locking the height when the first letter is typed (the full list already gives the same height without the extra state).

---

### A mention of a table row or column adds `_r2` or `_c3` to the block

`[Notes](mention:<id>#<block>_r2)` points at the second row of a table block, `_c3` at the third column, counted from 1 with the header as row 1. The block stays the target of backlinks and rename sync, so no stored pattern changes: the fragment alphabet already allows `_`. Opening it shows the table and marks those cells; a row or column that is gone still opens the table.

**Why:** a table is one block, and the position is the only stable way to name a row or column that has no id of its own.

**Rejected:** ids on rows and columns (a new field in every stored table) and a separate link syntax (a fourth way to link, see [the relationship system](01-philosophy.md#the-relationship-system-links-everything)).

---

### A media block can name a file on this computer by its path

`/file`, `/image`, `/video` and `/audio` accept the full path of a file next to a mention and a link (`db/local_path.rs`). Nookly only reads it. The path is stored exactly as written and never rewritten: when the file is moved, renamed, unreadable or on a drive that is not connected, the block shows why and the path keeps working once the file is back. The CLI reports the same reasons (`fileStatus` when reading, a `warning` when writing) and refuses only an empty or malformed value. Programs (`.app`, `.exe`, `.sh`, ...) are not opened from a path.

**Why:** a path is the lightest way to point at a file that lives elsewhere, and a reference that is never edited cannot lose anyone's data.

**Rejected:** importing the file on save (a path is for files people want to leave where they are), checking the file before saving it (a drive that is off would make the path impossible to write), and a hard failure on a missing file (it would break reading a whole page).

---

### `nookly://open/<id>` links open Nookly on an entity or a block

A "Copy Link" action next to "Copy Mention" copies `nookly://open/<entityId>` or `nookly://open/<entityId>#<blockId>`, which opens Nookly on it from a browser, a chat or any other app. A running Nookly takes the link in its window (`tauri-plugin-single-instance`, release builds only, so `tauri dev` never hands over to the installed app); a closed one starts, and the link waits in a queue (`lib/deep-link.ts`) until the app has mounted. The link is untrusted input: it is parsed strictly (`lib/deep-link-url.ts`), it only navigates, and it reuses the mention navigation. An entity that is not on this computer shows a "nothing to open here" notice and changes nothing, a trashed entity opens faded, a missing block falls back to its page.

**Why:** a mention only works inside Nookly. The links carry local ids, so they work on the computer and database they were copied from, and the app does not suggest otherwise.

**Rejected:** a second routing path next to `parseMentionHref` (one place decides what a target means), registering the scheme from `tauri dev` (macOS only registers it from an installed app, so it is tested with a built app), and links that create or change anything.

---

### The spell checker is Hunspell in Rust, off until the user turns it on

Misspelled words come from Hunspell dictionaries read by the `spellbook` crate in the backend, with the dictionaries compiled into the app. A page's words are asked about in batches, and the editor underlines what comes back (`features/spellcheck`). Nothing runs until the user says yes: one question after the update, then a switch in Settings.

**Why:** German is written in compounds (Straßenbahn, Prüfungsvorbereitung), which `nspell`, the JavaScript Hunspell, flagged as wrong in a trial, and every language has to work at once on one page. `spellbook` knows compounds, loads a dictionary in about 15 ms and keeps typing off the UI thread. The webview's own spell checker is not an option: it follows the system's settings, differs per platform and cannot take several languages chosen in the app.

**Rejected:** `nspell` in a worker (wrong on compounds), the platform's spell checker (no control over languages), and downloading dictionaries on demand (the app works offline and needs nothing fetched).

---

### The spell checker's own words are a file, not a setting

Words added with Add to Dictionary go to `dictionary.json` in the app data folder, written by the backend (`dictionary_file.rs`). Settings show only a Show dictionary file button, like the settings file. A file that cannot be read is reported and left exactly as it is, and the checker reads it again when the window comes back, so an edit shows up without a restart.

**Why:** a list that grows without bound does not belong in `settings.json`, and a plain file can be edited, shared and backed up by hand, which a row of chips in Settings could not.

**Rejected:** keeping the words in a setting with a management row (it grows without limit and every word saved rewrites all settings).

---

### A mention of selected text carries the text, not its place

`[cat](mention:NOT-58#<block>_q<text>)` points at a piece of text in a block. The fragment is the block, `_q`, and the text as base64url (at most 120 characters, the start of a longer selection), which fits the characters a fragment already allows, so the backlink index, rename sync and the Rust patterns did not change. Opening it finds the text in the block again, across formatting and list items, and selects it; if the text is gone, the block is shown as for any block link. Copy Mention for Selection and Copy Link for Selection sit in their own group above the block copies.

**Why:** a character offset would point somewhere else after the first edit above it, while the text itself still finds its way.

**Rejected:** offsets into the block (they break on every edit) and a fragment per selection stored in the database (a new table for a link).

---

### The sidebar shows one Space at a time

The sidebar lists the active Space's modules only. All Spaces sit in a row of icons at the bottom, four slots wide, with the rest behind a three dot button. The active Space follows the focused tab, so opening anything in another Space moves the sidebar there. Switching is a click, a two finger swipe or `Cmd+Option+Up` and `Cmd+Option+Down`. The old multi expand state (`nookly:expanded-spaces`) is gone; a leftover value is ignored. System is no longer mentioned in the docs as a pinned item, since the sidebar never had one.

**Why:** stacking every Space with its modules made the sidebar long and noisy, and it only gets worse as modules are added. Spaces are a hard wall, so showing one at a time matches how they behave. Arc and Zen do the same.

**Rejected:** keeping Spaces as collapsible folders (the growth problem stays), a Space switcher at the top (the bottom row keeps the global block where it is and puts the switch near the thumb and the trackpad), and wrapping the swipe around (an overshoot would jump from the last Space to the first).

---

### Settings navigation is flat and grouped, and pages follow what someone is doing

The Settings dialog lists ten pages under muted group headers (General and Appearance; Writing and study: Editor, Calendar; Data and accounts: Backup, Connections; Power tools: Shortcuts, LaTeX macros, Agent), with About and the settings file at the bottom. Nothing nests. Shortcuts is one page with a filter strip (All and each section). Search sits at the top of the sidebar, `/` focuses it. A page is not a registry category: `settings-pages.ts` maps each row to a page, so setting ids, search keywords and the CLI are untouched. A setting whose content has a better shape (theme, backup status, connections) draws its own component inside its row.

**Why:** about 16 indented rows did not scan, more categories are coming, and the full width search row took height from every page. A uniform row for every setting made a theme, a backup and a key binding look alike.

**Rejected:** collapsible groups (they hide pages for no gain at ten items), keeping a nav row per shortcut section (eight rows for one topic), and separate dialogs per page.

---

### The macOS data folder is renamed once and left behind a symlink

On macOS the real data folder is `Application Support/Nookly`. `com.nookly.app` stays as a symlink to it. At startup (`data_folder.rs`), before the database opens, a real `com.nookly.app` with no `Nookly` is renamed and linked. A missing link is put back, a dead link to `Nookly` is removed, and two real folders are never merged. A failed link undoes the rename.

**Why:** Finder treats a name ending in `.app` as an application, so users could not open their own data. `nookly.db` stores absolute paths under the old name, which keep resolving through the link, as do older releases, the CLI and scripts. A rename within a volume copies nothing and keeps open files valid.

**Rejected:** changing the bundle identifier (keychain, WebView storage, updater and deep links all hang on it), copying the folder (a second copy of everything and a rewrite of every stored path), and only a "Show data folder" action (it leaves the Finder problem).

---

### The database stays on the default rollback journal

Nookly does not use write ahead logging (WAL). The app and the CLI share `nookly.db`, and with the rollback journal a writer briefly blocks readers.

Measured with `cargo test --release --lib perf_wal_contention -- --ignored --nocapture`: one connection saves 500 Tasks back to back while another keeps listing 5,000 entities. The slowest read waited 180 ms with the rollback journal and 6 ms with WAL. Nothing failed in either mode, and 500 writes took 860 ms against 300 ms. The collision only happens while something writes in a tight loop, such as an agent importing many items. One edit at a time never shows it.

**Why:** WAL puts `nookly.db-wal` and `nookly.db-shm` beside the database, and several flows assume `nookly.db` is the whole database: `backup_before_migration` and `db/upgrade.rs` copy it with `fs::copy`, restore replaces it, and people copy the data folder by hand. A copy that misses the `-wal` file can lose the newest writes. The gain is a stall of a fraction of a second during bulk agent writes, which does not justify that risk for data that must never be lost.

**Revisit when:** contention is reported in real use, and only together with checkpointing before every file copy (or the SQLite backup API instead of `fs::copy`), and tests for upgrade, backup, restore and a crash during a write.

**Rejected:** switching now and checkpointing in the copy paths (every path that copies the file would have to be found and kept correct for good).

---

### One ranked search list, one engine for Cmd+K and Cmd+P

Search is one SQL statement that returns a single ranked list: key matches, then titles (exact, prefix, substring, then full text rank), then blocks, then Bookmark and File text, one row per entity. Type, label and Space filters run inside it. `Cmd+P` is the same call with `titlesOnly`, which skips the body sources. Nothing loads when a palette opens except Recents (`list_entities_by_ids`), labels load only once `#` is typed, and there is no typing pause: every keystroke searches, and the backend stops a search that a newer one replaced. The grouped results, "View all", the filter menu in the palette and the separate Cmd+P matcher are gone. `Cmd+P` no longer finds scattered letters inside a title, only words that start with what was typed, like Cmd+K. Recents is the empty state, followed by the filter hints and suggestions; Pinned is left to the sidebar, so an empty palette runs no extra queries.

**Why:** scanning headings was slower than reading a list. Two result lists meant two sets of code. Loading every entity and label before the first letter was the main cost of opening.

**Rejected:** an in memory index in the frontend (a second copy of the data that can drift, the full text index already is the index) and a fixed typing pause (it only delays the first answer).

---

### Mind maps are a custom block drawn from an outline

A mind map is the `mindmap` block, an indented list with one idea per line, not a module. It has no life outside the page it sits on, and `diagram`, `circuit` and `plot` already have the same shape. The outline text is the only source of truth: markdown export, the CLI and the PDF, Word and OpenDocument exports all read it, and the layout is worked out from it the same way every time. Folding branches in the preview is only a view and never changes the outline.

**Why:** one text that every reader understands keeps the block fully covered by the CLI and the exports without a second format to keep in sync. Dragging only moves nodes inside the block; it does not turn into a free canvas.

**Dragging:** dragged positions are editor owned layout data in a versioned `layout` block attr, the way the circuit block keeps its drawing. The attr holds an id per outline line (a parallel list) and, for each moved node, its offset from the automatic place; a node's offset adds to its parent's, so a dragged branch takes its subtree along. Dragging never changes the outline, and "Reset layout" clears the attr. Ids are never written into the outline text. Every outline edit, from the editor or the CLI, goes through a line diff (longest common subsequence) between the old and new text: unchanged lines, lines moved elsewhere and lines edited in place keep their id, new lines get a fresh one, deleted lines drop theirs, and positions that match no line are cleaned up. A layout made for other text (a pasted or externally written outline) is cleared, so its nodes use the automatic layout and the outline is never touched. The editor follows its own edits in a plugin; a write without a layout of its own, such as the CLI's, is followed in `update_block`. The two implementations share their test cases. Exports and markdown ignore positions and lay out from the outline alone.

**Rejected:** inline markers like `{#a1b2}` (they would leak into markdown, the CLI and every export), and keying positions by path or text (renaming or reordering would lose them).
