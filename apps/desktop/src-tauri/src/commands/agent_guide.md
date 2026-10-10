# NOOKLY.md: How to Work With Nookly

Nookly is my personal life-organization desktop app. It holds tasks, notes, courses, sessions, exams, assignments, files, and more, all as linked entries organized into Spaces. You operate it through the Nookly CLI, always invoked as `nookly cli <command>`.

## Start Here, Every Session

Run `nookly cli agent-instructions` before doing anything else. It prints the current data model, every entity type with its fields, which relationships are required, and the exact command syntax. It's generated live from the app, so it's always right.

This file deliberately doesn't list fields or command flags. They change as Nookly grows, and anything written here would go stale. If this file and `agent-instructions` ever disagree, `agent-instructions` wins.

## CLI Conventions

- Always invoke as `nookly cli <command>`. Bare `nookly` is not the agent interface. Don't try it first.
- Add `--json` whenever you're going to process the output programmatically.
- Mutating commands ask for confirmation unless given `--yes`. Only pass `--yes` for small, safe changes, or after I've approved a preview (see `CLAUDE.md` rule 3).
- `--yes` is not accepted everywhere. `create`, `update` and `label attach` fail with "unknown flag" if you pass it, and a failed `create` may still have created the entry, so list before retrying. `relate` and `delete` accept it. Use `--dry-run` to test a command safely.
- `delete` is always a soft delete to Trash. There is no hard delete.
- `nookly cli search <query>` searches everything across all Spaces, including text inside notes and uploaded files. Use it to find things before creating duplicates.

## Concepts That Matter for Judgment Calls

The schema tells you _what_ exists. These notes tell you _how to think_ about it:

- **Spaces are folders.** Every entry lives in exactly one Space. Put new entries in the Space where related entries already live. A Course's exam goes in that Course's Space.
- **Jot vs. Note.** A Jot is a raw, often untitled scrap captured quickly (usually during a lecture). A Note is a properly written page. "Refining" a Jot means `nookly cli jot refine <id>`, which creates the new Note (same title) linked to the Jot, and then writing the content. The Jot itself stays untouched. See `WORKFLOWS.md` for the full learning pipeline.
- **Session vs. Appointment vs. Study Block.** Sessions are my course's class meetings (lectures, tutorials). Appointments are personal calendar entries. Study Blocks are self-scheduled prep time for a specific exam. Never create one when I mean another.
- **Required parents.** Sessions, Exams, and Assignments always belong to a Course. Flashcard decks and Study Blocks always belong to an Exam. Sub-tasks always belong to a Task. `agent-instructions` has the authoritative list.
- **Labels belong to one Space.** A label with the same name in two Spaces is two different labels. Don't assume a label from my Private Space exists in my Study Space.
- **Files are attachments.** Link a File or Bookmark to a Note, Jot or similar with `attached-file`, almost never with `relates-to`.
- **Links are typed.** Connect entries through the relationship system (`nookly cli relate`), picking the link type that actually describes the connection. Don't invent new link types.
