<!-- First instruction: throughout the session, scan the project for piled up `target` build directories (Rust and Cargo builds, for example `apps/desktop/src-tauri/target`) and any other stray build binaries. They grow to many gigabytes. Tell the user when they pile up, and ask before deleting anything. -->

# Nookly — Agent Instructions

Full project docs live in `/docs/`. Read `/docs/00-index.md` first, every session, before writing code for this project.

**Nookly is released. User data must be preserved at all costs; data loss is never acceptable.** People put their whole life into Nookly and trust it to keep that life organized and safe, so treat their data with the care of a bank or insurance. Every change to persisted state (schema, file layout, settings) needs a safe migration from the previous release, and nothing may silently drop, overwrite or corrupt existing data.

Migrations in `apps/desktop/src-tauri/src/db/migrations.rs` are append-only from the moment they exist, not just once released — editing or deleting one that already ran against any real database (a dev build counts) breaks it. Fix forward with a new migration, never rewrite an old one. `cargo test` enforces this (`db::migrations::history::migrations_are_append_only`); regenerate `EXPECTED_HASHES` only after a genuinely additive change.

When working on TODO items, bump the versions of our packages and apps yourself using SemVer standards.
Not every version will be released. However, it is important to bump versions on every patch or minor feature.
Do not touch the major version. Report back to the user if a major version bump would be necessary.

`CHANGELOG.md` is written by hand for the people who use Nookly, and the What's new dialog shows the section of the running version. When you fix or implement something a user would notice, add one short, plain line to the section of the version you bumped to (add `## x.y.z (YYYY-MM-DD)` if it is missing), under `### Added`, `### Changed` or `### Fixed`. Say what changed for them, not how: no issue numbers, no jargon, no commit wording.

A new feature users will notice also gets a card in `whats-new.json` (repo root), which is what the What's new dialog shows for the running version: a `title` and `summary` for the version, `highlights` (each a short `title`, a one sentence `description`, an `icon` from `features/whats-new/icons.ts`, an optional `tag` of `New` or `Improved`, and an optional `shortcut` like `Mod+Shift+J`) and `more` for the smaller lines under `Improved` and `Fixed`. Text is markdown, and a shortcut in code (`` `Mod+K` ``) shows as the system writes it. Newest version first. A version with no entry shows its `CHANGELOG.md` section instead. The dialog shows every version since the one the user last saw, so a jump over several versions lists them all: keep one entry per version you bump to, never merge them.

**After every version bump, `CHANGELOG.md` and `whats-new.json` must be brought up to date in the same commit.** The bumped version needs its `## x.y.z` section in the changelog, and an entry in `whats-new.json` as well: a card under `highlights` for a feature, or just a line under `more` (with a `title` and `summary`, and empty `highlights`) for a smaller improvement or fix. Never leave either file behind the version in `package.json`.

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

Before you finish, run and fix: `bun run lint`, `bun run format:check`, `bun run typecheck`, `bun run test` and `cargo test` in `apps/desktop/src-tauri`. CI runs the same, plus a duplicate code limit (`bun run duplication`, under 1%).

Write the test first for every bug fix and behavior change, watch it fail, then change the code. A test that pins a known bug must say so, and a fixed bug flips its test to the intended behavior.

Changing persisted state also means:

- A new migration, hashed in `EXPECTED_HASHES`, plus a declaration in `db/upgrade.rs` (`DECLARED`) for any existing column it changes. Without it the upgrade check refuses to run.
- Run `cargo test db::upgrade_tests`. It upgrades every schema version through the real check.
- A change to the CLI schema or help text updates the snapshots: `NOOKLY_UPDATE_SNAPSHOTS=1 cargo test --lib cli::snapshot_tests`, then review the diff.

UI work: dialogs and menus get an axe test (`vitest-axe`, see `src/test/axe.ts`), and every permanent action uses `ConfirmPermanentDialog`.

Report only checks, read them and do not silence them: `bun run coverage`, `bun run unused`, `bun run audit`, `bun run lint:rust:strict`.

More specific skills are in `/docs/skills/`
