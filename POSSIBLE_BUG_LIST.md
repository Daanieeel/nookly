# Possible Bug List Decisions

These were marked as possible bugs. Here is how I decided.

"Actual/real bug" markings need to be fixed.

| File | Line | Decision | Notes on decision |
|---|---|---|---|
| `src/backup/restore_tests.rs` | 474 | Actual bug | Apply the unique folder names |
| `src/backup/restore_tests.rs` | 530 | Actual bug | |
| `src/backup/restore_tests.rs` | 604 | Actual bug | |
| `src/cli/generic_tests.rs` | 274 | Actual bug | |
| `src/cli/generic_tests.rs` | 501 | Actual bug | |
| `src/cli/generic_tests.rs` | 817 | Both cases real bug | |
| `src/cli/generic_tests.rs` | 1056 | Actual bug | |
| `src/cli/generic_tests.rs` | 1079 | Actual bug | |
| `src/cli/generic_tests.rs` | 1095 | Actual bug | |
| `src/cli/generic_tests.rs` | 1120 | Actual bug | |
| `src/cli/generic_tests.rs` | 1136 | Actual bug | |
| `src/cli/generic_tests.rs` | 1151 | Actual bug | Numbers need to be accepted and converted to strings |
| `src/cli/generic_tests.rs` | 1295 | Actual bug | |
| `src/cli/generic_tests.rs` | 1421 | Actual bug | This command needs to exist for all entity types |
| `src/cli/generic_tests.rs` | 1529 | Actual bug | Entity consistency is important |
| `src/cli/generic_tests.rs` | 1560 | Actual bug | Entity consistency is important |
| `src/cli/generic_tests.rs` | 1631 | Actual bug | Features need to do the thing they are advertising |
| `src/cli/generic_tests.rs` | 1634 | Actual bug | Features that look the same across entity types need to act the same way |
| `src/cli/generic_tests.rs` | 1784 | Actual bug | |
| `src/cli/generic_tests.rs` | 1930 | Actual bug | Shouldn't refuse, but return the existing one |
| `src/cli/generic_tests.rs` | 1942 | Actual bug | Self relation and blocking cannot happen on any entity type |
| `src/cli/generic_tests.rs` | 2339 | Actual bug | We must not hide features from agents |
| `src/cli/generic_tests.rs` | 2369 | Actual bug | We need two types of relationships in this case: course-note for 1:1 relationship for a note on the course directly and course-notes for linking regular notes to a course |
| `src/cli/generic_tests.rs` | 2593 | Actual bug | Refuse repeated flags |
| `src/cli/generic_tests.rs` | 2633 | Actual bug | Refuse incomplete flags/fields |
| `src/commands/commands_tests.rs` | 731 | Actual bug | Implement a real NotFound |
| `src/commands/commands_tests.rs` | 1684 | Actual bug | Reuse the real NotFound implementation |
| `src/commands/commands_tests.rs` | 1979 | Actual bug | Reuse the real NotFound implementation |
| `src/commands/commands_tests.rs` | 2105 | Actual bug | Reuse the real NotFound implementation |
| `src/commands/commands_tests.rs` | 2443 | Actual bug | Use InvalidInput error |
| `src/commands/commands_tests.rs` | 3390 | Actual bug | |
| `src/commands/commands_tests.rs` | 3518 | Actual bug | |
| `src/db/assignments_tests.rs` | 125 | | |
| `src/db/assignments_tests.rs` | 270 | | |
| `src/db/calendar.rs` | 1338 | | |
| `src/db/calendar.rs` | 2080 | | |
| `src/db/calendar.rs` | 2463 | | |
| `src/db/decks_tests.rs` | 329 | | |
| `src/db/exams_tests.rs` | 253 | | |
| `src/db/exams_tests.rs` | 280 | | |
| `src/db/labels_tests.rs` | 246 | | |
| `src/db/migration_upgrade_tests.rs` | 1482 | | |
| `src/db/recipes_tests.rs` | 71 | | |
| `src/db/recipes_tests.rs` | 275 | | |
| `src/db/relationships_tests.rs` | 117 | | |
| `src/db/relationships_tests.rs` | 173 | | |
| `src/db/series_scenarios.rs` | 1781 | | |
| `src/db/series_scenarios.rs` | 1874 | | |
| `src/db/series_scenarios.rs` | 1962 | | |
| `src/db/series_scenarios.rs` | 3229 | | |
| `src/db/sessions.rs` | 1292 | | |
| `src/db/sessions.rs` | 1798 | | |
| `src/db/tasks_tests.rs` | 266 | | |
