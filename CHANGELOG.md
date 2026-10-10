# Changelog

All notable changes to Nookly are listed here.

## 0.32.5 (2026-10-10)

### Fixed

- **What's new shows after updating from an older version.** If Nookly never noted which version you last saw, the update card and What's new dialog now appear instead of staying hidden.

## 0.32.4 (2026-10-10)

### Changed

- **The page has a border like the sidebar.** The main area now has the same outline as the left navigation, and it goes away with the sidebar collapsed.

## 0.32.3 (2026-10-10)

### Fixed

- **The titlebar no longer overflows.** A long page or space name now shortens instead of pushing the Settings button out of the window.

## 0.32.2 (2026-10-10)

### Changed

- **What's new tags are clearer.** "New" shows in green and "Improved" in blue.

## 0.32.1 (2026-10-10)

### Changed

- **What's new covers every update you skipped.** After a jump over several versions the dialog lists each one since the version you were on, newest first, instead of only the latest.

## 0.32.0 (2026-10-10)

### Added

- **Export tasks, decks and assignments.** Save one as a Nookly file from its more actions menu. A task takes its subtasks along, a deck its cards, and an assignment its status, due day and grade. Labels, links and review history stay behind.
- **Import them again.** The Import dialog now takes any Nookly file, shows what is inside (the status and dates of a task, the cards of a deck) and imports it as a new item. An assignment is filed under a course you choose.
- **Command line.** `nookly cli <type> export` and `nookly cli <type> import` work for notes, jots, tasks, decks and assignments.

### Changed

- The command palette entry is now **Import from File**, since it takes more than pages.

## 0.31.10 (2026-10-10)

### Added

- **Import a page.** The new Import button in the title bar (or Cmd+I) brings in a page exported from Nookly. Drop the file in, choose the Space, relate it to things you already have, and see what it contains before you confirm.
- **Share a page.** A Share button in the details sidebar of a page, and Share in its more actions menu, send it as Markdown or as a Nookly page file through the share menu of your system.
- **Nookly page files.** Export a page with everything on it, and bring it back with Import.
- **Agent files.** Settings has a new Agent tab with markdown files for your own coding agent. It starts with an AGENTS.md and a NOOKLY.md that explains how to work with Nookly. Files save when you leave the text.
- **Repeating tasks.** A task can repeat, and finishing it creates the next one.
- **Jot for the session now.** Cmd+Shift+J opens the jot of the session that is running right now, or tells you there is none.
- **Symbols and emoji.** Type a colon in a note and pick a symbol or an emoji, with the common ones ready right away.
- **Mention a page of a file.** Mention a file with @, press the right arrow or type #12 to pick a page, and clicking the mention opens the file on that page.
- **Move table columns.** Drag a column of a table to a new place.
- **Indent with Tab.** Tab and Shift+Tab indent and outdent text in a note.
- **Paste without formatting.** Cmd+Shift+V pastes plain text.
- **Open links with a click.** Cmd or Ctrl and a click opens links, images and files.
- **Scroll position per tab.** Every tab remembers where you were.
- **Hide board columns.** Hide a column on a board, and finished statuses in the open views.
- **Next assignment at a glance.** The Assignments item in the sidebar shows the next one that is due.
- **Open the settings file.** From the command palette or the Settings dialog.
- **Recalculate a formula.** A button on inline formulas recalculates their width.
- **Today in the calendar.** The current weekday is highlighted.
- **What's new.** After an update a card in the sidebar says it worked and shows what changed. Settings has the same button next to the version.

### Changed

- **Relating things is easier.** The Relate to picker now asks one thing at a time: what type, how, and which one. It suggests what belongs with the item, such as the notes of the same course, and shows sessions with their course and time.
- **Sessions are found by date and time.** Search by day or time (Mar 10, Tuesday, 9am) when you relate to a session, mention one, or pick one.
- **The @ menu is grouped by type.** Notes, files, sessions and the rest each have their own heading.
- **Mentions stay up to date.** Renaming a note, a task, a file or anything else updates the mentions of it.
- **Notifications look better.** They have a close button, a Clear all bar when there are several, and their own icon for success, warning, caution and error. Errors stay until you close them, the rest go by themselves.
- **Escape goes back.** In a file it returns to the list instead of leaving full screen.
- **Files from a note stay with it.** A file you add to a note is connected to the note and its course.
- **Wide tables scroll sideways** instead of squeezing their columns.
- **The time field is easier to click.** A click anywhere in it starts at the hour.
- **Blocks added with the CLI open on their preview** for math, equations, diagrams and circuits.

### Fixed

- A PDF that comes back after being unavailable no longer leaves Nookly blank, and can be tried again.
- The menus for @ and / open again after you have closed them.
- Mentions of a file keep their name when the file is renamed.
- The caret no longer ends up inside the hidden code of a block that shows its preview.
- Long folder paths no longer run out of the Settings dialog.

