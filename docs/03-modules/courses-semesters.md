# Module: Courses and Semesters

## Course

Tracks a university course. A Course belongs to at most one Semester at a time.

Prequels and sequels are typed generic relationships (`sequel-of` and `prequel-of`), not dedicated schema fields. They reuse the core relationship system.

A Course is linked to its Semester through the generic `course-semester` relationship. It is capped at one Semester per Course (`OneToPerFrom` cardinality), while a Semester can hold any number of Courses. Assigning a Course to a different Semester replaces the old link (`set_course_semester`) instead of adding a second one. The Semester is not stored as a date range field.

A free text `professor` field is edited in the Course page's properties panel and exposed through the CLI.

### Course Page

Below the Course's own notes editor the page shows stat tiles, then a section per related type: Sessions, Assignments, Tasks, Exams and Notes. Sessions is a cut out of this week of the calendar, with the Course's Sessions and Exams drawn plainly and everything else faded. The others are views from the view engine scoped to the Course, as tables the user can sort and pick columns for: Assignments (`assignment-course`), Tasks (`relates-to`), Exams (`exam-course`) and Notes (`course-notes`, plus Notes written for one of the Course's Sessions). Linked items from other Spaces show with their Space. Each section folds from its title, keeps its count while folded, has a "+" that opens the picker on its type and a View all to the filtered module page where one exists. Customize sections hides and reorders them for every Course page alike (`nookly:page-sections`, per device). The right sidebar's Relationships list folds to a count there, with every link one click away.

### Course Grade

Computed, not stored. Exams with a weight count for that share. Assignments and unweighted Exams split the remaining weight evenly, so a course without weights gets a plain mean. Shown as a tile on the Course page and as the read only `grades` field in the CLI.

## Semester

A full entity (for example "WS 2026/27"), not a string or tag on the Course. It participates in the relationship system like any other entity.

## Layout Direction

A card grid or compact list that shows each course's identity: name, semester chips, and sequel or prequel indicators. Not a bare table.
