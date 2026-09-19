# Nookly — Architecture & Philosophy Documentation

This document captures all foundational decisions made for **Nookly**, a modular, open-source, Tauri-based desktop app for personal life organization. It is intended as a reference for development (human or AI-assisted) and should be treated as the source of truth for core philosophy, data model, and UI/UX direction until superseded by a later revision.

---

## 0. Non-Negotiable Ground Rules

- **Existing primitive components, theming, and the Tailwind design system already exist in the repository and must NOT be modified.** New primitives may be added freely, but existing ones are frozen. Any new UI need should be solved by composing existing primitives or adding new, additive components — never by editing what's already there.
- **Build system**: Tauri (multi-platform desktop).
- **Modules are additive-only**: the public/core module set is never edited by community contributions — only extended with new modules alongside it.

---

## 1. Core Philosophy

### 1.1 Data Providers vs. Viewers

Modules are split into two conceptual roles:

- **Data Providers**: own a data schema/storage for an entity type.
- **Viewers/Renderers**: render a Data Provider's data. Multiple Viewers can exist for the same Provider (community members can build alternate UIs for the same underlying data without forking it).

Both Data Providers and Viewers are community-buildable. **Installing a Viewer automatically installs the Data Provider(s) it depends on.** A Data Provider can exist without a bundled Viewer (headless data, with Viewers attached later).

### 1.2 Opinionated Over Flexible

Inspired by Jira/Linear rather than Notion: the app favors a **large set of highly opinionated, specialized page/entity types** over one flexible blank-canvas model. Breadth of expression comes from having many specialized modules, not from making each module infinitely configurable. This reduces overstimulation/decision fatigue while still giving enough variety to capture most needs.

### 1.3 Bespoke, Content-Aware UI as a Foundational Pillar

UI components should be purpose-built to the specific data they represent, not generic form controls — even single-use, primitive components (e.g., a zip-code input that only accepts digits, shows placeholder digit slots, and detects country — rather than a plain text field). This applies app-wide, including navigation: the sidebar and all views should feel designed for what they display, not a generic list of nav items. This stands alongside modularity as a foundational, permanent pillar of the app's design.

### 1.4 The Relationship System (Core Linking Mechanism)

Since pages/entities cannot be nested and always belong to exactly one Space, a **generic relationship system** is the core mechanism for connecting entities across the app — including across modules and across Spaces.

Two tiers exist:

- **Generic relationships**: typed, directed links between any two entities (e.g. `sequel-of`, `blocks`, `relates-to`). Freely cross-Space.
- **Structural relationships**: stricter, purpose-built relationship types with enforced behavior (cardinality, cascading, rollups) for specific pairings that require it (see §3.3).

**Relationship model properties:**

- **Directionality**: Always directed (a "from" and "to"). Inverse labels are auto-derived for display (e.g. a parent shows "has sub-task" automatically).
- **Type strictness**: Fixed enum of relationship types, defined by core and extendable by modules at build time (not ad-hoc/freeform per-user).
- **Cardinality**: Unrestricted at the data layer by default. Any entity can have any number of relationships of any type; restrictions (e.g. "only one parent") are enforced by specific structural relationship types where needed, not by the generic engine.

### 1.5 Three Distinct Linking Mechanisms (Intentional, Not Redundant)

Nookly has three ways entities can connect, and this is a deliberate, permanent design — not overlap to be consolidated:

1. **Relationships** — the formal, structural/generic typed graph (§1.4).
2. **Attachments** — an entity (Note, Task, etc.) holding a reference to a File or URL/Bookmark. Modeled as a specific relationship type (e.g. `attached-file`), not a separate engine.
3. **Mentions** — inline `@mention` references inside markdown content, contextual and unstructured compared to relationships.

**Module authors must not invent a fourth linking mechanism.** Any new "connect two things" need should be expressed as a new relationship type within the existing system.

### 1.6 Cross-Space Relationships

Relationships (all types) may freely cross Spaces. When a related/attached/mentioned entity lives in a **different Space** than the one currently being viewed, the UI **must visually indicate this** (e.g., a "lives in Work" badge) so the cross-Space link never feels like it silently appeared.

### 1.7 Module Configuration Is Always Global

All module-level configuration (Task statuses, Label definitions, etc.) is **global across the entire app**, never scoped per Space. Spaces are purely organizational folders/groupings — they do not carry their own module configuration. (See §2.1 for why.)

### 1.8 Module Packaging: Compile-Time, Not Runtime Plugins

