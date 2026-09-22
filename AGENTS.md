# Nookly — Agent Instructions

Full project docs live in `/docs/`. Read `/docs/00-index.md` first, every session, before writing code for this project.

Quick map:

- Building a new module? Read `01-philosophy.md`, `02-entity-model.md`, then the matching file in `03-modules/`.
- Touching sidebar/navigation? Read `04-navigation-spaces.md`.
- Building or fixing any UI? Read `05-ui-ux-direction.md`. Non-negotiable.
- Unsure if a decision was already made? Check `06-decisions-log.md` before deciding yourself.
- Tempted to add a feature (notifications, git, cloud sync, plugin loading)? Check `07-deferred-scope.md` first. Probably deferred on purpose.
- Ambiguous UX/product judgment call? Read `08-vision-and-motivation.md`.

Never modify existing primitive components or design tokens. Add new ones only.

Button or Badge `variant="outline"` is for rare, special-case emphasis only. Default to `secondary` or `ghost`.
Icon buttons containing no label always need a short tooltip explaining the action (e.g. "Open Page", "Delete Note" etc.).

When writing any form of copy, never use em or en dashes or use any form of hyphenated sentence structure.

Every new entity type, field, or relationship type MUST be exposed through the CLI automatically via its schema/relationship registration — never add a feature without also registering it in the schema layer the CLI generates from, and never hand-write a one-off CLI command for a specific module. If the generic list/get/create/update/delete/relate/describe pattern can't express a new feature, extend that generic pattern itself rather than bypassing i or ask the user about it.

More specific skills are in `/docs/skills/`
