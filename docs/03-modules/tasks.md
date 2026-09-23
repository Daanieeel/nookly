# Module: Tasks (formerly Todos)

Ticket-style tasks with deadlines, labels, and grouping, inspired by Jira and Linear.

## Status

Customizable in the style of Linear. A default set of statuses ships with the app, and the user can rename or delete them and add their own.

Each status has a color, a label, and a "doneness" percentage. Status config is global, never per Space (see [philosophy](../01-philosophy.md#module-config-is-always-global)).

## Dates

Two fields: `start_date` and `due_date`. Having both makes a future timeline or Gantt view possible.

## Labels

Freeform and scoped to a Space (see [labels](../02-entity-model.md#labels)). Grouping by label, status, or date is a display concern of the view, not something stored in the data.

## Sub-tasks

Sub-tasks are their own page type, linked through the structural Task and Sub-task relationship (see [structural relationships](../02-entity-model.md#structural-relationships)). Progress rolls up and changes cascade. Nesting is one level deep only.

## Recurring Tasks

Out of scope for v1. Do not build.

## Layout Direction

**Default:** a board view with Linear-style columns per status. A toggle switches to a dense list or table grouped by status, label, or date.

**Sub-tasks:** an inline, collapsible checklist inside the Task detail view. They do not appear as separate rows in the main list.

## Creation UX

A lightweight, keyboard-first quick-create overlay with a title field and inline pickers for status, label, and date. Not a full form.

- The user can create one task and immediately start the next without closing the overlay.
- Hovering a board column reveals a "+" that creates a task directly in that status.
