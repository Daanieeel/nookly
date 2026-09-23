# Module: Exam Tracking

A standalone module. Exams reference a Course; they are not nested inside it.

## Exam (native entity)

Fields: exam date, weight or grade relevance, grade received, and status.

**Structural relationship:** Exam and Course. Every Exam has exactly one Course.

## Index Card Deck (native entity)

Flashcards with markdown on the front and back, grouped into decks. Includes basic spaced repetition scheduling, using either Leitner boxes or lightweight SM-2-style interval tracking per card.

**Structural relationship:** Deck and Exam. Every Deck has exactly one Exam.

## Study Block (native entity)

A scheduled, time-boxed block of study time that can appear on a calendar. Fields: `date`, `start_time`, `end_time`.

**Structural relationship:** Study Block and Exam. Every Study Block has exactly one Exam. It is deliberately **not** tied to a Course, because a Study Block is not a lecture and must stay distinct from a Session.

A Study Block can optionally relate to specific Index Card decks or Notes to study during that time. It is eligible for the future calendar view, where it should look visibly different from a Session.

## Reused Data

Todos, deadlines, and notes are linked to an Exam through generic relationships. Exam Tracking owns none of that data; it relies on the Tasks and Notes modules.

## Layout Direction

A timeline or upcoming-first list, sorted by date, with visual emphasis on urgency and proximity. Grade and status appear as clear badges, not as a plain text column.
