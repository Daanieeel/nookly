# Module: Exam Tracking

A standalone module. Exams reference a Course; they are not nested inside it.

## Exam (native entity)

Fields: exam date, optional time, optional room, weight or grade relevance, grade received, and status. On the Calendar an Exam with a time is a one hour block, one without a time is an all day event.

**Structural relationship:** Exam and Course. Every Exam has exactly one Course.

## Reused Data

Todos, deadlines, and notes are linked to an Exam through generic relationships. Exam Tracking owns none of that data; it relies on the Tasks and Notes modules.

## Layout Direction

A timeline or upcoming-first list, sorted by date, with visual emphasis on urgency and proximity. Grade and status appear as clear badges, not as a plain text column.