Modules (including community-built ones) are **source code compiled directly into the Tauri binary.** "Installing a module" means adding it to a build/config and recompiling — there is no live, in-app plugin-install experience for v1. Data Provider dependency auto-resolution (§1.1) happens at build-config time.

A true runtime plugin architecture (dynamic loading without recompiling, in-app module marketplace) is explicitly **deferred** as a future evolution, once the module API has proven stable through real usage.

---

## 2. Core Entity Model

Every entity in the system (Task, Note, Session, File, Bookmark, Exam, etc.) shares a common base model.

### 2.1 Universal Fields

- `id` — unique, stable identifier
- `space_id` — the Space this entity belongs to (mandatory; every entity belongs to exactly one Space)
- `type` — which module/entity-type this is
- `title` — explicit, user-editable field on every entity, even where modules auto-generate a sensible default (e.g. a Session auto-titles itself "Algorithms I — Mon 10:00" but remains user-renamable)
- `created_at` / `updated_at`
- `pinned` — boolean, powers the cross-Space **Pinned** sidebar section
- `icon` — optional per-instance icon (real icon from a to-be-determined icon library, or emoji). If unset, the entity falls back to a **default icon defined per entity type**.

### 2.2 Soft Deletes / Trash

- **All deletions are soft deletes.** Deleted entities go to a Trash with a `deleted_at`/`archived_at` timestamp.
- **No automatic purge by default.** The user must manually empty the Trash. Automatic purge after a time period is available as an **opt-in** setting only.
- **Soft-deleted entities remain visible everywhere they're referenced** (relationships, attachments, mentions, pickers) but are rendered at **reduced opacity**, signaling "this still exists but is trashed" rather than silently vanishing or breaking links.

### 2.3 No Version History / No Git

The app does **not** use git or any version-history system internally. This was considered (for durable rollback and to power undo/redo) but explicitly rejected due to repo bloat from binary File attachments. Instead:

- **Undo/Redo**: in-memory, per-session action stack only (not persisted across app restarts, unless a small ring-buffer is added later).
- **Durable history/rollback**: out of scope entirely for now. Revisit once cloud sync exists (see §7).

---

## 3. Relationship System — Implementation Details

### 3.1 Data Shape

A relationship is a directed edge: `(from_entity, to_entity, relationship_type)`. Inverse display labels are derived automatically from the type definition (no need to store both directions).

### 3.2 Relationship Types (Fixed Enum, Module-Extendable)

Core relationship types ship with the base app (e.g. `relates-to`, `blocks`). Modules may define and register their own types at build time (e.g. Courses module defines `sequel-of`; Files/Bookmarks use `attached-file`).

### 3.3 Structural Relationships (Stricter Subset)

Some relationship types require enforced behavior beyond the generic engine:

- **Task ↔ Sub-task**: a Task has a dedicated **Sub-task page type**. This relationship has stricter, Jira-like behavior (progress rollup, cascading). **Sub-tasks cannot have their own sub-tasks** — nesting is capped at one level.
- **Session ↔ Course**: a Session **must always** belong to exactly one Course, enforced at the data layer.
- **Exam ↔ Course**: an Exam is structurally tied to one Course.
- **Index Card Deck ↔ Exam**: a deck belongs to exactly one Exam.
- **Study Block ↔ Exam**: a Study Block belongs to exactly one Exam.
- **Assignment ↔ Course**: an Assignment must always belong to exactly one Course.

All other links (e.g. Course `sequel-of`/`prequel-of` Course, Exam/Assignment to Tasks/Notes, Files/Bookmarks to any entity) use the **generic, unrestricted relationship type**.

### 3.4 Block-Level Addressability (Notes/Pages only)

Within the Notes/Pages module, individual **blocks** (not just whole pages) have stable IDs and can independently participate in the relationship system — a Task can relate to one specific paragraph, not just the whole page. This means the relationship-picker/search UI must be able to resolve to block-level granularity, not only page-level, when working with Notes.

### 3.5 Right Sidebar — Fixed Section Order

On any page's detail view, the right sidebar shows (top to bottom):

1. **Relationships** — the generic/structural typed relationship graph
2. **Attachments** — Files and URL/Bookmarks referenced by the page
3. **Mentioned** — entities referenced via inline `@mention` in markdown content

### 3.6 Attachment Bidirectionality

Because attachments are modeled as directed relationships, the reverse view is automatically available for free: a File or Bookmark's own detail page can show "attached to: Note X, Task Y" without any extra modeling — this simply falls out of the relationship graph being queryable in both directions.

