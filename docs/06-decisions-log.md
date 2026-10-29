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

### Five pairs are structural relationships

Task and Sub-task, Session and Course, Exam and Course, Study Block and Exam, and Assignment and Course. Deck and Exam was one until Decks became their own module (see below).

**Why:** the child is meaningless without its parent. A session without a course makes no sense. Structural relationships are enforced at the data layer, not just by convention, which sets them apart from generic, unenforced ones like a Course `sequel-of`.

**Rejected:** treating every relationship as equally generic. That would allow orphaned Sessions, Exams, and Assignments with no parent, which never makes sense in the real world.

---

### Study schedules use a new Study Block entity, not Sessions or Tasks

**Why:** a Session must have a Course, and study prep is not a lecture, so reusing Sessions would break that rule. A Task is a checklist item and not native to a calendar, which makes it a poor fit for time-boxed study and the future calendar view.

**Rejected:** reusing Session (breaks the structural rule) and reusing Task (wrong semantics, breaks the calendar view design).

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

Every language twinkleplop ships goes through it. Shiki only covers the picker languages twinkleplop lacks (C++, C#, Java, PHP, Ruby, INI, JSONC, Assembly). Both map onto the same accent tokens.

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

Google Calendar and iCloud events show on the Sessions calendar but are never entities: no Space, no relationships, no Course, no CLI exposure. Nookly never writes to either calendar.

**Why:** converting them to Sessions would force a Course onto events like "Dentist" and break the Session and Course structural rule.

**Rejected:** importing external events as Sessions or any other entity type, and two way sync.

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
