# Module: Sessions / Timetable

Entity representing single class occurrence (e.g. one lecture).

## Recurrence

Single recurring Session Template (e.g. "Algorithms I, Mon 10-12, weekly") generates Session occurrences.
Editing template affects future, not-yet-passed occurrences only.

Occurrence can override individually: time, date, cancelled-status, location/notes. Standard calendar-style override. Editing template never retroactively rewrites an already-overridden occurrence.

One-off Sessions (irregular dates, low-ECTS courses) = occurrence with no parent template. Same entity type, just template-less. No separate "one-off Session" type.

## Structural Relationship

Session ↔ Course. MUST always have exactly one Course. Enforced at data layer (see 02).

## Relationship Targeting

All relationships (Jots, Refinements, Tasks, Files) target the SPECIFIC occurrence, never the template. Template's only job = generate occurrences. Template itself does not participate in relationship graph.

## Future

Groundwork for calendar view. Not built yet, but data model supports it.

## Layout Direction (UI)

Calendar/timetable-first view (weekly grid). This is time-based data — calendar is primary. Flat list view = secondary only.

## Creation UX

Created contextually from calendar view. Click/drag time slot. Calendar IS the creation surface, not an abstract form.
