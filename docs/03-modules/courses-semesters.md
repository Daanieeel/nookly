# Module: Courses and Semesters

## Course

Tracks a university course. A Course belongs to at most one Semester at a time.

Prequels and sequels are typed generic relationships (`sequel-of` and `prequel-of`), not dedicated schema fields. They reuse the core relationship system.

A Course is linked to its Semester through the generic `course-semester` relationship. It is capped at one Semester per Course (`OneToPerFrom` cardinality), while a Semester can hold any number of Courses. Assigning a Course to a different Semester replaces the old link (`set_course_semester`) instead of adding a second one. The Semester is not stored as a date range field.

## Semester

A full entity (for example "WS 2026/27"), not a string or tag on the Course. It participates in the relationship system like any other entity.

## Layout Direction

A card grid or compact list that shows each course's identity: name, semester chips, and sequel or prequel indicators. Not a bare table.
