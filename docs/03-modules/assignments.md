# Module: Assignments (University)

Structural relationship: Assignment ↔ Course. MUST have exactly one Course.

Generic relationship: Assignment ↔ Tasks. "Matching Todos" = independent Task entities related to Assignment. Assignment has NO built-in checklist/rollup behavior of its own. Fully delegates to Tasks module (same pattern as Exam↔Tasks).

## Native Fields

`due_date`, `status` (not-started / in-progress / submitted / graded), optional `grade`.
No Index Cards, no Study Blocks — those stay Exam-specific only.

## Layout Direction (UI)

Similar to Exams: date-forward, status-forward list. Distinct visual treatment from generic Tasks despite conceptual similarity.
