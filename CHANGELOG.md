# Changelog

All notable changes to Nookly are listed here.

## Unreleased

### Added

- The section navigator on a Notes page now indents a Heading 2 or 3 under its parent, instead of listing every heading flush left.

### Fixed

- Long label or value text in the Details block now wraps onto new lines instead of scrolling past the column width.

## 0.8.8 (2026-09-27)

### Added

- The Sessions page and the Calendar module page now show each other's items too, Sessions dimmed on the Calendar page and Calendar entries dimmed on the Sessions page, both fully editable in place. Creating one still only happens from its own module.
- Drag handles on a Session or Calendar entry block to extend or shrink its timespan, and drag the whole block to a new time or day, keeping its length.
- Drag to create a Calendar entry that spans multiple days.

### Changed

- Calendar entries and Sessions now tint to their own Space's accent color on that Space's own calendar pages, instead of a fixed purple or primary color.
- The New calendar entry dialog can set its own date and end date, not only whatever was dragged on the calendar.
- Both theme switchers in the settings popover are full width.

### Fixed

- Clicking a Session or Calendar entry block sometimes skipped opening its popover, a regression from the new drag handles.

## 0.8.0 (2026-09-26)

### Added

- Sessions: a full calendar for class occurrences (Day, Work week, Week, and Month views), with recurring session templates and drag to create.
- Calendar: a per-Space personal calendar for one-off and recurring entries, kept separate from Sessions since an entry never needs a Course.
- A unified, cross-Space Calendar page layering every Space's Sessions and Calendar entries together.
- Google Calendar and iCloud connections, shown as a read only overlay on the calendar.

## 0.7.1 (2026-09-26)

### Added

- OCR indexing and search over scanned and text based files.
- An independent file viewer theme, separate from the app's own theme.
- A label filter for the Files list.
- Finer date buckets when grouping Files by date.
- PDF viewer page navigation and a thumbnail sidebar.
- The file index is now reachable from the CLI.

### Fixed

- Files are served from the resolved data directory in dev builds.
- Removed a broken drag and drop file import path.
- Selected labels float to the top in picker popovers.

## 0.2.0 (2026-09-25)

### Added

- CLI: filter `list` by label (matched against every given name, validated against the Space's own labels), and reject any unknown flag instead of silently ignoring it.
- CLI: `label get <id>` for a reverse lookup, every entity carrying a label.
- `--fields labels` now works on `list`, not only on `get`.

### Changed

- A File's "Added" date is now directly editable.

## 0.1.5 (2026-09-25)

### Changed

- Updated dependencies (hyper-rustls, sha2, tower-http, base64).

### Fixed

- Fixed dragging to reorder modules and Spaces in the sidebar.

## 0.1.3 (2026-09-25)

### Added

- A macOS smoke test step in the release pipeline.

### Fixed

- Fixed crashes on launch on some macOS setups.
- Fixed the release workflow.

## 0.1.2 (2026-09-25)

### Added

- Migrated the project to a monorepo layout.
- The database is now backed up right before a pending migration runs.

### Changed

- Dev data now lives in its own directory, separate from a real install's data.
- A release build never honors `NOOKLY_DATA_DIR`, so dev data can't leak into it.

### Fixed

- Fixed a table column misalignment in the preference keys docs.

### Documentation

- Updated agent instructions.

## 0.0.0 (2026-09-24)

### Added

- Sidebar, with Spaces, modules, and drag and drop reordering.
- Dashboard.
- Titlebar with window controls.
- Keyboard shortcuts.
- A mascot corner on the Dashboard.
- Courses, Semesters, and a Courses list page.
- A CLI for managing entities.
- Tables, with drag and drop row reordering.
- Code block syntax highlighting.
- Block handles and a "+" button to insert new blocks.
- A page options menu.
- Right sidebar resizing.
- Spotlight search, with Cmd+K filtering and quick actions.
- Notes (#7).
- Auto updater (#8).
- Tasks (#10).
- New block types (#9).
- shadcn lint rules and `eslint-plugin-better-tailwindcss`.
- `positive` and `caution` colors.

### Changed

- Reworked the docs.
- Improved error and success feedback.
- Moved local storage keys.
- Improved markdown render performance (#6).
- Updated dependencies (dirs, thiserror, tauri, tauri-action).

### Fixed

- Fixed shadcn lint errors.
- Fixed the right sidebar.
- Fixed the version check.
- Fixed Windows and Linux builds.
- Fixed app icon bundling.

### Removed

- Deleted the entity view.

### Documentation

- Updated the UI/UX direction doc.
- Added README and License.
- Updated agent instructions.
