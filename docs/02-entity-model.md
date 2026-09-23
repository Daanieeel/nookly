# Entity Model

## Base Fields

Every entity has these fields:

- `id`: a stable, unique id.
- `space_id`: required. Every entity belongs to exactly one Space.
- `type`: the module or entity type.
- `title`: always present and always editable by the user. A module may generate a default title (a Session, for example), but the user can still rename it.
- `created_at` and `updated_at`.
- `pinned`: a boolean that powers the Pinned section of the sidebar.
- `icon`: optional, set per instance (an emoji or an icon library icon). When unset, the entity falls back to its type's default icon. Fallback icons render in a neutral, muted color and **never** in the Space accent color. The only exception is a Space's own icon, which renders in the Space accent color.

## Soft Delete and Trash

- Every delete is a soft delete. It sets a `deleted_at` timestamp and moves the entity to Trash.
- Trash is never purged automatically by default. The user empties it by hand. Auto-purge is an opt-in setting.
- A soft-deleted entity stays visible everywhere it is referenced: relationships, attachments, mentions, and pickers. It renders at reduced opacity. Deleting never removes it from the graph.

## No Version History

There is no git and no durable rollback system. Both were rejected because file attachments would bloat the history (see [the decision](06-decisions-log.md#no-git-backed-local-repo-and-no-version-history)).

Undo and redo use an in-memory action stack scoped to the session. In v1 it does not survive a restart.

## Relationship System Implementation

An edge has the shape `(from_entity, to_entity, relationship_type)`. Edges are directed. The inverse label is derived automatically and never stored a second time.

### Relationship Types

Types come from a fixed enum. Core ships types such as `relates-to` and `blocks`. Modules register their own types at build time (Courses registers `sequel-of`, for example).

### Structural Relationships

Structural relationships are a strict subset of relationships whose rules are enforced at the data layer:

- **Task and Sub-task:** progress rolls up and changes cascade. Nesting is one level deep only, so a Sub-task cannot have its own Sub-tasks.
- **Session and Course:** a Session must have exactly one Course.
- **Exam and Course:** an Exam must have exactly one Course.
- **Index Card Deck and Exam:** a Deck must have exactly one Exam.
- **Study Block and Exam:** a Study Block must have exactly one Exam.
- **Assignment and Course:** an Assignment must have exactly one Course.

Everything else is a generic, unrestricted relationship. That includes Course sequels and prequels, Exams or Assignments linked to Tasks or Notes, and File or Bookmark attachments.

### Block-Level Addressing (Notes only)

Every block inside a Note has a stable id, so an individual block can be a relationship target, not just the whole page. For Notes, the relationship picker and search must resolve down to individual blocks.

### Attachments Work in Both Directions

Attachments are directed relationships, so the reverse lookup ("attached to X and Y") comes for free from the graph. No extra modeling is needed.

## Labels

Labels are freeform tags. They are a generic system that any module can use. Tasks do not own them.

Fields: `name`, `color`, `space_id`.

Labels are strictly siloed per Space. There are no global labels. The same label name in two Spaces is two separate entities, and that is intended. The label picker only shows and creates labels for the current Space.
