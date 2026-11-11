# Module: Moodle

A read only window onto the user's Moodle site, so they rarely need the website just to read or download something. Every page has an Open in Moodle button for the same page on the site. Nookly never writes to Moodle: no submitting, posting, or marking things done.

It has no entities of its own, like [Grades](grades.md). Nothing read from Moodle is an entity: it has no Space of its own and is not searched. A [reference](references.md) behind a File can check whether Moodle still shows a course or assignment (see [the decision](../06-decisions-log.md#moodle-is-a-read-only-module-with-no-entities)). One Moodle site is connected for the whole app, and the module can be added to any Space.

## Pages

| Page                     | Shows                                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Courses                  | The user's courses, current ones first                                                                                                                                      |
| Contents                 | Sections, descriptions, files, links and Moodle pages. Files download on demand, open in a tab of Nookly (PDFs, pictures, video, audio) and can be imported into the Space. |
| Assignments              | Due dates, description, attachments, submission status, grade and feedback                                                                                                  |
| Grades                   | Grade items with grade, range, percentage, weight and feedback                                                                                                              |
| Announcements and forums | Discussions, posts and their attachments                                                                                                                                    |

Moodle sometimes sends `null` for what an item doesn't have; those fields are dropped before reading (`without_nulls` in `moodle/api.rs`). Anything else a course holds (a quiz, say) is listed with a link to its page on Moodle. Images inside Moodle text show as their description, because Moodle only serves them to a signed in browser.

## Signing in

Through the university's own login page, as the Moodle mobile app does, so single sign on and two step login work. On macOS that is the system's sign in sheet (`moodle/native_login.rs`), because it offers the passwords saved in Apple Passwords, which a web view of our own cannot. Elsewhere it is a window of Nookly's own (`moodle_open_login`) with no access to Nookly's commands, no cookies kept and https only. Either one catches Moodle's redirect to `nookly://token=...` itself and finishes the sign in; a browser would not hand that redirect to an app unless a click started it. A link only counts for a sign in Nookly started itself (the passport check in `moodle/login.rs`). The token is kept in the OS keychain. The site must allow the mobile app web service, and Moodle 3.7 or later.

## Importing files

Import opens a dialog first (`MoodleImport.tsx`): the name (the item's name with the file's extension, or the file's own), Labels (one field showing what will be applied, opening the searchable label picker; the course and the section are suggested under it, the course one picked, and a Label the Space already has by that name is reused; new Labels are only created when the import succeeds) and the Course of Nookly with the same name, if any, picked from the same searchable list as when relating items. Everything is applied by one command, `import_file_with_details`, so it lands whole or not at all.

The File keeps its `origin` (`moodle:<address of the file on the site>`), which is how the module knows it was imported: such a file shows Show in Nookly instead of Import. A File in the trash counts as not imported. Files imported before `origin` existed have none and still offer the import.

## Storage

Code lives in `apps/desktop/src-tauri/src/moodle/`. The connection (no token) is `moodle.json` in the app data folder. The last answers are cached in `moodle-cache/` for offline reading, not backed up, and removed on disconnect. Downloaded files are in `moodle-files/`, are backed up, and are never removed by disconnecting.

The module's page is the `moodlePath` of the module view, so Back, Forward and tabs work as for any page.

## Command line

Agents read Moodle through `nookly cli moodle_<page> list|get` (`cli/remote.rs`), read only and always live. The pages are declared in `moodle/remote.rs`, the registry the CLI's `schema` and `describe` show as `remoteTypes`; a new page is one more entry there. Reads use `MoodleState` and the token in the keychain, so they work with the app closed. `moodle_file download` saves a file to a path the agent names and never overwrites.

## Calendar

Deadlines show on the Calendar and the Sessions calendar through the Moodle calendar link, connected under Calendar connections (see [External Calendar Overlay](sessions-timetable.md#external-calendar-overlay)). It is a separate connection from the module's sign in.
