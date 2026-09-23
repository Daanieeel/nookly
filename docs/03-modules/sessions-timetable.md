# Module: Sessions and Timetable

A Session represents a single class occurrence, such as one lecture.

## Recurrence

A recurring Session Template (for example "Algorithms I, Mon 10 to 12, weekly") generates Session occurrences. Editing the template only affects future occurrences that have not happened yet.

Each occurrence can override its own time, date, cancelled status, location, and notes, just like overrides in a standard calendar. Editing the template never rewrites an occurrence that has already been overridden.

One-off Sessions (irregular dates, courses with few ECTS) are simply occurrences with no parent template. They use the same entity type. There is no separate "one-off Session" type.

## Structural Relationship

Session and Course. A Session must always have exactly one Course. This is enforced at the data layer (see [structural relationships](../02-entity-model.md#structural-relationships)).

## Relationship Targeting

Every relationship (Jots, Notes, Tasks, Files) targets a **specific occurrence**, never the template. The template's only job is to generate occurrences, and it does not take part in the relationship graph.

## Future

The data model lays the groundwork for a calendar view. The view itself is not built yet.

## Layout Direction

Calendar first, using a weekly timetable grid. This is time-based data, so the calendar is the primary view. A flat list is secondary.

## Creation UX

Sessions are created in context from the calendar by clicking or dragging across a time slot. The calendar itself is the creation surface, not an abstract form.
