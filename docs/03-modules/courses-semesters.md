# Module: Courses & Semesters

## Course
Tracks university course. Can scope to one Semester or span multiple.

Prequel/Sequel = typed generic relationships (`sequel-of` / `prequel-of`). NOT dedicated schema fields. Reuses core relationship system.

Course spanning multiple semesters = one Course entity related to multiple Semester entities (generic relationship). NOT a date-range field.

## Semester
Full entity (e.g. "WS 2026/27"). Not a string/tag field on Course. Participates in relationship system.

## Layout Direction (UI)
Card-grid or compact list. Show course identity: name, semester chips, sequel/prequel indicators. Not a bare table.
