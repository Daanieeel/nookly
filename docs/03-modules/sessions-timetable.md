# Module: Sessions and Timetable

A Session represents a single class occurrence, such as one lecture.

## Recurrence

A recurring Session Template (for example "Algorithms I, Mon 10 to 12, weekly") generates Session occurrences. Editing the template only affects future occurrences that have not happened yet.

Each occurrence can override its own time, date, cancelled status, location, and notes, just like overrides in a standard calendar. Editing the template never rewrites an occurrence that has already been overridden.

Edits from the calendar popover pick a scope: this session, this and following, or all upcoming. Series edits (title, times, location) update the template and each occurrence from that date on, but only fields that still carry the template's old value, so single overrides survive. Past occurrences are never rewritten. The CLI reaches the same path by updating a `session_template` with `applyFromDate`.

One-off Sessions (irregular dates, courses with few ECTS) are simply occurrences with no parent template. They use the same entity type. There is no separate "one-off Session" type.

## Structural Relationship

Session and Course. A Session must always have exactly one Course. This is enforced at the data layer (see [structural relationships](../02-entity-model.md#structural-relationships)).

## Relationship Targeting

Every relationship (Jots, Notes, Tasks, Files) targets a **specific occurrence**, never the template. The template's only job is to generate occurrences, and it does not take part in the relationship graph.

Each occurrence can have one Jot (`session-jot`, typed during the session) and one Note (`session-note`, the refinement afterwards). Both are real Jots and Notes, created and opened from the calendar popover. A Note linked as `session-note` is also linked to the Session's Course (`course-notes`).

## Session Page

Opened from the calendar popover, by double clicking a Session, or by its ID anywhere an entity opens. A markdown editor for the occurrence's notes field, a week cut-out of the calendar scrolled to the Session and highlighting it, and previews of its Jot and Note (a create card when one is missing). The sidebar carries the popover's controls, including the edit scope.

## Layout Direction

A full page calendar modeled on Outlook, with Day, Work week, Week and Month views (keys 1 to 4, T for today, arrows to step). The time grid shows the whole day with hour and half hour lines.

## Creation UX

Sessions are created in context from the calendar by dragging across time or clicking a half hour. A drag snaps to 15 minutes and a click proposes 90 minutes (settings: snap, session length). In Month, clicking a day starts one at 9:00. Calendar entries are created the same way and a click proposes 60 minutes (setting: calendar entry length); the unified Calendar only creates entries, so it only uses that one. The week starts per the first day of the week setting, and the day and week views open scrolled to the day start setting, 7:00 by default. The calendar itself is the creation surface, not an abstract form.

## External Calendar Overlay

Google Calendar and iCloud events are drawn on the calendar as a read only overlay (see [the decision](../06-decisions-log.md#external-calendars-are-a-read-only-overlay-not-sessions)). Connect each provider separately under Settings, then pick which calendars to show.

| Provider        | Access                                                             |
| --------------- | ------------------------------------------------------------------ |
| Google Calendar | OAuth in the browser, read only calendar list and events scopes    |
| iCloud          | CalDAV with an app specific password from the user's Apple Account |

- Code lives in `apps/desktop/src-tauri/src/external_calendars/`. Events and connections are cached in `external-calendars.json` in the app data folder, credentials in the OS keychain.
- The overlay polls every 15 minutes while the window is visible and always renders from cache. A failed sync keeps the cached events and shows its error in the connections dialog.
- Google needs `NOOKLY_GOOGLE_CLIENT_ID` and `NOOKLY_GOOGLE_CLIENT_SECRET` (a Desktop app OAuth client) set at build time. Without them the Google option is disabled.
