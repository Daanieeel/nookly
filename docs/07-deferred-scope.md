# Deferred Scope

Do NOT build these unless explicitly told. Considered, consciously deferred, not forgotten.

- **Cloud sync / multi-device sync** — offline-first, single-device only for v1. Keep data model mindful of this future direction where reasonable, but don't build it.
- **Cloud backup** — related to above. Future: large File attachments push to S3-like storage once cloud sync exists, not synced/versioned wholesale.
- **Git-backed local versioning / rollback / persistent undo-redo** — rejected due to attachment bloat. No durable history in v1. Undo/redo = in-memory, session-scoped only (see 02, 06).
- **Notifications / reminders** — out of scope entirely despite Task/Exam/Assignment/Session date fields existing. Do not build notification scheduling/delivery.
- **Recurring Tasks** — Sessions have full recurrence (template→occurrence). Tasks do NOT get equivalent recurrence in v1.
- **Runtime plugin architecture** — modules compile into binary for v1 (see 01). Dynamic/in-app-installable module system = future evolution only, once module API proven.
- **Per-Space Dashboards** — only single global Dashboard exists in v1. User-creatable dashboards inside individual Spaces = future feature.
- **Custom blocks (beyond standard set)** — block architecture built extensible, but actual custom third-party blocks are future work, not v1 (see 03-modules/notes.md).

- **`.goodnotes` file import → "Handwritten Notes" entity** — future feature, not v1. GoodNotes has no official public API (confirmed), so this is manual import only: user exports a `.goodnotes` file (or plain PDF) and brings it into Nookly.
  - **Plain PDF export** = works today with zero new work — just a normal File attachment, no special handling needed.
  - **`.goodnotes` native import** = richer, deferred. Uses an unofficial, community reverse-engineered parser (`goodnotes_re` / `parser-for-goodnotes`, MIT-style hobby project, not vendor-supported) to extract real stroke data, structured text boxes/shapes, and synced audio — not just a flattened page image.
  - **Key design decision already made for when this is built**: a `.goodnotes` import must NOT become a generic File. It becomes its own dedicated entity type — **"Handwritten Note"** — distinct from both File and the standard Notes/Pages module, because the whole point is that its content is structured/extractable (real strokes, real text objects, possibly audio) and should be indexable/searchable/relatable like a first-class entity, not opaque like an attached document.
  - Risk to flag whenever this is picked up: depends on an unofficial, unmaintained-by-vendor library parsing an undocumented binary format — could break silently on any GoodNotes app update. Should be built as an optional, best-effort feature behind its own boundary, not load-bearing for the core Files/Notes modules.