# Module: Assignments (University)

**Structural relationship:** Assignment and Course. Every Assignment must have exactly one Course.

**Generic relationship:** Assignment and Tasks. An Assignment's "matching todos" are independent Task entities related to it. The Assignment has no checklist or progress rollup of its own and hands all of that to the Tasks module, the same pattern Exams use.

## Native Fields

`due_date` (fixed, or resolved from the Course sessions; the create and edit pickers can also tie it to one session of the Course through an `assignment-due-session` link, so the day follows that session when it moves, and moves on to the next session after it if that one is cancelled or trashed), `status` (not started, in progress, submitted, evaluated), an optional `grade` and an optional `weight` (its share of the course grade), and a read only `evaluated_at`, set when the status changes to evaluated, kept while it stays there and cleared on reopening. The Evaluated at filter reads it. An Assignment has an Evaluation, ungraded or graded (new ones start ungraded), for telling homework from graded work. Only a graded one shows the Grade field and counts towards the course grade; going back to ungraded hides the grade but keeps it. The create dialog has the same Ungraded or Graded badge.

Assignments do not get Index Cards or Study Blocks. Those stay specific to Exams.

## Layout Direction

Like Exams: a list that puts dates and status first. It should look clearly different from generic Tasks even though the two are conceptually similar.

## Export and Import

An Assignment exports as a `nookly-assignment` file (version 1): title, status, due day, grade, weight, whether it is ungraded and description blocks. Its Tasks and Course are relationships and stay behind (the Course is named as text). Import creates a new Assignment filed under a Course the user picks.