## 0.18.46 (2026-10-09)

### Added

- Add markdown editor and settings areas to the feature request template

### Changed

- Note that multiple areas can be selected in the feature request template
- Show the multiple areas note as the area description in the feature request template
- Destroy editors in the default code language test so CI stops failing on a late timer
- Keep the scroll position and avoid flashing when zooming in a pdf

### Removed

- Remove the per note code language setting from the note sidebar

## 0.18.44 (2026-10-08)

### Added

- Add operation legend for circuit block

### Changed

- Jots created on a session link to the session's course
- Lettered lists keep their letters
- Lettered lists in jots and every markdown editor

## 0.18.40 (2026-10-07)

### Changed

- Linux bundle icon destination needs absolute path
- Small issues batch (#86)

## 0.18.23 (2026-10-06)

### Changed

- Refine into new note button
- Circuit gate labels inside gates, copy button, thinner overlines
- Backfill file viewer theme Light to defaults (#73)
- 67 linux app icon (#72)
- 65 next session excludes started (#71)
- 64 page padding notes jots only (#70)
- 63 assignment due session picker (#69)
- 66 relate task on create (#68)

### Documentation

- Update CHANGELOG.md

## 0.18.15 (2026-10-06)

### Changed

- Upgrade from 0.17.7 with rows of a deleted space
- Circuit block (#62)

## 0.18.6 (2026-10-06)

### Changed

- Grade report upgrade skips spaces that no longer exist
- Filter notes by course, pinned, last edited and created

## 0.18.3 (2026-10-06)

### Changed

- Grade report (#61)

## 0.17.11 (2026-10-05)

### Changed

- File viewer keeps its scroll position across tabs
- Repeat until a date as well as for a duration
- Assignments due before a course's next session
- Calendar blocks only show the lines that fit

## 0.17.7 (2026-10-05)

### Changed

- Math, equation and diagram blocks pasting back as code blocks
- Turn any block into every block it can hold

## 0.17.6 (2026-10-05)

### Changed

- Accept time and room on exams

## 0.17.5 (2026-10-04)

### Added

- Add file preview thumbnails

### Changed

- Image ocr returning no content & reindexing blocking the main thread

## 0.17.3 (2026-10-04)

### Changed

- Improve code quality & add more test coverage (#55)

## 0.17.0 (2026-10-03)

### Changed

- Weekly repeat select in new session dialog, term icons in semester setup
- Space color in view dialog, edit and remove semesters in setup, cmd+arrow history
- Number input with weeks or months interval for session repeat
- Repeat cadence and duration for new sessions
- Repeat control as filter style chip
- Larger repeat chip text
- Repeat chip fills dialog width
- Brighter clickable chip segments, centered content
- Cross-space view presets no longer ask for a space
- Save view dialog no longer asks for a space
- Improved form error states (#53)
- Tabs (#54)

## 0.15.1 (2026-10-03)

### Changed

- Save filters and display as page default from the floating bar

## 0.15.0 (2026-10-03)

### Changed

- Main calendar arrow keys (#45)
- 33 mention search entity keys (#44)
- Paste files in markdown editor (#43)
- Session detail page (#42)
- Cross-space task and assignment overviews (#41)

## 0.12.2 (2026-10-02)

### Changed

- Filter button height and shortcut display

## 0.12.1 (2026-10-02)

### Changed

- Explain —yes flag correctly in agent-instructions
- Task view filters (#36)
- View presets (#37)

## 0.11.29 (2026-10-02)

### Changed

- Show keyboard shortcuts on the sidebar toggle buttons
- Turn typed arrows and comparisons into symbols in the markdown editor
- Draw the double arrows larger in the markdown editor

## 0.11.27 (2026-10-02)

### Changed

- Render only nearby pages in the pdf viewer so large pdfs stay smooth
- Import large files off the main thread and index their text in the background

## 0.11.25 (2026-10-02)

### Changed

- Clearer relationship picker with plain names, typed targets and session dates
- Let the cli edit a course's notes page through the course block commands

## 0.11.23 (2026-10-02)

### Added

- Add nookly cli jot refine, a generic entity action registry

## 0.11.22 (2026-10-02)

### Changed

- Update twinkleplop packages to latest patch
- Support headings up to h6 in the markdown editor

## 0.11.20 (2026-10-02)

### Added

- Add code block improvements

## 0.11.19 (2026-10-02)

### Changed

- Current time line spans all days with time label in gutter

## 0.11.18 (2026-10-02)

### Changed

- Name session jots and notes <Course> - <Session>, <date>

## 0.11.17 (2026-10-01)

### Changed

- Time input not adopting european time format (#32)

## 0.11.16 (2026-10-01)

### Changed

- Linux gpg signing (#29)
- Faster update checks (#28)

### Removed

- Remove space modules (#31)

## 0.11.13 (2026-10-01)

### Changed

- Bump zip from 4.6.1 to 8.6.0 in /apps/desktop/src-tauri (#26)
- Bump the minor-and-patch group in /apps/desktop/src-tauri with 11 updates (#25)
- Switch to tanstack packages (#27)

### Fixed

- Fix all day appointments in calendar

## 0.11.3 (2026-09-29)

### Changed

- Filter, group and order tasks and assignments by every field
- Validate view config written through the CLI
- Keep type inference for assignment ordering

## 0.11.1 (2026-09-29)

### Changed

- Truncate long backup file paths

## 0.11.0 (2026-09-29)

### Changed

- Back up the whole app to a folder (#24)

## 0.10.10 (2026-09-29)

### Added

- Add sorting options for courses

## 0.10.9 (2026-09-29)

### Changed

- Dragging sessions in edit menus

## 0.10.8 (2026-09-29)

### Added

- Add location field for create session dialog

## 0.10.7 (2026-09-29)

### Added

- Add professor field for courses

### Changed

- Enlarge recipe preview banner
- Fit more course cards per row on courses list

## 0.10.4 (2026-09-29)

### Changed

- Cmd+shift+b toggles the right detail sidebar

## 0.10.3 (2026-09-29)

### Changed

- Floating bar hidden behind sticky group headers on files page
- Replaced file image no longer shows old copy in notes

## 0.10.1 (2026-09-28)

### Fixed

- Fix collapsible sidebar

## 0.10.0 (2026-09-28)

### Changed

- Task assignment kanban views (#23)

## 0.9.1 (2026-09-28)

### Fixed

- Fix fullscreen titlebar

## 0.9.0 (2026-09-28)

### Changed

- Recipe tracking (#22)

## 0.8.10 (2026-09-27)

### Changed

- Wrap long label/value text in the Details block instead of scrolling it
- Indent the section navigator to reflect heading levels
- Rewrite CHANGELOG.md by hand for clarity and completeness

## 0.8.8 (2026-09-27)

### Changed

- Calendar improvements (#20)

## 0.8.0 (2026-09-26)

### Changed

- Calendar module (#19)

## 0.7.1 (2026-09-26)

### Changed

- Ocr for files (#18)

## 0.2.0 (2026-09-25)

### Changed

- Make file added field editable
- Filter list by label, expose labels via --fields, reject unknown flags
- Format FileDetailView.tsx

## 0.1.5 (2026-09-25)

### Changed

- Format sidebar.tsx
- Dependency updates (#16)

### Fixed

- Fix module & space dragging

## 0.1.3 (2026-09-25)

### Added

- Add smoke test step for macos to release pipeline

### Changed

- Format lib.rs

### Fixed

- Fix app crashes
- Fix release workflow

## 0.1.2 (2026-09-25)

### Changed

- Move to monorepo
- V0.1.0
- Separate dev data
- Never honor NOOKLY_DATA_DIR in a release build
- Update BookmarkSheet.tsx
- Back up the database right before a pending migration runs
- Update mod.rs
- Monorepo (#11)

### Fixed

- Fix table column misalignment in preference-keys.md

### Documentation

- Update AGENTS.md

## 0.0.0 (2026-09-24)

### Added

- Added shadcn lint
- Add colors positive and caution
- Added eslint-plugin-better-tailwindcss
- New blocks (#9)

### Changed

- Initial Commit
- First draft
- Second draft
- Sidebar
- Dashboard sentence
- Titlebar
- Kbd shortcuts
- Mascot placement
- Mascot cutout
- Mascot
- Sidebar
- Courses page
- Course pages
- Semester page
- Courses list page
- Cli
- Tables
- Table drag & drop
- Update TableRowHandles.tsx
- Code block syntax highlighting
- Reworked docs
- Block handles and plus button
- Page options
- Improved error/success feedback
- Right sidebar resizing
- Moved local storage keys
- Spotlight search
- Cmd+k filtering
- Filters
- Quick actions spotlight
- Bump dirs from 6.0.0 to 7.0.0 in /src-tauri
- Bump thiserror from 1.0.69 to 2.0.20 in /src-tauri (#4)
- Bump tauri in /src-tauri in the minor-and-patch group (#3)
- Improve markdown render performance (#6)
- Bump tauri-apps/tauri-action from 0 to 1 in the actions group (#2)
- Notes (#7)
- Auto updater (#8)
- Tasks (#10)

### Fixed

- Fix shadcn lint errors
- Fix right sidebar
- Fixed version check
- Fix windows & linux builds
- Fix app icon bundling

### Removed

- Deleted entity view

### Documentation

- Update 05-ui-ux-direction.md
- README & License
- Update AGENTS.md

