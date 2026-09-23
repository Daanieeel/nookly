# Module: Assignments (University)

**Structural relationship:** Assignment and Course. Every Assignment must have exactly one Course.

**Generic relationship:** Assignment and Tasks. An Assignment's "matching todos" are independent Task entities related to it. The Assignment has no checklist or progress rollup of its own and hands all of that to the Tasks module, the same pattern Exams use.

## Native Fields

`due_date`, `status` (not started, in progress, submitted, graded), and an optional `grade`.

Assignments do not get Index Cards or Study Blocks. Those stay specific to Exams.

## Layout Direction

Like Exams: a list that puts dates and status first. It should look clearly different from generic Tasks even though the two are conceptually similar.
