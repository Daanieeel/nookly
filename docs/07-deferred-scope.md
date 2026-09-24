# Deferred Scope

Do **not** build any of these unless explicitly told to. Each one was considered and deliberately deferred, not forgotten.

- **Cloud sync and multi-device sync.** v1 is offline-first and single-device. Keep the data model friendly to this future direction where reasonable, but do not build it.
- **Cloud backup.** Related to sync. Once cloud sync exists, large File attachments will be pushed to S3-like storage rather than synced or versioned wholesale.
- **Anki `.apkg` import and export, and card images.** Planned next for decks. Imported cards become the deck's own cards, never a separate Anki collection.
- **Git-backed local versioning, rollback, or persistent undo and redo.** Rejected because of attachment bloat. v1 has no durable history; undo and redo live in memory for the current session only (see [entity model](02-entity-model.md#no-version-history) and [the decision](06-decisions-log.md#no-git-backed-local-repo-and-no-version-history)).
- **Notifications and reminders.** Entirely out of scope, even though Tasks, Exams, Assignments, and Sessions have date fields. Do not build notification scheduling or delivery.
- **Recurring Tasks.** Sessions have full recurrence (templates generating occurrences). Tasks do not get anything equivalent in v1.
- **Runtime plugin architecture.** In v1, modules are compiled into the binary (see [philosophy](01-philosophy.md#compile-time-modules)). A dynamic module system that installs from inside the app is a future evolution, once the module API is proven.
- **Per-Space Dashboards.** v1 has only the single global Dashboard. Dashboards that users create inside individual Spaces are a future feature.
- **Third party custom blocks.** Core ships a few custom blocks (see [Notes](03-modules/notes.md)); blocks contributed by community modules are future work.

## GoodNotes Import and the Handwritten Note Entity

A future feature, not v1. GoodNotes has no official public API (confirmed), so import is manual only: the user exports a `.goodnotes` file (or a plain PDF) and brings it into Nookly.

- **Plain PDF:** works today with no new work. It is just a regular File attachment and needs no special handling.
- **Native `.goodnotes` import:** richer, and deferred. It relies on an unofficial parser reverse engineered by the community (`goodnotes_re` / `parser-for-goodnotes`, an MIT-style hobby project with no vendor support) to extract real stroke data, structured text boxes and shapes, and synced audio, instead of a flattened page image.

**Design decision already made:** a `.goodnotes` import must **not** become a generic File. It becomes its own entity type, the **Handwritten Note**, distinct from both File and the standard Notes module. Its content is structured and extractable (real strokes, real text objects, possibly audio), so it should be indexable, searchable, and relatable like a first-class entity, not opaque like an attached document.

**Risk to raise whenever this is picked up:** it depends on an unofficial library, not maintained by the vendor, that parses an undocumented binary format. Any GoodNotes update could break it silently. Build it as an optional, best-effort feature behind its own boundary, and never let the core Files or Notes modules depend on it.
