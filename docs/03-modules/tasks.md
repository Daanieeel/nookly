# Module: Tasks (renamed from Todos)

Ticket-style. Deadlines, labels, grouping. Jira/Linear inspired.

## Status

Linear-style customizable. Default set ships. User can rename/delete defaults, add custom statuses.
Each status: color, label, "doneness" %.
Config = global, not per-Space (see 01).

## Dates

Two fields: `start_date`, `due_date`. Enables future timeline/Gantt view.

## Labels

Freeform, Space-scoped (see 02). Grouping (by label/status/date) = view-level display concern, not stored structural concept.

## Sub-tasks

Dedicated Sub-task page type. Linked via structural Task↔Sub-task relationship (see 02). Progress rollup, cascading behavior. One level max, no sub-sub-tasks.

## Recurring Tasks

Out of scope v1. Do not build.

## Layout Direction (UI)

Default: board view (Linear-style columns by status). Toggle: dense list/table grouped by status/label/date.
Sub-tasks: inline collapsible checklist inside Task detail view. Not separate rows in main list.

## Creation UX

Lightweight keyboard-first quick-create overlay. Title + inline status/label/date pickers. Not a full form.
Support "create then immediately create another" without closing overlay.
Contextual "+" on hover over board column = create directly into that status.