---

## 4. Navigation Model

### 4.1 Spaces

- Renamed from "Environments." Notion-teamspace-like groupings shown in the sidebar (e.g. Work, Private, Study).
- **Flat, non-nestable.** Every page/entity belongs to exactly **one** Space — no exceptions, no sub-spaces.
- **Spaces are a hard wall.** There is no cross-Space browsing, filtering, or global per-module view by default (e.g. no "all Tasks across every Space" list). This matches Notion's actual behavior.
- Spaces have: name, icon, color.
- **Unlimited, user-created.** Created via a sidebar "+" action, optionally starting from a **lightweight template** (e.g. a "Study" template). **Templates are community-extendable**, the same way modules are.
- Spaces contain **only pages/entities** — there is no per-Space module enable/disable configuration (module config is always global; see §1.7).
- **Space color bleeds into the UI** beyond the sidebar label — accenting the active Space's context (highlights, accent borders/buttons, subtle tinting) so each Space feels visually distinct while being browsed, not just labeled distinctly in the sidebar list.

### 4.2 Cross-Space Exceptions

Exactly two features are allowed to break the Space hard wall, both living above the Space list in the sidebar:

- **Dashboard** — a single, global, non-duplicable, bento-style customizable page for cross-Space quick access. Users can edit its _content_ (which widgets/shortcuts appear) but cannot create additional Dashboards. _(Future, out of scope now: per-Space dashboards, user-creatable, living inside individual Spaces.)_
- **Pinned** — a cross-Space section showing individually pinned items (any entity type), always visible at the top of the sidebar.
- **Search** is a third, deliberate exception (see §6) — treated as a utility rather than a "view."
- Any future cross-Space feature must be added **one at a time, deliberately** — cross-Space capability is not a general-purpose capability modules can opt into freely.

### 4.3 Labels (Freeform Tags)

- Labels are a **generic system**, not owned by any single module — any module can opt into freeform tagging via the same Label entity (Tasks use it today; Notes or others could adopt it later).
- Label fields: `name`, `color`, `space_id`.
- **Strictly Space-siloed**: a Label belongs to exactly one Space. There is no "global" label option. Wanting "Urgent" in both Work and Study means two separate Label entities — this is intentional and acceptable.
- The label picker, when tagging an entity within a Space, only ever suggests/creates Labels scoped to that Space.

---

## 5. Module Specifications

### 5.1 Tasks (renamed from "Todos")

- Ticket-style: deadlines, labeling, grouping — inspired by Jira/Linear.
- **Status model**: Linear-style customizable statuses. A default set ships out of the box; users may rename or delete defaults and add custom statuses with their own **color**, **label**, and **"doneness" percentage** (as in Linear). Configured **globally**, not per-Space.
- **Dates**: two fields — `start_date` and `due_date` — enabling a future timeline/Gantt-style view.
- **Labels**: freeform, Space-scoped tags (§4.3). Grouping (by label, status, date, etc.) is a **view-level/display concern**, not a stored structural concept.
- **Sub-tasks**: a dedicated Sub-task page type, linked to its parent Task via the **structural** Task↔Sub-task relationship (progress rollup, cascading behavior). Sub-tasks cannot have their own sub-tasks (nesting capped at one level).
- **Recurring Tasks**: explicitly **out of scope for v1**.

### 5.2 Notes / Pages

- Notion-style, block-based editor (see §3.4). Extensible with custom blocks in the future.
- **Universal custom markdown** is available anywhere free text appears across the entire app (not just Notes) — Tasks, Exams, etc. all support it.
- **Every block type (standard or custom) must implement a markdown-serialization method**, guaranteeing the entire page can always export to complete, valid plain markdown — this is the core export-fidelity guarantee (see §8).
- **Block-level addressability**: individual blocks have stable IDs and can independently participate in the relationship system.
- **v1 scope**: only standard blocks ship at launch (paragraph, headings, lists, code, quote, image, embed). The block architecture is built to be extensible, but **custom third-party blocks are a future module-extension point**, not built now.

### 5.3 Jots & Refinements

- Two distinct page types (not a rigid 1:1 pairing): **Jot** (raw, in-the-moment capture, e.g. during a lecture) and **Refinement** (the polished/expanded version).
- Linked via the standard generic relationship system (the same mechanism used for Task relations, etc.), not a dedicated pairing structure.

### 5.4 Courses

