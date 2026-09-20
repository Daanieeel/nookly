# Entity Model

## Base Fields (every entity)
- `id` — stable unique id
- `space_id` — mandatory, exactly one Space
- `type` — module/entity type
- `title` — explicit, user-editable, always present. Modules may auto-generate default (e.g. Session title), user can still rename.
- `created_at` / `updated_at`
- `pinned` — bool. Powers Pinned sidebar section.
- `icon` — optional per-instance (emoji or icon-lib icon). Falls back to per-entity-type default icon if unset. Fallback icon renders neutral/muted color, NEVER Space accent color. Exception: Space's own icon renders in Space accent color.

## Soft Delete / Trash
- All deletes are soft. `deleted_at` timestamp. Goes to Trash.
- No auto-purge by default. Manual empty only. Auto-purge = opt-in setting.
- Soft-deleted entity stays visible in all relationships/attachments/mentions/pickers, rendered at reduced opacity. Never hard-removed from graph on delete.

## No Version History
No git. No durable rollback system. Rejected due to file-attachment bloat (see 06).
Undo/redo = in-memory action stack, session-scoped only. Not persisted across restarts (v1).

## Relationship System — Implementation

Edge shape: `(from_entity, to_entity, relationship_type)`. Directed. Inverse label auto-derived, not stored twice.

### Relationship Types
Fixed enum. Core types ship (`relates-to`, `blocks`, etc). Modules register own types at build time (e.g. Courses → `sequel-of`).

### Structural Relationships (strict subset, enforced at data layer)
- Task ↔ Sub-task — progress rollup, cascading. Sub-tasks cannot have sub-sub-tasks. One level max.
- Session ↔ Course — Session MUST have exactly one Course.
- Exam ↔ Course — Exam MUST have exactly one Course.
- Index Card Deck ↔ Exam — Deck MUST have exactly one Exam.
- Study Block ↔ Exam — Study Block MUST have exactly one Exam.
- Assignment ↔ Course — Assignment MUST have exactly one Course.

Everything else (Course sequel/prequel, Exam/Assignment→Task, Exam/Assignment→Note, File/Bookmark attachments) = generic unrestricted relationship.

### Block-Level Addressability (Notes/Pages only)
Individual blocks inside a Note have stable IDs. Blocks (not just whole page) can be relationship targets. Relationship picker/search must resolve to block granularity for Notes.

### Attachment Bidirectionality
Attachments are directed relationships. Reverse lookup ("attached to: X, Y") is automatically queryable — falls out of graph, no extra modeling.

## Labels (freeform tags)
Generic system, any module can use, not owned by Tasks specifically.
Fields: `name`, `color`, `space_id`.
Strictly Space-siloed. No global labels. Same label name in two Spaces = two separate entities. This is intended.
Label picker inside a Space only shows/creates labels scoped to that Space.
