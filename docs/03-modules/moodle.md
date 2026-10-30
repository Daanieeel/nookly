# Module: Moodle

A read only window onto the user's Moodle site, so they rarely need the website just to read or download something. Every page has an Open in Moodle button for the same page on the site. Nookly never writes to Moodle: no submitting, posting, or marking things done.

It has no entities of its own, like [Grades](grades.md). Nothing from Moodle is an entity: it has no Space of its own, takes no relationships, and is not searched or exposed through the CLI (see [the decision](../06-decisions-log.md#moodle-is-a-read-only-module-with-no-entities)). One Moodle site is connected for the whole app, and the module can be added to any Space.

## Pages

| Page                     | Shows                                                                            |
| ------------------------ | -------------------------------------------------------------------------------- |
| Courses                  | The user's courses, current ones first                                           |
| Contents                 | Sections, descriptions, files, links and Moodle pages. Files download on demand. |
| Assignments              | Due dates, description, attachments, submission status, grade and feedback       |
| Grades                   | Grade items with grade, range, percentage, weight and feedback                   |
| Announcements and forums | Discussions, posts and their attachments                                         |

Anything else a course holds (a quiz, say) is listed with a link to its page on Moodle. Images inside Moodle text show as their description, because Moodle only serves them to a signed in browser.

## Signing in

Through the browser, as the Moodle mobile app does, so single sign on and two step login work. Moodle redirects to `nookly://token=...`, which finishes the sign in. A link only counts for a sign in Nookly started itself (the passport check in `moodle/login.rs`). The token is kept in the OS keychain. The site must allow the mobile app web service, and Moodle 3.7 or later.

## Storage

Code lives in `apps/desktop/src-tauri/src/moodle/`. The connection (no token) is `moodle.json` in the app data folder. The last answers are cached in `moodle-cache/` for offline reading, not backed up, and removed on disconnect. Downloaded files are in `moodle-files/`, are backed up, and are never removed by disconnecting.

The module's page is the `moodlePath` of the module view, so Back, Forward and tabs work as for any page.

## Calendar

Deadlines show on the Calendar and the Sessions calendar through the Moodle calendar link, connected under Calendar connections (see [External Calendar Overlay](sessions-timetable.md#external-calendar-overlay)). It is a separate connection from the module's sign in.
