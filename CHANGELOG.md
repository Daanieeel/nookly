# Changelog

All notable changes to Nookly are listed here.

## 0.18.24 (2026-10-07)

### Added

- Relate a task to a page, course or other item right when you create it
- Pick a specific session as an assignment's due date, and the due date follows that session
- Circuit blocks label every gate and input pin inside the drawing, and have a copy code button
- More due date presets: end of the month and in one month

### Changed

- Notes and jots keep their centered page width, while other pages use the full width
- The right sidebar scrolls on its own instead of moving the whole page
- The next session no longer counts sessions that have already started
- Refine into new note button is easier to find
- Thinner overlines in circuit drawings

### Fixed

- Popovers in create dialogs scroll properly and stay inside small windows
- The file viewer theme Light is restored to its default for existing users
- Linux builds now ship with the correct app icon

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

