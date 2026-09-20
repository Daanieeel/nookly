# Module: Exam Tracking

Standalone module. References a Course (not nested inside it).

## Exam (native entity)
Fields: exam date, weight/grade-relevance, grade received, status.
Structural relationship: Exam ↔ Course, exactly one Course.

## Index Card Deck (native entity)
Front/back markdown-capable flashcards, grouped into decks.
Structural relationship: Deck ↔ Exam, exactly one Exam.
Includes basic spaced-repetition scheduling (Leitner-box or lightweight SM-2-style interval tracking per card).

## Study Block (native entity)
Time-boxed, calendar-eligible scheduled study time. Fields: `date`, `start_time`, `end_time`.
Structural relationship: Study Block ↔ Exam, exactly one Exam. NOT tied to Course (deliberately distinct from Session — not a lecture occurrence).
Optional generic relationship to specific Index Card decks or Notes to study during block.
Eligible for future calendar view, visually distinct entity type from Session.

## Reused (no native data owned)
Todos/Deadlines/Notes — reused via generic relationship to Exam. Exam Tracking owns none of this data itself, delegates to Tasks/Notes modules.

## Layout Direction (UI)
Timeline or upcoming-first list, sorted by date, visual urgency/proximity emphasis. Grade/status as clear badge, not plain text column.
