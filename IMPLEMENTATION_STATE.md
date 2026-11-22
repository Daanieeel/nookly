# Implementation brief and state: small annoyances before 1.0.0

> **Keep working until every item below is ticked.** This file carries context between sessions: tick items and update notes after every meaningful step, and commit it with the work. `NOTES.md` is the user's own file: never edit, format, checkout or restore it.

Read `AGENTS.md` and `docs/00-index.md` first.

## Ground rules (user, 2026-11-22)

- **Version stays 1.0.0.** No bumps until the user releases 1.0.0 (latest published release is v0.75.3). Changelog and `whats-new.json` changes fold into the existing `1.0.0` entry. The 1.0.1 and 1.1.0 entries were folded into it.
- Branch: `polish/jots-notes-files-mobile`. Changes are discussed first, then built.
- Copy never uses em or en dashes.

## Tasks

### Desktop

- [x] **Jots** (inbox mode): one toolbar row, opens on Unrefined, "Show refined" toggle, refined jots grouped under the rest, chip row only for custom filters, hover Refine button and `R` on a focused row, empty columns hidden.
- [x] **Notes**: Continue cards (only above 4 notes), notes grouped by Pinned, Course, No course, cards / list / table toggle (remembered, default cards), table grouped the same way.
- [x] **Files** desktop (search first, views kept), only the docs left:
  - [x] Backend: `attachedTo` and `courses` read only fields on a File (`db/files.rs`, test passes once `cargo test` is run), registered as computed CLI fields.
  - [x] Backend: run `cargo test` for files and `NOOKLY_UPDATE_SNAPSHOTS=1 cargo test --lib cli::snapshot_tests`, review the snapshot diff.
  - [x] Frontend types: `FileEntity.attachedTo` and `courses`; fix the mobile fixtures that build a `FileEntity`.
  - [x] Search bar over names, content and labels (the `search` command with `types: ["file"]`), chips for Course, Kind, Date, Label, Attached to, and an Unsorted chip.
  - [x] Grouping gets Course and Attached to.
  - [x] Slim the header: reindex into Settings, presets and New view into the view menu.
  - [x] Views: optional `query` in the view config (additive, old views load unchanged), saved and restored by `useViewPage`, creatable through the generic CLI view create. Decision: the search text IS saved in a view.
  - [x] Tests. Docs still to do in the Finish list.

### Mobile (apps/mobile)

- [x] Course cards are not rounded and have no card background: give them the card surface and rounded corners.
- [x] The Display options button sometimes wraps onto its own line (Assignments header): keep it on the title row.
- [x] New calendar item: the Starts and Ends rows are misplaced and cut off: lay them out cleanly.
- [x] **Translate the three desktop reworks to mobile** (user, 2026-11-22), following the mobile rules in `AGENTS.md` (bottom sheets, grouped lists, desktop icons, no desktop dropdowns):
  - [x] Jots inbox: Unrefined by default, Show refined toggle, Refine action on a row.
  - [x] Notes: Continue cards, grouped by course, cards / list layouts.
  - [x] Files: search first, Unsorted chip, Course and Attached to filters and grouping, saved views keep the search.

### Finish

- [x] `CHANGELOG.md` and `whats-new.json`: one plain line per user visible change inside `1.0.0`.
- [x] Docs: `docs/03-modules/jots.md`, `notes.md`, `files-bookmarks.md`, `docs/06-decisions-log.md` if a decision changed.
- [x] `bun run lint`, `bun run format:check`, `bun run typecheck`, `bun run test`, `cargo test` in `apps/desktop/src-tauri`, `bun run duplication`.

## Decisions

- Jots: option B (inbox). Notes: option B (Continue plus by course). Files: option C (search first), views kept and agent creatable. See the discussion in this branch's first session.
- Files `courses` means attached to a Course directly, or to something linked to one (Assignment, Exam, Session, Note of a Course).
- Continue strip only shows above 4 notes, since fewer are all visible in the groups anyway.

## Needs the user

- Review pass, then commit (nothing is committed yet). Open choices: mobile Notes Display has no per-property switches yet (desktop does); Continue and property switches are per device.

## Progress log

- 2026-11-22 (follow ups): Unsorted is a starter View (shared `file-views.ts`, once per Space and device, deletable) on both platforms; Notes Group by and "Continue" switch; property chips like Tasks; Show refined / Unsorted outline buttons; mobile note cards on the card tone, ... label badge, file kind colours; save bar full width only with Save as View.

- 2026-11-22 (end): Notes layout moved into a Display popover (layout, Continue, property switches). Files search and shortcuts moved to a row under the header. Everything checked: lint, format, typecheck, JS tests, cargo (search budget test is a timing flake under load, passes alone), duplication 0.15%.
- 2026-11-22 (later): desktop Files done (search hook, filters, Unsorted, grouping, view `query` incl. CLI validation and snapshots). Mobile: header buttons grouped, Starts/Ends re-laid as iOS rows, gallery cards use the page card tone (OnPage in ModuleScreen), Jots inbox (Show refined chip), Notes (Continue, by course, cards/list/table). Shared: `note-groups.ts`, file `attachedTo`/`courses` in `listFiles`. Left: mobile Files UI, docs, changelog, full check run.
- 2026-11-22: version set to 1.0.0 everywhere, changelog and whats-new folded. Jots and Notes desktop done with tests. Files backend fields added.
