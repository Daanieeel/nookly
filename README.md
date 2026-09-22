# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## CLI (for scripting / AI agents)

Every entity type, relationship, and block (in Notes/Jots/Refinements) is
reachable from the shell, with no GUI required — this is the primary way a
coding agent should read or change app data. Build the app once (`bun run
tauri build` or `cargo build --manifest-path src-tauri/Cargo.toml`), then:

> **The CLI is a subcommand, not a separate binary — always include `cli`.**
> `nookly` by itself (zero args, or any args without `cli` first) launches
> the GUI and blocks, same as double-clicking the app. Typing bare `nookly`
> at a shell expecting a CLI is a real and common mistake (an AI agent has
> hit exactly this) — every invocation below starts with `nookly cli`.

```sh
nookly cli                    # self-describing help: every command, every entity type
nookly cli schema             # the whole data model as JSON: entity types, fields, relationship types
nookly cli describe task      # one entity type's fields in detail
nookly cli task list --space <space-id>
nookly cli task create --space <space-id> --title "Write CLI" --field dueDate=2026-01-05
nookly cli relate <from-id> sub-task-of <to-id> --yes

# Block-level editing (Notes/Jots/Refinements only — see `describe note`):
nookly cli note add-block <note-id> --type heading1 --content "Intro"
nookly cli note blocks <note-id>
nookly cli note update-block <block-id> --content "Edited"
nookly cli note reorder-blocks <note-id> <block-id> <block-id> ...
nookly cli note delete-block <block-id> --yes
```

Output is JSON on stdout (pretty when run in a terminal, compact when piped);
errors are JSON on stderr with a non-zero exit code. Every mutating command
takes `--yes` instead of prompting, so it's fully non-interactive. Set
`NOOKLY_DATA_DIR` to point the CLI at a scratch database instead of the real
one (handy for testing). See `NOOKLY_CLI_PLAN.md` and `src-tauri/src/cli/` for
the design and implementation.
