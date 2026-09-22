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
- **Precise, calendar-grade Semester dates** — Semester has `termType`/`year` (authoritative for ordering/"current" detection) and optional approximate `startDate`/`endDate` (cosmetic only, seeded by the setup wizard's bundled offline region lookup, always user-editable, never re-synced). These are NOT precise enough to drive Session scheduling, calendar computation, or the Dashboard mascot's calendar-context line — that still requires a much more precise, per-institution date model and remains out of scope.
