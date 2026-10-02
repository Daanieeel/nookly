# Changelog

All notable changes to Nookly are listed here.

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

