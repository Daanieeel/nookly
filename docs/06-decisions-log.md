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

### Dashboard widgets: Today, Unrefined Jots, This Week

Exactly three, in that order. Every count in the briefing sentence opens its module's list, every name opens that entity and renders as a bounded pill. They render as flat sections, not cards.

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

Every language twinkleplop ships goes through it. Shiki only covers the picker languages twinkleplop lacks (C++, C#, Java, PHP, Ruby, INI, JSONC). Both map onto the same accent tokens.

**Why:** the edited block is retokenized synchronously on every keystroke. Shiki's JS engine takes about 16ms for an 80 line block, a full frame, while twinkleplop takes under 0.1ms. First highlight after launch drops from about 300ms to about 20ms.

**Rejected:** a full swap now (loses six languages), and staying on Shiki alone. Twinkleplop is 0.x, so versions are pinned exactly and its API is contained in `twinkleplop-highlighter.ts`.

---

### Updates come from GitHub Releases through the Tauri updater

The app reads `latest.json` from the newest published release, checks on launch and every six hours, and installs plus restarts in one click from the sidebar card or the settings popover.

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