- Tracks university courses; can be scoped to a single Semester or span multiple.
- **Prequel / Sequel**: modeled as **typed generic relationships** (`sequel-of` / `prequel-of`), not dedicated schema fields — reusing the core relationship system rather than inventing course-specific fields.
- A Course spanning multiple semesters is modeled as **one Course entity related to multiple Semester entities** (generic relationship), not a date-range field.

### 5.5 Semesters

- A **full entity** (e.g. "WS 2026/27"), not just a string/tag field on Course. Participates in the relationship system.

### 5.6 Sessions / Timetable

- New entity representing a single class occurrence (e.g. a lecture).
- **Recurrence model**: a single recurring **Session Template** (e.g. "Algorithms I, Mon 10–12, weekly") generates individual **Session occurrences**. Editing the template affects future, not-yet-passed occurrences.
  - A materialized occurrence can be individually overridden: **time, date, cancelled-status, location/notes** — standard calendar-style overrides. Editing the template never retroactively rewrites an already-overridden occurrence.
  - **One-off Sessions** (e.g. low-ECTS courses meeting on irregular dates) are simply occurrences with **no parent template** — same entity type, just template-less. No separate "one-off Session" type exists.
- **Session ↔ Course**: structural relationship — a Session must always have exactly one Course.
- All relationships (Jots, Refinements, Tasks, Files, etc.) target a **specific Session occurrence**, never the template. The template's only role is generating occurrences.
- Groundwork for a future calendar view (not built yet, but the data model supports it).

### 5.7 Exam Tracking

Standalone module that **references** a Course (does not live nested inside it).

