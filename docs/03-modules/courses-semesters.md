# Module: Courses & Semesters

## Course

Tracks university course. Belongs to at most one Semester at a time.

Prequel/Sequel = typed generic relationships (`sequel-of` / `prequel-of`). NOT dedicated schema fields. Reuses core relationship system.

Course↔Semester = generic `course-semester` relationship, capped at one Semester per Course (`OneToPerFrom` cardinality) — a Semester has unrestricted Courses. Reassigning a Course to a different Semester replaces the old link (`set_course_semester`), it doesn't add a second one. NOT a date-range field.

## Semester

Full entity (e.g. "WS 2026/27"). Not a string/tag field on Course. Participates in relationship system.

## Layout Direction (UI)

Card-grid or compact list. Show course identity: name, semester chips, sequel/prequel indicators. Not a bare table.
