# Module: Assignments (University)

**Structural relationship:** Assignment and Course. Every Assignment must have exactly one Course.

**Generic relationship:** Assignment and Tasks. An Assignment's "matching todos" are independent Task entities related to it. The Assignment has no checklist or progress rollup of its own and hands all of that to the Tasks module, the same pattern Exams use.

## Native Fields

`due_date` (fixed, or resolved from the Course sessions; the create and edit pickers can also tie it to one session of the Course through an `assignment-due-session` link, so the day follows that session when it moves, and moves on to the next session after it if that one is cancelled or trashed), `status` (not started, in progress, submitted, graded), an optional `grade` and an optional `weight` (its share of the course grade).

Assignments do not get Index Cards or Study Blocks. Those stay specific to Exams.

## Layout Direction

Like Exams: a list that puts dates and status first. It should look clearly different from generic Tasks even though the two are conceptually similar.
