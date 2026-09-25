# Nookly Docs Index

Nookly is a modular, open source desktop app for organizing your personal life. It is built with Tauri, designed first for a single user, and meant to be extended by the community.

Read the files in this folder before building any feature. Do not skip this step.

## Files

- [`01-philosophy.md`](01-philosophy.md): the core rules. Always read this first.
- [`02-entity-model.md`](02-entity-model.md): the base entity, relationships, and soft delete.
- [`03-modules/`](03-modules/): one file per module. Read only the ones relevant to your task.
- [`04-navigation-spaces.md`](04-navigation-spaces.md): the sidebar, Spaces, Dashboard, Pinned, Search, and Recents.
- [`05-ui-ux-direction.md`](05-ui-ux-direction.md): the visual system, redesign rules, and component consistency.
- [`06-decisions-log.md`](06-decisions-log.md): why decisions were made. Check it before reversing any decision.
- [`07-deferred-scope.md`](07-deferred-scope.md): what is explicitly out of scope. Do not build any of it unless told to.
- [`08-vision-and-motivation.md`](08-vision-and-motivation.md): the reasoning behind the app. Use it for judgment calls the other docs do not cover.
- [`development/`](development/): repo layout ([`monorepo.md`](development/monorepo.md)) and reference tables.
- [`skills/`](skills/): focused guides for specific tasks.

## Hard Rules (never violate)

1. Never modify existing primitive components or design tokens (`packages/ui`). Only add new ones.
2. All module config is global. It is never set per Space.
3. The relationship system is the only way to link entities. Never invent another one.
4. Every entity is soft deleted. Never hard delete.
5. No git and no version history system. Both are out of scope.
6. Modules are compiled into the binary. There is no runtime plugin loading.
