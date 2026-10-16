# Module: Courses and Semesters

## Course

Tracks a university course. A Course belongs to at most one Semester at a time.

Prequels and sequels are typed generic relationships (`sequel-of` and `prequel-of`), not dedicated schema fields. They reuse the core relationship system.

A Course is linked to its Semester through the generic `course-semester` relationship. It is capped at one Semester per Course (`OneToPerFrom` cardinality), while a Semester can hold any number of Courses. Assigning a Course to a different Semester replaces the old link (`set_course_semester`) instead of adding a second one. The Semester is not stored as a date range field.

A free text `professor` field is edited in the Course page's properties panel and exposed through the CLI.

### Course Page

Below the Course's own notes editor the page shows, in order: stat tiles, Sessions, Assignments, Notes and Exams. Sessions is a cut out of this week of the calendar, with the Course's Sessions and Exams drawn plainly and everything else faded. Assignments, Notes and Exams look as they do on their own pages. Notes rolls up the five most recently edited Notes linked to the Course, and Show more opens the Notes page filtered to it.

### Course Grade

Computed, not stored. Exams with a weight count for that share. Assignments and unweighted Exams split the remaining weight evenly, so a course without weights gets a plain mean. Shown as a tile on the Course page and as the read only `grades` field in the CLI.

## Semester

A full entity (for example "WS 2026/27"), not a string or tag on the Course. It participates in the relationship system like any other entity.

## Layout Direction

A card grid or compact list that shows each course's identity: name, semester chips, and sequel or prequel indicators. Not a bare table.
