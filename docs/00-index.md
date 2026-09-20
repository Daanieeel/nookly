# Nookly — Docs Index

Nookly. Modular open-source desktop app. Personal life organizer. Tauri build. Primarily for one user, extensible by community.

Read files in this folder before building features. Do not skip.

## Files

- `01-philosophy.md` — core rules. Read first. Always.
- `02-entity-model.md` — base entity, relationships, soft-delete.
- `03-modules/*.md` — one file per module. Read only the ones relevant to task.
- `04-navigation-spaces.md` — sidebar, Spaces, Dashboard, Pinned, Search.
- `05-ui-ux-direction.md` — visual system, redesign rules, component consistency.
- `06-decisions-log.md` — why decisions were made. Check before reversing any decision.
- `07-deferred-scope.md` — explicitly NOT in scope. Do not build these unless told.
- `08-vision-and-motivation.md` — the "why" behind the app. Use for judgment calls not covered elsewhere.

## Hard Rules (never violate)

1. Never modify existing primitive components or design tokens. Add new ones only.
2. All module config is global. Never per-Space.
3. Relationship system is the only linking mechanism. Never invent a new one.
4. Every entity: soft-delete only. Never hard-delete.
5. No git. No version history system. Not in scope.
6. Modules compile into binary. No runtime plugin loading.