- **Exam** (native entity): exam date, weight/grade-relevance, grade received, status. Structurally related to a Course.
- **Index Card Decks** (native entity, new concept): front/back markdown-capable flashcards, grouped into decks. A deck is structurally tied to exactly one Exam. Includes **basic spaced-repetition scheduling** (Leitner-box or lightweight SM-2-style interval tracking per card).
- **Study Block** (native entity, new concept): a time-boxed, calendar-eligible chunk of scheduled study time (`date`, `start_time`, `end_time`). Structurally tied to exactly one Exam (not a Course — deliberately distinct from Session, since a study block isn't a lecture occurrence). May optionally relate (generic relationship) to specific Index Card decks or Notes to study during that block. Eligible to appear in the same future calendar view as Sessions, as a visually distinct entity type.
- **Todos, Deadlines, Notes**: fully reused via generic relationship to the Exam — Exam Tracking owns no dedicated data for these; it delegates to the Tasks and Notes modules.

### 5.8 Assignments (University)

- **Structural** relationship to Course — an Assignment must always belong to exactly one Course.
- **Generic relationship** to Tasks — "matching Todos" are independent Task entities related to the Assignment; the Assignment does not have built-in checklist/rollup behavior of its own (fully delegates to Tasks, same pattern as Exam↔Tasks).
- **Native fields**: `due_date`, `status` (not-started / in-progress / submitted / graded), optional `grade`. No Index Cards or Study Blocks — those remain Exam-specific.

### 5.9 Files (renamed from "Documents")

- A **full first-class entity**, participating in the relationship system like everything else.
- **Local storage**: files are **copied into an app-managed local storage folder**, fully decoupled from wherever the original file lived on disk — predictable, portable, and resilient to the user moving/deleting the source file elsewhere.
- **Files-as-links** (cloud-stored documents, e.g. a Google Doc or Dropbox file): **provider-aware** — the File entity recognizes and tags Google Drive, Dropbox, and iCloud specifically (opening the door to provider-specific thumbnails/live status later), with a **generic URL field as fallback** for any unrecognized link source.
- Attachment is **bidirectional by nature of the relationship graph** (§3.6) — no extra modeling needed for reverse lookups.

### 5.10 URLs / Bookmarks

- New entity, distinct from Files-as-links: **Files-as-links are cloud-storage documents** meant to be treated as a document; **URL/Bookmarks are arbitrary webpages** meant to be treated as a reference/link.
- **Metadata**: auto-fetches title, favicon, and preview image/description when online.
- **Offline behavior**: while offline, a placeholder is shown (with an "added on [date]" timestamp) instead of fetched metadata. Metadata is fetched opportunistically as soon as network becomes available, then cached for future use.
- Lives inside a Space like any other page (not a global, Space-independent list).

---

## 6. Search

- **Full-text, smart search across the entire app** — searches entity content, not just titles/metadata.
- Search is a **deliberate exception to the Space hard wall** (alongside Dashboard and Pinned) — it is treated as a cross-cutting utility rather than a "view," so it is not scoped to the currently active Space.

---

## 7. Explicitly Deferred (Out of v1 Scope)

The following were discussed and consciously deferred — they are not forgotten, but should not be built as part of this scope:

- **Cloud sync / multi-device sync** — the app is offline-first and single-device for v1, but the data model should remain mindful of this future direction where reasonable.
- **Cloud backup** — related to the above; large File attachments are expected to eventually push to something like S3 once cloud sync exists, rather than being synced/versioned wholesale.
- **Git-backed local versioning / rollback / undo-redo persistence** — considered and rejected due to repo bloat from binary attachments. No durable version history exists in v1; undo/redo is in-memory and session-scoped only.
- **Notifications / reminders** — out of scope entirely for now, despite Tasks/Exams/Assignments/Sessions all having date fields that would naturally support this later.
- **Recurring Tasks** — Sessions have full recurrence (templates → occurrences); Tasks do not get equivalent recurrence support in v1.
- **Runtime plugin architecture** — modules are compiled into the binary (§1.8) for v1; a dynamically-loadable, in-app-installable module system is a future evolution once the module API has proven itself.
- **Per-Space Dashboards** — only the single global Dashboard exists in v1; user-creatable dashboards living inside individual Spaces are a future feature.

---

## 8. Export & Data Portability

- The entire app's data must be **easily exportable to standard formats**, with **markdown as the primary focus**.
- Because custom markdown blocks and block-based Notes editing could otherwise produce non-standard output, **every block type (standard or custom) must define a plain-markdown serialization**, ensuring that exports are always **complete** — even if a custom block's plain-markdown rendering is visually less polished than its in-app appearance. Completeness of information is guaranteed; visual fidelity in the exported form is not.

---

## 9. UI/UX Direction

Built on top of the **existing, unmodified** primitive component library and Tailwind design system.

- **Visual tone**: Dense/utilitarian (Linear/Jira-inspired) — compact, high information density, minimal whitespace, optimized for speed and keyboard-driven use. This already matches the existing primitive component styling.
- **Color theme**: Theme-agnostic — dark and light mode both fully supported and treated as equally primary (already supported by the existing primitives/Tailwind config).
- **Per-Space visual identity**: A Space's configured color bleeds into the UI beyond just its sidebar label — accenting the active Space's context (highlights, accents, subtle tinting) so each Space feels visually distinct while being used, not just distinct in a list.
- **Global command palette**: A foundational, must-have interaction pattern for v1 — `Cmd+K` (quick navigation, quick-create, quick-search tied into the full-text search engine from §6) and `Cmd+P` (quick-open/jump-to, Linear/VS Code-style).
- **Component philosophy**: Reinforcing §1.3 — new UI needs should default to bespoke, content-aware components rather than generic form controls, composed from or added alongside (never replacing) the existing primitive library.

---

## 10. Summary of Permanent, Locked Decisions

For quick reference, the following are considered **settled, foundational decisions** for this project:

1. Data Providers and Viewers are separate, both community-buildable; Viewer install auto-resolves Provider dependencies at build time.
2. Modules are opinionated and specialized, not infinitely flexible.
3. Bespoke, content-aware UI is a permanent design pillar, on top of the frozen existing primitive library.
4. A single, directed, fixed-enum, generic + structural relationship system is the one core linking mechanism app-wide.
5. Attachments and mentions are specific applications of the relationship system, not separate engines.
6. Relationships freely cross Spaces; cross-Space references are visually flagged.
7. Modules are compiled into the binary; no runtime plugin system in v1.
8. All module configuration is global; Spaces never carry module-level config.
9. Every entity shares a common base model (id, space, type, title, timestamps, pinned, icon w/ fallback).
10. All deletion is soft-delete to Trash; no auto-purge by default; trashed entities appear at reduced opacity wherever referenced.
11. No git, no durable version history; undo/redo is in-memory and session-scoped only.
12. Spaces are flat, non-nestable, and a hard wall for browsing — except Dashboard, Pinned, and Search.
13. Labels are a generic, Space-siloed freeform tagging system usable by any module.
14. Full-text search spans the entire app regardless of Space.
15. Every markdown block (standard or custom) must guarantee a complete plain-markdown export fallback.
16. UI is dense/utilitarian, theme-agnostic, Space-color-accented, and command-palette-driven.
