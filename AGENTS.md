# Nookly — Agent Instructions

Full project docs live in `/docs/`. Read `/docs/00-index.md` first, every session, before writing code for this project.

**Nookly is released. User data must be preserved at all costs; data loss is never acceptable.** People put their whole life into Nookly and trust it to keep that life organized and safe, so treat their data with the care of a bank or insurance. Every change to persisted state (schema, file layout, settings) needs a safe migration from the previous release, and nothing may silently drop, overwrite or corrupt existing data.

Migrations in `apps/desktop/src-tauri/src/db/migrations.rs` are append-only from the moment they exist, not just once released — editing or deleting one that already ran against any real database (a dev build counts) breaks it. Fix forward with a new migration, never rewrite an old one. `cargo test` enforces this (`db::migrations::history::migrations_are_append_only`); regenerate `EXPECTED_HASHES` only after a genuinely additive change.

When working on TODO items, bump the versions of our packages and apps yourself using SemVer standards.
Not every version will be released. However, it is important to bump versions on every patch or minor feature.
Do not touch the major version. Report back to the user if a major version bump would be necessary.

Quick map:

- Where does code go, how do imports work? Read `development/monorepo.md`.
- Building a new module? Read `01-philosophy.md`, `02-entity-model.md`, then the matching file in `03-modules/`.
- Touching sidebar/navigation? Read `04-navigation-spaces.md`.
- Building or fixing any UI? Read `05-ui-ux-direction.md`. Non-negotiable.
- Unsure if a decision was already made? Check `06-decisions-log.md` before deciding yourself.
- Tempted to add a feature (notifications, git, cloud sync, plugin loading)? Check `07-deferred-scope.md` first. Probably deferred on purpose.
- Ambiguous UX/product judgment call? Read `08-vision-and-motivation.md`.

Never modify existing primitive components or design tokens (`packages/ui`). Add new ones only.

Button or Badge `variant="outline"` is for rare, special-case emphasis only. Default to `secondary` or `ghost`.
Icon buttons containing no label always need a short tooltip explaining the action (e.g. "Open Page", "Delete Note" etc.).

When writing any form of copy, never use em or en dashes or use any form of hyphenated sentence structure.

Every new entity type, field, or relationship type MUST be exposed through the CLI automatically via its schema/relationship registration — never add a feature without also registering it in the schema layer the CLI generates from, and never hand-write a one-off CLI command for a specific module. If the generic list/get/create/update/delete/relate/describe pattern can't express a new feature, extend that generic pattern itself rather than bypassing i or ask the user about it.

More specific skills are in `/docs/skills/`
