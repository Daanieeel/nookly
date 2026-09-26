//! Agent/scripting CLI — `nookly cli ...` (PLAN.md, the whole document).
//!
//! This module is the *only* CLI-specific code in the app. It never
//! hand-writes a command per entity type: every `<entity-type> list/get/
//! create/update/delete` invocation below is dispatched generically through
//! `db::schema`'s registry, and `relate`/`search`/`describe`/`schema` are
//! thin wrappers over the exact same core functions the GUI's Tauri commands
//! call. A new module gets full CLI coverage the moment it registers an
//! `EntitySchemaDef` — nothing here needs to change.
//!
//! Design points an agent calling this CLI should know (see `--help`):
//! - JSON on stdout always. Pretty-printed on a TTY, compact when piped.
//! - Non-interactive: mutating commands take `--yes` instead of prompting.
//! - Errors are JSON on stderr, `{"error": {"kind": ..., "message": ...}}`,
//!   with a non-zero exit code.
//! - Every entity type is discoverable at runtime: `nookly cli schema` dumps
//!   the whole data model (entity types, their fields, relationship types);
//!   `nookly cli describe <entity-type>` dumps just one.

mod view;

use crate::db::schema::{self, JsonMap};
use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::IsTerminal;

/// Entry point called from `main`/`lib.rs` when argv looks like `nookly cli ...`.
/// Never returns — exits the process with the command's result.
pub fn main(args: Vec<String>) -> ! {
    let conn = match connect() {
        Ok(conn) => conn,
        Err(e) => fail(&AppError::Db(e.to_string())),
    };

    let result = dispatch(&conn, args);
    match result {
        Ok(value) => {
            print_json(&value);
            std::process::exit(0);
        }
        Err(e) => fail(&e),
    }
}

fn connect() -> Result<Connection, Box<dyn std::error::Error>> {
    let app_data_dir = crate::db::standalone_app_data_dir()?;
    crate::db::connect(&app_data_dir)
}

fn fail(err: &AppError) -> ! {
    let value = json!({ "error": err });
    eprintln!("{}", serde_json::to_string_pretty(&value).unwrap());
    std::process::exit(1);
}

fn print_json(value: &Value) {
    if std::io::stdout().is_terminal() {
        println!("{}", serde_json::to_string_pretty(value).unwrap());
    } else {
        println!("{}", serde_json::to_string(value).unwrap());
    }
}

// --- argv parsing -----------------------------------------------------------

/// Flags that never take a value, so `get NOT-1 --summary NOT-2` doesn't read
/// `NOT-2` as the value of `--summary`.
const BOOL_FLAGS: &[&str] = &[
    "yes",
    "include-deleted",
    "summary",
    "dry-run",
    "regex",
    "case-sensitive",
];

struct Args {
    positional: Vec<String>,
    flags: HashMap<String, String>,
    bool_flags: std::collections::HashSet<String>,
    fields: JsonMap,
    /// Raw `--attr name=value` arguments, in order; parsed by `Args::attrs`.
    attrs: Vec<String>,
    /// Names read off `flags`/`bool_flags` so far, via `flag`/`has_bool` (every
    /// other accessor goes through one of those two). `check_no_unknown_flags`
    /// diffs this against what was actually passed, so a typo'd flag — like
    /// `--labels` instead of `--label` — errors instead of being silently
    /// parsed and then never consulted by anything.
    consumed: std::cell::RefCell<std::collections::HashSet<String>>,
}

fn parse_args(argv: &[String]) -> Args {
    let mut positional = Vec::new();
    let mut flags = HashMap::new();
    let mut bool_flags = std::collections::HashSet::new();
    let mut fields = JsonMap::new();
    let mut attrs = Vec::new();

    let mut i = 0;
    while i < argv.len() {
        let arg = &argv[i];
        if let Some(rest) = arg.strip_prefix("--") {
            if rest == "field" {
                if let Some(kv) = argv.get(i + 1) {
                    if let Some((k, v)) = kv.split_once('=') {
                        fields.insert(k.to_string(), parse_field_value(v));
                    }
                    i += 2;
                    continue;
                }
                i += 1;
                continue;
            }
            if rest == "attr" {
                attrs.extend(argv.get(i + 1).cloned());
                i += 2;
                continue;
            }
            if let Some((key, value)) = rest.split_once('=') {
                flags.insert(key.to_string(), value.to_string());
                i += 1;
                continue;
            }
            let takes_value = !BOOL_FLAGS.contains(&rest)
                && argv
                    .get(i + 1)
                    .map(|next| !next.starts_with("--"))
                    .unwrap_or(false);
            if takes_value {
                flags.insert(rest.to_string(), argv[i + 1].clone());
                i += 2;
            } else {
                bool_flags.insert(rest.to_string());
                i += 1;
            }
        } else {
            positional.push(arg.clone());
            i += 1;
        }
    }

    Args {
        positional,
        flags,
        bool_flags,
        fields,
        attrs,
        // `--dry-run` is read straight off argv by `dispatch`, before any
        // command-specific `Args` even exists, so no `flag`/`has_bool` call
        // ever consumes it here — pre-consuming it keeps it from tripping
        // `check_no_unknown_flags` on every single command.
        consumed: std::cell::RefCell::new(std::collections::HashSet::from(["dry-run".to_string()])),
    }
}

/// Parses `argv_tail`, runs `f` against it, and — only once `f` has succeeded —
/// checks that every `--flag` it passed actually got read by something. A
/// stray flag surfaces as an error rather than the command it named silently
/// doing nothing, even though the command itself already ran fine.
fn run_command(
    argv_tail: &[String],
    f: impl FnOnce(&Args) -> AppResult<Value>,
) -> AppResult<Value> {
    let args = parse_args(argv_tail);
    let result = f(&args)?;
    args.check_no_unknown_flags()?;
    Ok(result)
}

/// `--field weight=0.3` / `cancelled=true` / `title="Quoted"` all parse as the
/// JSON value they look like; anything that isn't valid JSON is kept as a
/// plain string, so `--field startDate=2026-01-05` doesn't need quoting.
fn parse_field_value(raw: &str) -> Value {
    serde_json::from_str(raw).unwrap_or_else(|_| Value::String(raw.to_string()))
}

impl Args {
    fn require_positional(&self, index: usize, name: &str) -> AppResult<String> {
        self.positional
            .get(index)
            .cloned()
            .ok_or_else(|| AppError::InvalidInput(format!("missing required argument: <{name}>")))
    }

    /// An entity id positional, also accepting the entity's key (`TSK-14`).
    fn require_entity(&self, conn: &Connection, index: usize, name: &str) -> AppResult<String> {
        crate::db::entities::resolve_entity_ref(conn, &self.require_positional(index, name)?)
    }

    fn flag(&self, name: &str) -> Option<String> {
        self.consumed.borrow_mut().insert(name.to_string());
        self.flags.get(name).cloned()
    }

    fn require_flag(&self, name: &str) -> AppResult<String> {
        self.flag(name)
            .ok_or_else(|| AppError::InvalidInput(format!("missing required flag: --{name}")))
    }

    /// Every `--attr name=value`; an empty value clears that attr on update.
    fn attrs(&self) -> AppResult<crate::db::block_types::BlockAttrs> {
        self.attrs
            .iter()
            .map(|kv| {
                kv.split_once('=')
                    .map(|(k, v)| (k.trim().to_string(), v.to_string()))
                    .ok_or_else(|| {
                        AppError::InvalidInput(format!("--attr expects <name>=<value>, got '{kv}'"))
                    })
            })
            .collect()
    }

    fn has_bool(&self, name: &str) -> bool {
        self.consumed.borrow_mut().insert(name.to_string());
        self.bool_flags.contains(name) || self.flags.get(name).map(|v| v == "true").unwrap_or(false)
    }

    /// Every `--flag`/`--bool-flag` the caller passed that nothing ever read via
    /// `flag`/`has_bool` — almost always a typo (`--labels` for `--label`,
    /// `--space-id` for `--space`) that would otherwise parse fine and then
    /// silently do nothing.
    fn check_no_unknown_flags(&self) -> AppResult<()> {
        let consumed = self.consumed.borrow();
        let mut stray: Vec<&str> = self
            .flags
            .keys()
            .chain(self.bool_flags.iter())
            .map(String::as_str)
            .filter(|name| !consumed.contains(*name))
            .collect();
        if stray.is_empty() {
            return Ok(());
        }
        stray.sort_unstable();
        stray.dedup();
        Err(AppError::InvalidInput(format!(
            "unknown flag{} for this command: {}",
            if stray.len() == 1 { "" } else { "s" },
            stray
                .iter()
                .map(|f| format!("--{f}"))
                .collect::<Vec<_>>()
                .join(", "),
        )))
    }

    /// Comma separated `--fields a,b,c`, trimmed, empties dropped.
    fn field_list(&self) -> Option<Vec<String>> {
        self.flag("fields").map(|raw| {
            raw.split(',')
                .map(str::trim)
                .filter(|f| !f.is_empty())
                .map(str::to_string)
                .collect()
        })
    }

    fn usize_flag(&self, name: &str) -> AppResult<Option<usize>> {
        self.flag(name)
            .map(|v| {
                v.parse::<usize>().map_err(|_| {
                    AppError::InvalidInput(format!(
                        "--{name} expects a non negative integer, got '{v}'"
                    ))
                })
            })
            .transpose()
    }

    /// Every positional from `index` on, resolved from id or key.
    fn entities_from(&self, conn: &Connection, index: usize, name: &str) -> AppResult<Vec<String>> {
        if self.positional.len() <= index {
            return Err(AppError::InvalidInput(format!(
                "missing required argument: <{name}>"
            )));
        }
        self.positional[index..]
            .iter()
            .map(|raw| crate::db::entities::resolve_entity_ref(conn, raw))
            .collect()
    }

    /// `--if-revision <rev>`: refuses the write unless `current` still matches.
    fn check_revision(&self, current: &Value) -> AppResult<()> {
        let Some(expected) = self.flag("if-revision") else {
            return Ok(());
        };
        let actual = view::revision(current);
        if expected == actual {
            Ok(())
        } else {
            Err(AppError::Conflict(format!(
                "expected revision {expected} but the entity is now at {actual}; someone changed it since \
                 you read it. Re-read it (get / blocks), reapply your change, and retry with the new revision"
            )))
        }
    }

    fn require_yes(&self) -> AppResult<()> {
        if self.has_bool("yes") || self.has_bool("dry-run") {
            Ok(())
        } else {
            Err(AppError::InvalidInput(
                "this is a mutating/destructive command — pass --yes to confirm (never prompts interactively)".into(),
            ))
        }
    }
}

// --- dispatch -----------------------------------------------------------

/// `--dry-run` anywhere runs the command inside a savepoint that is always rolled
/// back: every validation, cardinality check and write happens for real, then none
/// of it is kept. Works for every command with no per-command code. Database
/// changes only; a `file create` from `localPath` still copies the file on disk.
fn dispatch(conn: &Connection, argv: Vec<String>) -> AppResult<Value> {
    if !argv.iter().any(|a| a == "--dry-run") {
        return dispatch_command(conn, argv);
    }
    conn.execute_batch("SAVEPOINT cli_dry_run")?;
    let result = dispatch_command(conn, argv);
    conn.execute_batch("ROLLBACK TO cli_dry_run; RELEASE cli_dry_run")?;
    Ok(json!({
        "dryRun": true,
        "note": "nothing was written; rerun without --dry-run (and with --yes where required) to apply",
        "result": result?,
    }))
}

fn dispatch_command(conn: &Connection, argv: Vec<String>) -> AppResult<Value> {
    let Some(head) = argv.first().cloned() else {
        return Ok(top_level_help());
    };

    match head.as_str() {
        "help" | "--help" | "-h" => Ok(top_level_help()),
        "agent-instructions" => Ok(agent_instructions()),
        "schema" => Ok(schema_all()),
        "describe" => run_command(&argv[1..], |args| {
            let entity_type = args.require_positional(0, "entity-type")?;
            describe_one(&entity_type)
        }),
        "search" => run_command(&argv[1..], |args| {
            let query = args.require_positional(0, "query")?;
            let space_id = args.flag("space");
            let types: Option<Vec<String>> = args.flag("type").map(|raw| {
                raw.split(',')
                    .map(|t| t.trim().to_string())
                    .filter(|t| !t.is_empty())
                    .collect()
            });
            for t in types.iter().flatten() {
                schema::lookup(t).ok_or_else(|| unknown_entity_type(t))?;
            }
            let scope = args.flag("in");
            if let Some(scope) = &scope {
                if scope != "title" && scope != "content" {
                    return Err(AppError::InvalidInput(format!(
                        "--in expects 'title' (titles and keys) or 'content' (block text), got '{scope}'"
                    )));
                }
            }
            let hits: Vec<_> = crate::db::search::search(conn, &query, space_id.as_deref())?
                .into_iter()
                .filter(|h| types.as_ref().is_none_or(|ts| ts.contains(&h.entity_type)))
                .filter(|h| match scope.as_deref() {
                    Some("title") => h.block_id.is_none(),
                    Some("content") => h.block_id.is_some(),
                    _ => true,
                })
                .collect();
            let total = hits.len();
            let limit = args.usize_flag("limit")?.unwrap_or(total);
            let items: Vec<_> = hits.into_iter().take(limit).collect();
            Ok(json!({ "query": query, "count": total, "returned": items.len(), "items": items }))
        }),
        "relate" => run_command(&argv[1..], |args| relate(conn, args)),
        "unrelate" => run_command(&argv[1..], |args| unrelate(conn, args)),
        "space" => space_command(conn, &argv[1..]),
        "label" => label_command(conn, &argv[1..]),
        entity_type => entity_command(conn, entity_type, &argv[1..]),
    }
}

fn top_level_help() -> Value {
    let entity_types: Vec<&'static str> = schema::all().iter().map(|d| d.entity_type).collect();
    json!({
        "usage": "nookly cli <command> [args] [--flags]",
        "note": "Every mutating command is non-interactive; pass --yes instead of confirming a prompt. \
                 Output is JSON on stdout always (pretty when attached to a TTY, compact when piped); \
                 errors are JSON on stderr with a non-zero exit code.",
        "discovery": "Run `nookly cli schema` first — it dumps every entity type's fields and every \
                      relationship type in one call, so you never need to hardcode this app's data model.",
        "entityCommands": {
            "usage": "nookly cli <entity-type> <list|get|create|update|duplicate|convert|delete|restore> ...",
            "ids": "Every entity <id> argument (get, update, delete, restore, blocks, relate, label attach, \
                    entity_ref --field values) also accepts the entity's `key`, e.g. TSK-14.",
            "entityTypes": entity_types,
            "describe": "nookly cli describe <entity-type>  (or `nookly cli <entity-type>` with no verb): \
                         that type's fields, block commands and relationship types",
            "list": "nookly cli <entity-type> list [--space <id>] [--include-deleted] [--since <30m|24h|7d|date|timestamp>] \
                     [--label <name>[,<name>...]] [--fields a,b,...] [--limit <n>]  (--since keeps rows changed since \
                     then, newest first; --label keeps rows carrying every named label (AND match, case insensitive) \
                     and requires --space since labels are siloed per Space; --fields labels works here too, same \
                     shape as on get; block pages also report lastEditedAt, blockCount and bodySize so you can gauge \
                     a get first)",
            "get": "nookly cli <entity-type> get <id> [<id> ...] [--summary | --fields a,b,...]  (includes relationships, \
                    labels, mentionedIn backlinks, a `size` hint and a `revision`. --summary cuts long strings to \
                    excerpts and adds a heading outline for block pages; --fields returns just those fields, e.g. \
                    title,updatedAt. Several ids return {count, items}, a bad id becomes an {ref, error} row)",
            "create": "nookly cli <entity-type> create --space <id> --title <title> [--icon <icon>] [--field name=value ...]",
            "update": "nookly cli <entity-type> update <id> [--title <t>] [--icon <i>] [--pinned true|false] [--space <id>] \
                       [--field name=value ...] [--if-revision <rev>]  (response lists `changes`, before and after per field. \
                       --space moves the entity and everything it structurally owns, e.g. a Task's sub-tasks, to that Space)",
            "duplicate": "nookly cli <entity-type> duplicate <id>  (a copy in the same Space titled \"<title> (copy)\", \
                          with the same fields, icon, labels and block content)",
            "convert": "nookly cli <entity-type> convert <id> --to <entity-type> [--if-revision <rev>]  (turns the entity into \
                        another type in place, keeping its id, relationships, labels and pin; `describe <type>` lists \
                        `convertsTo`, e.g. a file from a link becoming a bookmark)",
            "delete": "nookly cli <entity-type> delete <id> --yes [--if-revision <rev>]  (soft delete only — goes to Trash, never permanent)",
            "restore": "nookly cli <entity-type> restore <id>",
            "grep": "block pages only: `nookly cli <type> grep <id> <pattern> [--regex] [--case-sensitive] [--context <n>] \
                     [--max <n>]`  (matching lines with blockId/blockIndex, instead of pulling the whole page)",
            "childCollections": "records an entity owns that aren't entities, like a deck's cards (`describe <type>` \
                                 lists `childCollections` with every command): `nookly cli <type> <plural> <id>`, \
                                 `add-<singular> <id> --field ...`, `get-<singular>`, `update-<singular>`, \
                                 `delete-<singular> --yes` (soft), `restore-<singular>`, and per collection actions \
                                 such as `index_card_deck review-card <card-id> --field rating=good`.",
            "blocks": "block pages only: note, jot, task and sub_task (`describe <type>` reports supportsBlocks) — full block editing: \
                       `nookly cli <type> blocks <id> [--offset <n>] [--limit <n>]`, `add-block <id> --type <t> --content <c> [--language <l>] [--filename <f>] [--attr <name>=<value> ...]`, \
                       `update-block <block-id> [--content <c>] [--type <t>] [--language <l>] [--filename <f>] [--attr <name>=<value> ...]`, \
                       `delete-block <block-id> --yes`, `reorder-blocks <id> <block-id> <block-id> ...`. \
                       `--language`/`--filename` are the code block header row and only apply to `type=code`. \
                       `--attr` sets a custom block's settings (callout variant, timeline title, ...); \
                       `describe note` lists them under `blockAttrs`. \
                       See `describe note` for the full list of known block types. Every block write takes \
                       `--if-revision <rev>` (the page's revision from `get`).",
        },
        "safety": {
            "dryRun": "Add --dry-run to any command: it runs for real inside a transaction that is always rolled \
                       back, so you see the exact result (and `changes` for update/update-block) with nothing \
                       written. --yes is not needed with --dry-run. Database only: a file import still copies the file.",
            "ifRevision": "`get` returns a `revision`. Pass it back as --if-revision <rev> on update, delete or any \
                           block write; if the entity changed in between, the write is refused with a `Conflict` \
                           error instead of overwriting someone else's edit.",
        },
        "coreCommands": {
            "schema": "nookly cli schema  (the whole data model: every entity type + relationship type)",
            "describe": "nookly cli describe <entity-type>  (one entity type: fields, block commands, relationship types)",
            "relate": "nookly cli relate <from-id> <relationship-type> <to-id> [<to-id> ...] --yes  (several targets \
                       are created all or nothing)",
            "unrelate": "nookly cli unrelate <relationship-id> --yes",
            "search": "nookly cli search <query> [--space <id>] [--type <entity-type>[,<entity-type>...]] \
                       [--in title|content] [--limit <n>]  (title covers titles and keys, content covers block text)",
            "space": "nookly cli space <list|create|update|delete|reorder> ...",
            "label": "nookly cli label <list|get|create|update|delete|attach|detach> ...  (attach/detach take several \
                      label ids; get <id> is the reverse lookup — every entity carrying that label)",
            "agentInstructions": "nookly cli agent-instructions  (a longer prose guide for a coding \
                                   agent that's never used this CLI before — start here, not with \
                                   this --help output, if this is your first call)",
        },
    })
}

/// A prose onboarding doc for a coding agent that's never touched this CLI before — `--help`/
/// `schema` are structural references (commands, fields, types), useful once you already know
/// the shape of the thing; this is meant to be read start-to-end *first*, the way a human would
/// read a README before a man page. Still returned as `{"markdown": "..."}` JSON, not printed
/// raw — this CLI's one hard invariant (see the module doc comment) is JSON on stdout, always.
fn agent_instructions() -> Value {
    json!({ "markdown": AGENT_INSTRUCTIONS_MARKDOWN })
}

const AGENT_INSTRUCTIONS_MARKDOWN: &str = r##"# Nookly CLI — agent guide

Nookly is a personal life-organizer app (Notes, Tasks, Courses, Exams, ...). This CLI
(`nookly cli ...`) is a full read/write interface to the same data the desktop app shows,
built entirely on one generic pattern — there is no hand-written command for any specific
entity type. That means:

- Every command's output is JSON on stdout, always (pretty-printed on a TTY, compact when
  piped) — parse it, don't scrape it.
- Every mutating command is non-interactive: pass `--yes` instead of expecting a confirmation
  prompt (you'll get an error telling you to add it if you forget).
- Errors are JSON on stderr, `{"error": {"kind": ..., "message": ...}}`, with a non-zero exit
  code — the `message` is usually specific enough to fix the call and retry.
- Deleting an entity is *always* a soft delete (goes to Trash, `restore`-able) except `space
  delete`, which is genuinely permanent and takes every entity inside it with it.

## Step 1: discover the data model, don't guess it

Run `nookly cli schema` before doing anything else. It dumps every entity type this app
knows about, each one's fields, and every relationship type, in one call. `nookly cli
describe <entity-type>` gives you the same detail for just one type. Both are cheap,
read-only, and always reflect the actual running app — newer than whatever's in your
training data or memory of a past session. If you're about to guess a field name or a
relationship type, run one of these instead.

## The generic entity pattern

Almost everything is one of:

```
nookly cli <entity-type> list [--space <id>] [--include-deleted] [--since 24h] [--label a,b] [--fields a,b] [--limit <n>]
nookly cli <entity-type> get <id> [<id> ...] [--summary | --fields a,b]   # includes relationships, labels + mentionedIn
nookly cli <entity-type> create --space <id> --title <title> [--icon <icon>] [--field name=value ...]
nookly cli <entity-type> update <id> [--title <t>] [--icon <i>] [--pinned true|false] [--space <id>] [--field name=value ...]
nookly cli <entity-type> duplicate <id>               # copy in the same Space, same fields, labels and blocks
nookly cli <entity-type> convert <id> --to <type>     # same entity, another type; `describe` lists convertsTo
nookly cli <entity-type> delete <id> --yes            # soft delete — Trash, not permanent
nookly cli <entity-type> restore <id>
```

Every entity carries a short `key` next to its `id`, like `TSK-14` or `NOT-3`: a three
letter type prefix and a number. Anywhere a command takes an entity id (including `relate`,
`label attach`, block commands and entity reference `--field` values) you can pass the key
instead. `search` matches keys too. Space, label, block and relationship ids have no key.

## Reading cheaply

Pages can be large. Before pulling one whole:

- `list` rows of block pages carry `bodySize` (`chars`, `approxTokens`), `blockCount` and
  `lastEditedAt`. `get` always reports `size` for its payload.
- `get <id> --summary` cuts every long string to an excerpt and, for pages, adds the heading
  `outline` with block ids and indexes.
- `get <id> --fields title,updatedAt` returns only those fields (`id` and `key` always come along).
- `<type> grep <id> <pattern> [--context 2]` returns just the matching lines with their block
  id and index; `<type> blocks <id> --offset <n> --limit <n>` then fetches that section.
- `get` takes several ids at once; `list --since 24h` (or `7d`, a date, a timestamp) shows what
  changed recently, newest first.
- `search <query> --type note --in content` narrows search to one entity type and to block
  text (`--in title` for titles and keys).
- `list --space <id> --label a,b` keeps only rows carrying every named label (AND match), so
  "everything tagged X and Y" doesn't mean a `get` per row and filtering client side. `--fields
  labels` on `list` (not just `get`) returns each row's labels; `label get <id>` is the reverse —
  every entity carrying one label, across types.

## Writing safely

- `--dry-run` works on every command: it really runs inside a transaction that is then rolled
  back, so validation errors, cardinality checks and the resulting payload are all real, and
  nothing is kept. `--yes` isn't required alongside it. `update` and `update-block` responses
  (dry or not) list `changes` with before and after values, and a line diff for long text.
- `get` returns a `revision`. Pass it back as `--if-revision <rev>` on `update`, `delete` or any
  block write; if someone changed the entity since you read it you get a `Conflict` error
  instead of silently overwriting their edit. Re-read, reapply, retry.
- There is no version history: once a write lands, the previous content is gone (deletes of
  entities go to Trash, though). Use the two tools above before writing, not after.
- `relate <from> <type> <to> <to> ...` and `label attach <entity> <label> <label> ...` take
  several targets in one call, all or nothing.

`--field` is for whatever extra fields that *specific* entity type declares beyond the
universal ones (title/icon/pinned) — `describe <entity-type>` lists exactly which field names
are valid and whether each is settable on create, update, or both. Passing an unknown field
name is an error, not a silent no-op.

## Notes and Jots: block-based pages, not a markdown blob

`note` and `jot` are "pages" — their content is a sequence of typed blocks
(heading, paragraph, code, list, table, ...), not one big string. **There is no `--field
body=<markdown>` shortcut** — an earlier version of this CLI had one, and it was removed
deliberately, because it let agents skip ever learning the real block commands (and a
`code` block built that way had no way to get a language or filename). If you try it, the
error message tells you this and points back here.

Build a page's content with:

```
nookly cli <type> blocks <id> [--offset <n>] [--limit <n>]                        # list blocks in order
nookly cli <type> grep <id> <pattern> [--regex] [--case-sensitive] [--context <n>]  # matching lines only
nookly cli <type> add-block <id> --type <blockType> --content <text> [--position <n>] [--language <l>] [--filename <f>] [--attr <name>=<value> ...]
nookly cli <type> update-block <block-id> [--content <c>] [--type <t>] [--language <l>] [--filename <f>] [--attr <name>=<value> ...]
nookly cli <type> delete-block <block-id> --yes
nookly cli <type> reorder-blocks <id> <block-id> <block-id> ...
```

One call per element — a heading, a paragraph, a code block, one list, one table — not one
call with a whole document jammed into `--content`. A list is ONE block, not one block per
item: `bulleted_list` and `numbered_list` content is every item of the list, one per line,
with no `1. ` or `- ` markers (the editor numbers items within the block, so one block per
item renders as a column of "1."s). An advisory `warning` flags either mistake, and every
list block in `blocks` output carries `display`: the marker each line renders with in the
editor (`1.`, `2.`, ... or `•`) and `restartsAfterList`, true when the block renders as a new
list right after another list of the same type. Check it instead of guessing what the GUI shows.

```
nookly cli note add-block <id> --type numbered_list --content "$(printf 'First\nSecond\nThird')"
```
 `describe <type>` lists every known
`blockType`. If you land a `paragraph` block whose content still looks like a whole unsplit
document (headings, fences, several paragraphs), the response carries an advisory `warning`
telling you to split it — the write still succeeds, but fix it before moving on.

### Code blocks: `--language` and `--filename`

A `code` block's header row in the editor shows a filename and a syntax-highlighting
language. Both are plain flags, not buried in `--field`:

```
nookly cli note add-block <id> --type code --content 'console.log(1)' --language javascript --filename app.js
```

`--language` is a highlight.js grammar name (`javascript`, `typescript`, `python`, `rust`,
`jsonc`, ... — anything is accepted, but only a recognized grammar actually highlights).
Omit it (or pass `--language ""` on `update-block`) for plain, unhighlighted text. Same
`""`-clears convention for `--filename`.

### Custom blocks

Blocks beyond plain markdown (callout, checklist, timeline, ...). Their settings are
`--attr <name>=<value>` flags (repeatable, an empty value clears one). `describe note` lists
every type's content format and attrs under `contentFormats` and `blockAttrs`; multi column
formats separate cells with a tab, like tables.

```
nookly cli note add-block <id> --type callout --content 'Bring a calculator' --attr variant=warning
nookly cli note add-block <id> --type timeline --attr title=Semester --content "$(printf 'Oct 14\tLectures start\nNov 30\tMidterm\tnow\nFeb 10\tFinal exam\tnext')"
nookly cli note add-block <id> --type progress --content "$(printf 'Chapters read\t7\t12\nExercises\t30\t40')"
nookly cli note add-block <id> --type tree --content "$(printf 'Thesis\n  Intro\n  Methods\n    Survey')"
nookly cli note add-block <id> --type steps --attr current=2 --content "$(printf 'Register\tBefore Oct 1\nPay the fee\nPick courses')"
nookly cli note add-block <id> --type stats --content "$(printf '3.7\tGPA\n90\tCredits\tof 180')"
nookly cli note add-block <id> --type details --content "$(printf 'Room\tB 204\nOffice hours\tTue 14:00')"
nookly cli note add-block <id> --type checklist --content "$(printf '[x] Buy notebook\n[ ] Print slides')"
nookly cli note add-block <id> --type divider --content ''
nookly cli note add-block <id> --type entity_card --content '[Midterm](mention:<exam-id>)'
nookly cli note add-block <id> --type image --content '[campus.jpg](mention:<file-id>)' --attr caption='Main campus'
nookly cli note add-block <id> --type file --content '[syllabus.pdf](mention:<file-id>)'   # also video, audio
nookly cli note add-block <id> --type bookmark --content '[Rust Book](mention:<bookmark-id>)'
nookly cli note add-block <id> --type embed --content 'https://www.youtube.com/watch?v=<id>'
nookly cli note add-block <id> --type toggle --content "$(printf 'What is a monad?\nA monoid in the category of endofunctors.')"
nookly cli note add-block <id> --type heading2 --content 'Week 1' --attr toggle=closed   # toggle heading
nookly cli note add-block <id> --type equation --content '\int_0^1 x^2\,dx = \frac{1}{3}' --attr view=rendered
nookly cli note add-block <id> --type diagram --content "$(printf 'flowchart LR\n  Idea --> Draft --> Done')" --attr view=rendered
nookly cli note add-block <id> --type math --content "$(printf '(a+b)^2 &= (a+b)(a+b) \\\\\n&= a^2 + 2ab + b^2')"
```

Inline math goes straight into paragraph text as `$…$` (`The area is $\pi r^2$`); a literal
dollar sign is written `\$`.

### Tables: tabs and newlines, NOT markdown pipe syntax

A `table` block's `--content` is rows separated by `\n`, cells within a row separated by a
literal tab character, first row is the header, no separator row. It is **not** the
`| a | b |` / `|---|---|` markdown table syntax you'd write in a `.md` file — that's an easy,
natural mistake, and this CLI auto-detects it and converts it for you, but you'll get an
advisory `warning` back when that happens. Prefer real tabs from the start:

```
nookly cli note add-block <id> --type table --content "$(printf 'Name\tAge\nAlice\t30\nBob\t25')"
```

## Relationships and search

Relationships link any two entities (or, for Notes, individual blocks) with a typed edge —
`relates-to`, `blocks`, or a module-specific type (`schema` lists every relationship type
that exists):

```
nookly cli relate <from-id> <relationship-type> <to-id> [<to-id> ...] --yes
nookly cli unrelate <relationship-id> --yes
nookly cli search <query> [--space <id>] [--type <t>] [--in title|content] [--limit <n>]
```

Search matches entity titles and, for Notes/Jots, individual blocks. A block hit
carries `blockId` plus a `snippet` whose matched terms are wrapped in `\u0001` / `\u0002`.

## Spaces and Labels

A Space is a top-level workspace (everything else lives inside exactly one). Labels are
freeform tags, siloed per Space (the same label name in two Spaces is two separate labels):

```
nookly cli space <list|create|update|delete> ...      # space delete is PERMANENT, no Trash
nookly cli label <list|create|update|delete|attach|detach> ...
```

Run `nookly cli space` or `nookly cli label` with no further arguments for the exact flags
each verb takes.

## A worked example, start to finish

```
SPACE=$(nookly cli space create --name "Scratch" --color "#3b82f6" | jq -r .id)
NOTE=$(nookly cli note create --space "$SPACE" --title "Example" | jq -r .data.entity.id)
nookly cli note add-block "$NOTE" --type heading1 --content "Example"
nookly cli note add-block "$NOTE" --type paragraph --content "A short intro paragraph."
nookly cli note add-block "$NOTE" --type code --content 'const x = 1;' --language javascript --filename app.js
nookly cli note get "$NOTE" | jq -r .data.body      # the rendered markdown, for a sanity check
```

(Real shells: prefer `jq` for parsing rather than regex/string-splitting the JSON.)
"##;

fn schema_all() -> Value {
    let entity_types: Vec<Value> = schema::all()
        .iter()
        .map(|d| schema::describe_json(d))
        .collect();
    let relationship_types: Vec<_> = crate::db::relationships::list_relationship_types();
    json!({
        "entityTypes": entity_types,
        "relationshipTypes": relationship_types,
        "note": "`space` and `label` are core infrastructure, not registered entity types — see \
                 `nookly cli space`/`nookly cli label` --help-style usage in `nookly cli` with no args.",
    })
}

fn describe_one(entity_type: &str) -> AppResult<Value> {
    let def = schema::lookup(entity_type).ok_or_else(|| unknown_entity_type(entity_type))?;
    Ok(schema::describe_json(def))
}

fn unknown_entity_type(entity_type: &str) -> AppError {
    let known: Vec<&'static str> = schema::all().iter().map(|d| d.entity_type).collect();
    AppError::InvalidInput(format!(
        "unknown entity type '{entity_type}'. Known types: {}. Run `nookly cli schema` for full details.",
        known.join(", ")
    ))
}

fn validate_fields(
    entity_type: &str,
    def: &schema::EntitySchemaDef,
    fields: &JsonMap,
    for_create: bool,
) -> AppResult<()> {
    let known: HashMap<_, _> = def.fields.iter().map(|f| (f.name, f)).collect();
    for key in fields.keys() {
        if !known.contains_key(key.as_str()) {
            // `body` is the one unknown-field name worth a dedicated message: it's not a typo,
            // it's someone reaching for a removed shortcut (`--field body=<markdown>`) that used
            // to parse a whole document at once. Point at the real workflow instead of just
            // reporting an empty "Known fields:" list, which explains nothing about *why* a
            // blocks-backed page has no fields at all.
            if key == "body" && def.supports_blocks {
                return Err(AppError::InvalidInput(format!(
                    "'{entity_type}' has no 'body' field — its content is built from real blocks, not \
                     one markdown string. Add each element (heading, paragraph, code, ...) with its own \
                     `nookly cli {entity_type} add-block <id> --type <blockType> --content <text>` call \
                     (run `nookly cli describe {entity_type}` for knownBlockTypes), then `update-block`/ \
                     `reorder-blocks` to edit or reorder afterward. For a 'code' block, also pass \
                     --language/--filename to fill in the editor's syntax-highlighted header."
                )));
            }
            let names: Vec<&str> = def.fields.iter().map(|f| f.name).collect();
            return Err(AppError::InvalidInput(format!(
                "unknown field '{key}' for entity type '{entity_type}'. Known fields: {}. \
                 Run `nookly cli describe {entity_type}` for details.",
                names.join(", ")
            )));
        }
    }
    if for_create {
        for f in def.fields {
            if f.required_on_create && !fields.contains_key(f.name) {
                return Err(AppError::InvalidInput(format!(
                    "--field {}=<value> is required to create a '{entity_type}'",
                    f.name
                )));
            }
        }
    } else {
        for key in fields.keys() {
            if let Some(f) = known.get(key.as_str()) {
                if !f.writable_on_update {
                    return Err(AppError::InvalidInput(format!(
                        "field '{key}' on '{entity_type}' can only be set at creation, not updated"
                    )));
                }
            }
        }
    }
    Ok(())
}

/// `--field` values of `EntityRef` fields may be keys (`courseId=CRS-2`); swaps them
/// for ids before the module's own adapter sees them.
fn resolve_ref_fields(
    conn: &Connection,
    def: &schema::EntitySchemaDef,
    fields: &JsonMap,
) -> AppResult<JsonMap> {
    let mut resolved = fields.clone();
    for f in def.fields {
        if !matches!(f.kind, schema::FieldKind::EntityRef(_)) {
            continue;
        }
        if let Some(Value::String(raw)) = resolved.get(f.name) {
            let id = crate::db::entities::resolve_entity_ref(conn, raw)?;
            resolved.insert(f.name.to_string(), Value::String(id));
        }
    }
    Ok(resolved)
}

fn entity_command(conn: &Connection, entity_type: &str, rest: &[String]) -> AppResult<Value> {
    let def = schema::lookup(entity_type).ok_or_else(|| unknown_entity_type(entity_type))?;
    let Some(verb) = rest.first() else {
        return Ok(schema::describe_json(def));
    };
    run_command(&rest[1..], |args| match verb.as_str() {
        "list" => list_entities(conn, def, args),
        "get" => {
            if args.positional.len() <= 1 {
                let id = args.require_entity(conn, 0, "id")?;
                return get_entity(conn, def, &id, args);
            }
            // Bulk: one bad ref doesn't sink the rest, it becomes an `error` row.
            let items: Vec<Value> = args
                .positional
                .iter()
                .map(|raw| {
                    crate::db::entities::resolve_entity_ref(conn, raw)
                        .and_then(|id| get_entity(conn, def, &id, args))
                        .unwrap_or_else(|e| json!({ "ref": raw, "error": e }))
                })
                .collect();
            Ok(json!({ "entityType": entity_type, "count": items.len(), "items": items }))
        }
        "create" => {
            validate_fields(entity_type, def, &args.fields, true)?;
            let space_id = args.require_flag("space")?;
            let title = args.require_flag("title")?;
            let icon = args.flag("icon");
            let fields = resolve_ref_fields(conn, def, &args.fields)?;
            let input = schema::CreateInput {
                space_id,
                title,
                fields,
            };
            let data = (def.create)(conn, input)?;
            let id = extract_id(&data)?;
            // `icon` is base-entity data (§ entity model), not a module field —
            // every `create_*` fn takes it as `None` today, so it's applied
            // here generically rather than threading it through every module.
            let data = if icon.is_some() {
                crate::db::entities::update_entity(
                    conn,
                    &id,
                    crate::db::entities::EntityPatch {
                        icon,
                        ..Default::default()
                    },
                )?;
                (def.get)(conn, &id)?
            } else {
                data
            };
            enrich(conn, entity_type, &id, data)
        }
        "update" => {
            let id = args.require_entity(conn, 0, "id")?;
            validate_fields(entity_type, def, &args.fields, false)?;
            let before = (def.get)(conn, &id)?;
            args.check_revision(&before)?;
            let title = args.flag("title");
            let icon = args.flag("icon");
            let pinned = args.flag("pinned").map(|v| v == "true");
            let space_id = args.flag("space");
            if title.is_some() || icon.is_some() || pinned.is_some() || space_id.is_some() {
                crate::db::entities::update_entity(
                    conn,
                    &id,
                    crate::db::entities::EntityPatch {
                        title,
                        icon,
                        pinned,
                        space_id,
                    },
                )?;
            }
            let fields = resolve_ref_fields(conn, def, &args.fields)?;
            (def.update)(conn, &id, &fields)?;
            let after = (def.get)(conn, &id)?;
            let changes = view::diff_values(&before, &after);
            let mut result = enrich(conn, entity_type, &id, after)?;
            result["changes"] = json!(changes);
            Ok(result)
        }
        "delete" => {
            let id = args.require_entity(conn, 0, "id")?;
            args.require_yes()?;
            args.check_revision(&(def.get)(conn, &id)?)?;
            crate::db::entities::soft_delete_entity(conn, &id)?;
            let key = crate::db::entities::entity_key(conn, &id)?;
            Ok(
                json!({ "deleted": id, "key": key, "note": "soft delete only — recoverable with `restore`, see Trash" }),
            )
        }
        "duplicate" => {
            let id = args.require_entity(conn, 0, "id")?;
            let data = schema::duplicate(conn, &id)?;
            let new_id = extract_id(&data)?;
            enrich(conn, entity_type, &new_id, data)
        }
        "convert" => {
            let id = args.require_entity(conn, 0, "id")?;
            let to = args.require_flag("to")?;
            args.check_revision(&(def.get)(conn, &id)?)?;
            schema::convert(conn, &id, &to)?;
            let target = schema::lookup(&to).ok_or_else(|| unknown_entity_type(&to))?;
            let data = (target.get)(conn, &id)?;
            enrich(conn, &to, &id, data)
        }
        "restore" => {
            let id = args.require_entity(conn, 0, "id")?;
            crate::db::entities::restore_entity(conn, &id)?;
            let data = (def.get)(conn, &id)?;
            enrich(conn, entity_type, &id, data)
        }
        "blocks" | "grep" | "add-block" | "update-block" | "delete-block" | "reorder-blocks" => {
            if !def.supports_blocks {
                return Err(AppError::InvalidInput(format!(
                    "'{entity_type}' has no block content — block commands only apply to types where \
                     `describe {entity_type}` reports supportsBlocks: true"
                )));
            }
            block_command(conn, def, verb, args)
        }
        other => {
            if let Some(bulk) = schema::bulk_actions(entity_type)
                .into_iter()
                .find(|a| a.name == other)
            {
                let space_id = args.flag("space");
                return (bulk.run)(conn, space_id.as_deref());
            }
            if let Some(result) = child_command(conn, def, other, args) {
                return result;
            }
            let child_verbs: Vec<String> = schema::child_collections(entity_type)
                .iter()
                .flat_map(|c| {
                    let one = c.singular;
                    [c.plural.to_string()].into_iter().chain(
                        ["get", "add", "update", "delete", "restore"]
                            .into_iter()
                            .chain(c.actions.iter().map(|a| a.name))
                            .map(move |verb| format!("{verb}-{one}")),
                    )
                })
                .collect();
            let bulk_verbs: Vec<&str> = schema::bulk_actions(entity_type)
                .iter()
                .map(|a| a.name)
                .collect();
            let extra = [child_verbs.join(", "), bulk_verbs.join(", ")]
                .into_iter()
                .filter(|s| !s.is_empty())
                .map(|s| format!(", {s}"))
                .collect::<String>();
            Err(AppError::InvalidInput(format!(
                "unknown verb '{other}' for entity type '{entity_type}'. Expected one of: list, get, create, \
                 update, duplicate, delete, restore, blocks, grep, add-block, update-block, delete-block, \
                 reorder-blocks{extra}"
            )))
        }
    })
}

/// Unknown and missing fields against a child collection's or action's own list.
fn validate_child_fields(
    what: &str,
    known: &[schema::FieldDef],
    fields: &JsonMap,
    for_create: bool,
) -> AppResult<()> {
    for key in fields.keys() {
        let Some(f) = known.iter().find(|f| f.name == key) else {
            let names: Vec<&str> = known.iter().map(|f| f.name).collect();
            return Err(AppError::InvalidInput(format!(
                "unknown field '{key}' for {what}. Known fields: {}",
                names.join(", ")
            )));
        };
        if !for_create && !f.writable_on_update {
            return Err(AppError::InvalidInput(format!(
                "field '{key}' on {what} can only be set at creation, not updated"
            )));
        }
    }
    if for_create {
        if let Some(f) = known
            .iter()
            .find(|f| f.required_on_create && !fields.contains_key(f.name))
        {
            return Err(AppError::InvalidInput(format!(
                "--field {}=<value> is required for {what}",
                f.name
            )));
        }
    }
    Ok(())
}

/// The verbs of a registered `ChildCollectionDef` (a Deck's cards): `None` when
/// `verb` names none of them, so the caller reports an unknown verb.
fn child_command(
    conn: &Connection,
    def: &schema::EntitySchemaDef,
    verb: &str,
    args: &Args,
) -> Option<AppResult<Value>> {
    let entity_type = def.entity_type;
    let collections = schema::child_collections(entity_type);
    if let Some(c) = collections.iter().find(|c| c.plural == verb) {
        return Some((|| {
            let id = args.require_entity(conn, 0, "id")?;
            (def.get)(conn, &id)?;
            let items = (c.list)(conn, &id, args.has_bool("include-deleted"))?;
            let key = crate::db::entities::entity_key(conn, &id)?;
            Ok(json!({ "parentId": id, "parentKey": key, "count": items.len(), "items": items }))
        })());
    }
    let (action, singular) = verb.rsplit_once('-')?;
    let c = collections.iter().find(|c| c.singular == singular)?;
    let what = format!("a {entity_type} {singular}");
    Some((|| match action {
        "add" => {
            let id = args.require_entity(conn, 0, "id")?;
            (def.get)(conn, &id)?;
            validate_child_fields(&what, c.fields, &args.fields, true)?;
            (c.create)(conn, &id, &args.fields)
        }
        "get" => (c.get)(
            conn,
            &args.require_positional(0, &format!("{singular}-id"))?,
        ),
        "update" => {
            let record_id = args.require_positional(0, &format!("{singular}-id"))?;
            validate_child_fields(&what, c.fields, &args.fields, false)?;
            let before = (c.get)(conn, &record_id)?;
            let after = (c.update)(conn, &record_id, &args.fields)?;
            let changes = view::diff_values(&before, &after);
            Ok(json!({ singular: after, "changes": changes }))
        }
        "delete" => {
            let record_id = args.require_positional(0, &format!("{singular}-id"))?;
            args.require_yes()?;
            (c.delete)(conn, &record_id)?;
            Ok(json!({
                "deleted": record_id,
                "note": format!("soft delete only — recoverable with `restore-{singular}`"),
            }))
        }
        "restore" => {
            let record_id = args.require_positional(0, &format!("{singular}-id"))?;
            (c.restore)(conn, &record_id)?;
            (c.get)(conn, &record_id)
        }
        other => {
            let a = c.actions.iter().find(|a| a.name == other).ok_or_else(|| {
                AppError::InvalidInput(format!(
                    "unknown verb '{verb}' for entity type '{entity_type}'"
                ))
            })?;
            let record_id = args.require_positional(0, &format!("{singular}-id"))?;
            validate_child_fields(&format!("{other}-{singular}"), a.fields, &args.fields, true)?;
            (a.run)(conn, &record_id, &args.fields)
        }
    })())
}

/// Attaches each item's labels in place, the same full `Label` shape `get`'s
/// `enrich` already returns for one entity — one round trip per distinct Space
/// (`labels::list_entity_label_ids` + `list_labels`), not one per row, so it
/// stays cheap across a large list. Backs both `--fields labels` and `--label`
/// on `list`, so neither needs its own per-row label query.
fn attach_labels(conn: &Connection, items: &mut [Value]) -> AppResult<()> {
    let mut ids_by_space: HashMap<String, HashMap<String, Vec<String>>> = HashMap::new();
    let mut labels_by_space: HashMap<String, HashMap<String, Value>> = HashMap::new();
    for item in items.iter_mut() {
        let Some(space_id) = view::lookup(item, "spaceId")
            .and_then(Value::as_str)
            .map(str::to_string)
        else {
            continue;
        };
        let id = extract_id(item)?;
        if !ids_by_space.contains_key(&space_id) {
            let fetched = crate::db::labels::list_entity_label_ids(conn, &space_id)?;
            ids_by_space.insert(space_id.clone(), fetched);
        }
        if !labels_by_space.contains_key(&space_id) {
            let fetched: HashMap<String, Value> = crate::db::labels::list_labels(conn, &space_id)?
                .into_iter()
                .map(|l| {
                    (
                        l.id.clone(),
                        serde_json::to_value(&l).expect("Label always serializes"),
                    )
                })
                .collect();
            labels_by_space.insert(space_id.clone(), fetched);
        }
        let label_ids = ids_by_space[&space_id]
            .get(&id)
            .cloned()
            .unwrap_or_default();
        let labels: Vec<Value> = label_ids
            .iter()
            .filter_map(|label_id| labels_by_space[&space_id].get(label_id).cloned())
            .collect();
        item["labels"] = json!(labels);
    }
    Ok(())
}

/// `list` with the read side options every type gets: `--since` (recently changed,
/// newest first), `--label` (AND match by name, needs `--space`), `--fields`
/// projection, and for block pages a size hint per row so an agent can tell what
/// a `get` would cost before making it.
fn list_entities(
    conn: &Connection,
    def: &schema::EntitySchemaDef,
    args: &Args,
) -> AppResult<Value> {
    let mut items = (def.list)(
        conn,
        args.flag("space").as_deref(),
        args.has_bool("include-deleted"),
    )?;
    if def.supports_blocks {
        for item in &mut items {
            let id = extract_id(item)?;
            let blocks = crate::db::notes::list_blocks(conn, &id)?;
            let body = crate::db::notes::render_page_markdown(conn, &id)?;
            // Block edits don't touch the entity's own `updatedAt` (same rule as the
            // Notes list's "last edited"), so recency has to look at the blocks too.
            let last_edited = blocks
                .iter()
                .map(|b| b.updated_at.as_str())
                .chain(view::lookup(item, "updatedAt").and_then(Value::as_str))
                .filter_map(|ts| view::parse_timestamp(ts).map(|parsed| (parsed, ts.to_string())))
                .max_by_key(|(parsed, _)| *parsed)
                .map(|(_, raw)| raw);
            item["lastEditedAt"] = json!(last_edited);
            item["blockCount"] = json!(blocks.len());
            item["bodySize"] = view::size_hint(body.len());
        }
    }
    let label_filter = args.flag("label");
    let fields = args.field_list();
    let wants_labels = label_filter.is_some()
        || fields
            .as_deref()
            .is_some_and(|f| f.iter().any(|n| n == "labels"));
    if wants_labels {
        attach_labels(conn, &mut items)?;
    }
    if let Some(raw) = label_filter {
        let space_id = args.flag("space").ok_or_else(|| {
            AppError::InvalidInput(
                "--label requires --space — labels are siloed per Space (§ entity model), so a \
                 name can't be resolved without knowing which Space's labels to search"
                    .into(),
            )
        })?;
        let wanted: Vec<String> = raw
            .split(',')
            .map(str::trim)
            .filter(|n| !n.is_empty())
            .map(str::to_string)
            .collect();
        if wanted.is_empty() {
            return Err(AppError::InvalidInput(
                "--label expects at least one name, comma separated".into(),
            ));
        }
        let available = crate::db::labels::list_labels(conn, &space_id)?;
        let mut wanted_ids = Vec::with_capacity(wanted.len());
        for name in &wanted {
            let label = available
                .iter()
                .find(|l| l.name.eq_ignore_ascii_case(name))
                .ok_or_else(|| {
                    AppError::InvalidInput(format!(
                        "no label named '{name}' in space {space_id} — see `nookly cli label list \
                         --space {space_id}`"
                    ))
                })?;
            wanted_ids.push(label.id.clone());
        }
        items.retain(|item| {
            let have: Vec<&str> = view::lookup(item, "labels")
                .and_then(Value::as_array)
                .map(|labels| {
                    labels
                        .iter()
                        .filter_map(|l| l.get("id").and_then(Value::as_str))
                        .collect()
                })
                .unwrap_or_default();
            wanted_ids.iter().all(|w| have.contains(&w.as_str()))
        });
    }
    if let Some(since) = args.flag("since") {
        let since = view::parse_since(&since)?;
        let changed_at = |item: &Value| {
            view::lookup(item, "lastEditedAt")
                .or_else(|| view::lookup(item, "updatedAt"))
                .and_then(Value::as_str)
                .and_then(view::parse_timestamp)
        };
        items.retain(|item| changed_at(item).is_some_and(|ts| ts >= since));
        items.sort_by_key(|item| std::cmp::Reverse(changed_at(item)));
    }
    let total = items.len();
    let limit = args.usize_flag("limit")?.unwrap_or(total);
    let items: Vec<Value> = items
        .into_iter()
        .take(limit)
        .map(|item| match &fields {
            Some(fields) => view::project(&item, fields),
            None => item,
        })
        .collect();
    Ok(
        json!({ "entityType": def.entity_type, "count": total, "returned": items.len(), "items": items }),
    )
}

/// One entity for `get`: the enriched payload plus its `revision` and `size`, then
/// shaped by `--fields` (projection) or `--summary` (long strings cut to excerpts,
/// plus a heading outline for block pages).
fn get_entity(
    conn: &Connection,
    def: &schema::EntitySchemaDef,
    id: &str,
    args: &Args,
) -> AppResult<Value> {
    let data = (def.get)(conn, id)?;
    let revision = view::revision(&data);
    let size = view::size_hint(view::serialized_len(&data));
    let mut result = enrich(conn, def.entity_type, id, data)?;
    result["revision"] = json!(revision);
    result["size"] = size;

    if let Some(fields) = args.field_list() {
        return Ok(json!({
            "entityType": def.entity_type,
            "revision": revision,
            "data": view::project(&result, &fields),
        }));
    }
    if args.has_bool("summary") {
        let truncated = view::summarize(&mut result["data"], view::SUMMARY_CHARS);
        result["truncated"] = Value::Object(truncated);
        if def.supports_blocks {
            let blocks = crate::db::notes::list_blocks(conn, id)?;
            result["blockCount"] = json!(blocks.len());
            result["outline"] = json!(view::outline(&blocks));
        }
    }
    Ok(result)
}

/// Block-level editing (§2.1: Notes/Jots are "block-level
/// addressable" pages) for any entity type that opts in via
/// `EntitySchemaDef::supports_blocks` — currently `note`/`jot`,
/// `task`/`sub_task` (a task's description), `assignment` and `exam`,
/// but generic: a future page-like module gets these commands for free.
/// Blocks aren't entities themselves (no base entity fields — same reasoning
/// as Index Cards, see `db::decks`), so they live outside the `<entity-type>
/// list/get/create/update/delete` pattern as their own small set of verbs.
fn block_command(
    conn: &Connection,
    def: &schema::EntitySchemaDef,
    verb: &str,
    args: &Args,
) -> AppResult<Value> {
    let entity_type = def.entity_type;
    fn require_page(conn: &Connection, entity_type: &str, id: &str) -> AppResult<()> {
        let entity = crate::db::entities::get_entity(conn, id)?;
        if entity.entity_type != entity_type {
            return Err(AppError::InvalidInput(format!(
                "{id} is a '{}', not a '{entity_type}'",
                entity.entity_type
            )));
        }
        Ok(())
    }

    match verb {
        "blocks" => {
            let id = args.require_entity(conn, 0, "id")?;
            require_page(conn, entity_type, &id)?;
            let blocks = crate::db::notes::list_blocks(conn, &id)?;
            let page_key = crate::db::entities::entity_key(conn, &id)?;
            let total = blocks.len();
            let offset = args.usize_flag("offset")?.unwrap_or(0);
            let limit = args.usize_flag("limit")?.unwrap_or(total);
            let items: Vec<_> = view::blocks_json(&blocks)
                .into_iter()
                .skip(offset)
                .take(limit)
                .collect();
            Ok(json!({
                "pageId": id,
                "pageKey": page_key,
                "count": total,
                "offset": offset,
                "returned": items.len(),
                "items": items,
            }))
        }
        "grep" => {
            let id = args.require_entity(conn, 0, "id")?;
            require_page(conn, entity_type, &id)?;
            let pattern = args.require_positional(1, "pattern")?;
            let re = view::build_pattern(
                &pattern,
                args.has_bool("regex"),
                args.has_bool("case-sensitive"),
            )?;
            let context = args.usize_flag("context")?.unwrap_or(0).min(20);
            let max = args.usize_flag("max")?.unwrap_or(50);
            let blocks = crate::db::notes::list_blocks(conn, &id)?;
            let found = view::grep_blocks(&blocks, &re, context, max);
            let page_key = crate::db::entities::entity_key(conn, &id)?;
            Ok(json!({
                "pageId": id,
                "pageKey": page_key,
                "pattern": pattern,
                "count": found.total,
                "returned": found.items.len(),
                "blockCount": blocks.len(),
                "items": found.items,
            }))
        }
        "add-block" => {
            let id = args.require_entity(conn, 0, "id")?;
            require_page(conn, entity_type, &id)?;
            args.check_revision(&(def.get)(conn, &id)?)?;
            let block_type = args.require_flag("type")?;
            let content = args.require_flag("content")?;
            let position = args.flag("position").and_then(|v| v.parse::<i64>().ok());
            // `--language`/`--filename` only mean anything on a `code` block (the
            // markdown editor's code block header row) — harmless no-ops on any other type.
            let language = args.flag("language");
            let filename = args.flag("filename");
            let submitted_content = content.clone();
            let block = crate::db::notes::create_block_with_attrs(
                conn,
                &id,
                block_type,
                content,
                position,
                language,
                filename,
                args.attrs()?,
            )?;
            let page_key = crate::db::entities::entity_key(conn, &id)?;
            let mut result = json!({ "pageId": id, "pageKey": page_key, "block": block.clone() });
            if let Some(warning) = paragraph_mistake_warning(conn, entity_type, &id, &block)? {
                result["warning"] = json!(warning);
            }
            if let Some(warning) = table_normalize_warning(&block, &submitted_content) {
                result["warning"] = json!(warning);
            }
            if let Some(warning) = list_mistake_warning(conn, entity_type, &block)? {
                result["warning"] = json!(warning);
            }
            Ok(result)
        }
        "update-block" => {
            let block_id = args.require_positional(0, "block-id")?;
            let before = crate::db::notes::get_block(conn, &block_id)?;
            args.check_revision(&(def.get)(conn, &before.entity_id)?)?;
            let submitted_content = args.flag("content");
            let patch = crate::db::notes::BlockPatch {
                content: submitted_content.clone(),
                block_type: args.flag("type"),
                language: args.flag("language"),
                filename: args.flag("filename"),
                attrs: Some(args.attrs()?),
            };
            let block = crate::db::notes::update_block(conn, &block_id, patch)?;
            let changes = view::diff_values(&json!(before), &json!(block));
            let mut result = json!({ "block": block.clone(), "changes": changes });
            if let Some(submitted) = &submitted_content {
                if let Some(warning) = table_normalize_warning(&block, submitted) {
                    result["warning"] = json!(warning);
                }
            }
            let page_id = block.entity_id.clone();
            if let Some(warning) = paragraph_mistake_warning(conn, entity_type, &page_id, &block)? {
                result["warning"] = json!(warning);
            }
            if let Some(warning) = list_mistake_warning(conn, entity_type, &block)? {
                result["warning"] = json!(warning);
            }
            Ok(result)
        }
        "delete-block" => {
            let block_id = args.require_positional(0, "block-id")?;
            args.require_yes()?;
            let block = crate::db::notes::get_block(conn, &block_id)?;
            args.check_revision(&(def.get)(conn, &block.entity_id)?)?;
            crate::db::notes::delete_block(conn, &block_id)?;
            Ok(json!({ "deleted": block_id, "block": block }))
        }
        "reorder-blocks" => {
            let id = args.require_entity(conn, 0, "id")?;
            require_page(conn, entity_type, &id)?;
            args.check_revision(&(def.get)(conn, &id)?)?;
            let ordered_ids: Vec<String> = args.positional[1..].to_vec();
            if ordered_ids.is_empty() {
                return Err(AppError::InvalidInput(
                    "reorder-blocks needs the new order: nookly cli <type> reorder-blocks <id> <block-id> <block-id> ..."
                        .into(),
                ));
            }
            crate::db::notes::reorder_blocks(conn, &id, ordered_ids)?;
            let blocks = crate::db::notes::list_blocks(conn, &id)?;
            let page_key = crate::db::entities::entity_key(conn, &id)?;
            Ok(
                json!({ "pageId": id, "pageKey": page_key, "count": blocks.len(), "items": view::blocks_json(&blocks) }),
            )
        }
        _ => unreachable!("dispatch guarantees verb is one of the block commands"),
    }
}

/// Nudges an agent that just landed a `paragraph` block whose content still
/// looks like an unsplit markdown document — the recurring mistake this
/// exists to catch: `add-block`/`update-block` store `content` verbatim, with
/// no parsing, so `#`/`- `/`` ``` `` etc. inside a `paragraph` render as
/// literal text, not real headings/lists/code. There is no `--field body=...`
/// shortcut that parses structure for you (removed deliberately — it let
/// agents skip learning `add-block`/`update-block`, e.g. a `code` block made
/// this way had no way to get a `--language`/`--filename` header); the fix is
/// always one add-block/update-block call per element.
/// Never blocks the write; only attaches an advisory `warning` to the JSON
/// result. Silent when the page has no *other* blocks yet, since a single
/// plain-text paragraph page is a normal, intentional shape.
/// Flags when `db::notes::normalize_table_content` (called unconditionally inside
/// `create_block`/`update_block` for any `table` block) actually rewrote what was submitted —
/// i.e. the caller typed a markdown pipe table (`| a | b |` rows) instead of this app's real
/// tab-delimited format, and got a silent auto-correction instead of an error. Purely advisory,
/// same as `paragraph_mistake_warning`: the write already succeeded either way.
fn table_normalize_warning(
    block: &crate::db::notes::Block,
    submitted_content: &str,
) -> Option<String> {
    if block.block_type != "table" || block.content == submitted_content {
        return None;
    }
    Some(
        "content looked like a markdown pipe table ('| a | b |' rows, optionally with a \
         '|---|---|' separator) and was auto-converted to this app's real table format: rows \
         separated by '\\n', cells within a row separated by a literal tab character, first row \
         the header, no separator row. Verify with `blocks <id>` or `get <id>` — if this wasn't \
         intended, resubmit with real tabs between cells."
            .to_string(),
    )
}

/// A list block holds the whole list, one item per line, and the editor numbers items
/// within that one block. Flags the two ways an agent gets this wrong: one block per
/// item (so every numbered item renders as its own "1."), and typing the `1. `/`- `
/// markers into the content (rendered on top of the real ones). Advisory only.
fn list_mistake_warning(
    conn: &Connection,
    entity_type: &str,
    block: &crate::db::notes::Block,
) -> AppResult<Option<String>> {
    let marker = match block.block_type.as_str() {
        "numbered_list" => regex::Regex::new(r"^\s*\d+[.)]\s").expect("valid regex"),
        "bulleted_list" => regex::Regex::new(r"^\s*[-*+]\s").expect("valid regex"),
        _ => return Ok(None),
    };
    let blocks = crate::db::notes::list_blocks(conn, &block.entity_id)?;
    let index = blocks.iter().position(|b| b.id == block.id);
    let neighbour = index.and_then(|i| {
        [i.checked_sub(1), Some(i + 1)]
            .into_iter()
            .flatten()
            .filter_map(|j| blocks.get(j))
            .find(|b| b.block_type == block.block_type)
    });
    if let Some(neighbour) = neighbour {
        return Ok(Some(format!(
            "This '{kind}' block sits right next to another '{kind}' block ({other}). A list block \
             holds the WHOLE list, one item per line in --content, and items are numbered within \
             that one block; two adjacent list blocks render as two separate lists (a numbered \
             list restarts at 1). Merge them: `nookly cli {entity_type} update-block {other} \
             --content <all items joined by newlines>`, then `delete-block {this} --yes`.",
            kind = block.block_type,
            other = neighbour.id,
            this = block.id,
        )));
    }
    if block.content.lines().any(|line| marker.is_match(line)) {
        return Ok(Some(format!(
            "Some lines of this '{}' block start with a list marker ('1. ', '- ', ...). The editor \
             adds markers itself, so these render twice. Pass the bare item text, one item per line.",
            block.block_type
        )));
    }
    Ok(None)
}

fn paragraph_mistake_warning(
    conn: &Connection,
    entity_type: &str,
    page_id: &str,
    block: &crate::db::notes::Block,
) -> AppResult<Option<String>> {
    if block.block_type != "paragraph" || !looks_like_unsplit_markdown(&block.content) {
        return Ok(None);
    }
    let total = crate::db::notes::list_blocks(conn, page_id)?.len();
    if total <= 1 {
        return Ok(None);
    }
    Ok(Some(format!(
        "This page has {total} blocks, and this paragraph's content still looks like a whole \
         unsplit markdown document (headings, lists, quotes, code fences, or several blank-line- \
         separated paragraphs). A 'paragraph' block renders its content as literal text — '#', \
         '- ', '> ', and ``` fences will NOT become real headings/lists/quotes/code. Issue one \
         add-block/update-block call per element instead, with the matching --type (run \
         `nookly cli describe {entity_type}` for knownBlockTypes) — for a 'code' block, also set \
         --language/--filename for the editor's syntax-highlighted header."
    )))
}

/// A rough, deliberately over-inclusive heuristic (false positives just mean
/// an unnecessary warning, never a blocked write): any line that opens with a
/// heading/list/quote/fence marker, a blank-line paragraph break, or content
/// long enough that a human almost certainly meant more than one block.
fn looks_like_unsplit_markdown(content: &str) -> bool {
    let has_structural_line = content.lines().any(|line| {
        let t = line.trim_start();
        t.starts_with("# ")
            || t.starts_with("## ")
            || t.starts_with("### ")
            || t.starts_with("> ")
            || t.starts_with("- ")
            || t.starts_with("* ")
            || t.starts_with("```")
    });
    has_structural_line || content.contains("\n\n") || content.len() > 500
}

fn extract_id(data: &Value) -> AppResult<String> {
    // Every registered `get`/`create` shape nests the base entity either
    // directly (id at the top) or under `entity` (subtype structs) or
    // `entity.id` (page types wrap it as `{entity, body}`).
    schema::payload_id(data)
        .ok_or_else(|| AppError::Db("internal: could not locate id in create/get result".into()))
}

/// Wraps a `get`/`create`/`update` payload with its relationships, labels and
/// backlinks (the right sidebar's "Mentioned in", § philosophy), so an agent gets full
/// context on an entity in one call instead of chasing it down separately.
fn enrich(conn: &Connection, entity_type: &str, id: &str, data: Value) -> AppResult<Value> {
    let relationships = crate::db::relationships::list_relationships(
        conn,
        id,
        crate::db::relationships::Direction::Both,
    )?;
    let labels = crate::db::labels::list_labels_for_entity(conn, id)?;
    let mentioned_in: Vec<Value> = crate::db::notes::list_mentioning_entities(conn, id)?
        .into_iter()
        .map(|e| json!({ "id": e.id, "key": e.key, "type": e.entity_type, "title": e.title }))
        .collect();
    let relationships = relationships
        .into_iter()
        .map(|r| relationship_json(conn, r))
        .collect::<AppResult<Vec<_>>>()?;
    Ok(json!({
        "entityType": entity_type,
        "data": data,
        "relationships": relationships,
        "labels": labels,
        "mentionedIn": mentioned_in,
    }))
}

/// Runs `f` all or nothing: on any error every write it made is rolled back.
fn atomically<T>(conn: &Connection, f: impl FnOnce() -> AppResult<T>) -> AppResult<T> {
    conn.execute_batch("SAVEPOINT cli_batch")?;
    match f() {
        Ok(value) => {
            conn.execute_batch("RELEASE cli_batch")?;
            Ok(value)
        }
        Err(e) => {
            conn.execute_batch("ROLLBACK TO cli_batch; RELEASE cli_batch")?;
            Err(e)
        }
    }
}

/// `relate <from> <type> <to> [<to> ...]`: one call, many targets, all or nothing.
/// A single target keeps the single relationship response shape.
fn relate(conn: &Connection, args: &Args) -> AppResult<Value> {
    let from_id = args.require_entity(conn, 0, "from-id")?;
    let relationship_type = args.require_positional(1, "relationship-type")?;
    let to_ids = args.entities_from(conn, 2, "to-id")?;
    args.require_yes()?;
    let created = atomically(conn, || {
        to_ids
            .iter()
            .map(|to_id| {
                let rel = crate::db::relationships::create_relationship(
                    conn,
                    from_id.clone(),
                    to_id.clone(),
                    relationship_type.clone(),
                    None,
                    None,
                )?;
                relationship_json(conn, rel)
            })
            .collect::<AppResult<Vec<_>>>()
    })?;
    if created.len() == 1 {
        return Ok(created.into_iter().next().expect("one item"));
    }
    Ok(json!({ "count": created.len(), "items": created }))
}

/// A relationship with both ends' keys next to their ids.
fn relationship_json(
    conn: &Connection,
    rel: crate::db::relationships::Relationship,
) -> AppResult<Value> {
    let from_key = crate::db::entities::entity_key(conn, &rel.from_entity_id)?;
    let to_key = crate::db::entities::entity_key(conn, &rel.to_entity_id)?;
    let mut value = serde_json::to_value(rel).expect("Relationship always serializes");
    value["fromEntityKey"] = json!(from_key);
    value["toEntityKey"] = json!(to_key);
    Ok(value)
}

fn unrelate(conn: &Connection, args: &Args) -> AppResult<Value> {
    let id = args.require_positional(0, "relationship-id")?;
    args.require_yes()?;
    crate::db::relationships::delete_relationship(conn, &id)?;
    Ok(json!({ "deleted": id }))
}

fn space_command(conn: &Connection, argv: &[String]) -> AppResult<Value> {
    let Some(verb) = argv.first() else {
        return Ok(json!({
            "list": "nookly cli space list",
            "create": "nookly cli space create --name <name> [--icon <icon>] --color <hex>",
            "update": "nookly cli space update <id> [--name <n>] [--icon <i>] [--color <hex>]",
            "delete": "nookly cli space delete <id> --yes  (PERMANENT — Spaces have no Trash; deletes every entity inside)",
            "reorder": "nookly cli space reorder <id> <id> ...  (every Space id, in its new sidebar order)",
        }));
    };
    run_command(&argv[1..], |args| {
        match verb.as_str() {
        "list" => {
            let spaces = crate::db::spaces::list_spaces(conn)?;
            Ok(json!({ "count": spaces.len(), "items": spaces }))
        }
        "create" => {
            let name = args.require_flag("name")?;
            let icon = args.flag("icon");
            let color = args.require_flag("color")?;
            let space = crate::db::spaces::create_space(conn, name, icon, color)?;
            Ok(serde_json::to_value(space).expect("Space always serializes"))
        }
        "update" => {
            let id = args.require_positional(0, "id")?;
            let patch = crate::db::spaces::SpacePatch {
                name: args.flag("name"),
                icon: args.flag("icon"),
                color: args.flag("color"),
            };
            let space = crate::db::spaces::update_space(conn, &id, patch)?;
            Ok(serde_json::to_value(space).expect("Space always serializes"))
        }
        "delete" => {
            let id = args.require_positional(0, "id")?;
            args.require_yes()?;
            crate::db::spaces::delete_space(conn, &id)?;
            Ok(json!({ "deleted": id, "note": "permanent — Spaces have no Trash" }))
        }
        "reorder" => {
            if args.positional.is_empty() {
                return Err(AppError::InvalidInput(
                    "reorder requires at least one Space id".into(),
                ));
            }
            crate::db::spaces::reorder_spaces(conn, args.positional.clone())?;
            let spaces = crate::db::spaces::list_spaces(conn)?;
            Ok(json!({ "count": spaces.len(), "items": spaces }))
        }
        other => Err(AppError::InvalidInput(format!(
            "unknown space command '{other}'. Expected one of: list, create, update, delete, reorder"
        ))),
    }
    })
}

fn label_command(conn: &Connection, argv: &[String]) -> AppResult<Value> {
    let Some(verb) = argv.first() else {
        return Ok(json!({
            "list": "nookly cli label list --space <id>",
            "create": "nookly cli label create --space <id> --name <name> --color <hex>",
            "update": "nookly cli label update <id> [--name <name>] [--color <hex>]",
            "delete": "nookly cli label delete <id> --yes",
            "attach": "nookly cli label attach <entity-id> <label-id> [<label-id> ...]",
            "detach": "nookly cli label detach <entity-id> <label-id> [<label-id> ...]",
            "get": "nookly cli label get <id> [--include-deleted]  (every entity carrying this label, the \
                    reverse of `get`'s own `labels`; across every entity type and Space, though a label is only \
                    ever attached within its own Space in practice)",
            "note": "Labels are space-siloed (§ entity model) — the same name in two Spaces is two separate labels.",
        }));
    };
    run_command(&argv[1..], |args| {
        match verb.as_str() {
        "list" => {
            let space_id = args.require_flag("space")?;
            let labels = crate::db::labels::list_labels(conn, &space_id)?;
            Ok(json!({ "count": labels.len(), "items": labels }))
        }
        "get" => {
            let id = args.require_positional(0, "id")?;
            let entities =
                crate::db::labels::list_entities_for_label(conn, &id, args.has_bool("include-deleted"))?;
            let items: Vec<Value> = entities
                .iter()
                .map(|e| {
                    json!({
                        "id": e.id, "key": e.key, "type": e.entity_type,
                        "spaceId": e.space_id, "title": e.title,
                    })
                })
                .collect();
            Ok(json!({ "labelId": id, "count": items.len(), "items": items }))
        }
        "create" => {
            let space_id = args.require_flag("space")?;
            let name = args.require_flag("name")?;
            let color = args.require_flag("color")?;
            let label = crate::db::labels::create_label(conn, space_id, name, color)?;
            Ok(serde_json::to_value(label).expect("Label always serializes"))
        }
        "update" => {
            let id = args.require_positional(0, "id")?;
            let label = crate::db::labels::update_label(
                conn,
                &id,
                args.flag("name"),
                args.flag("color"),
            )?;
            Ok(serde_json::to_value(label).expect("Label always serializes"))
        }
        "delete" => {
            let id = args.require_positional(0, "id")?;
            args.require_yes()?;
            crate::db::labels::delete_label(conn, &id)?;
            Ok(json!({ "deleted": id }))
        }
        "attach" => {
            let entity_id = args.require_entity(conn, 0, "entity-id")?;
            args.require_positional(1, "label-id")?;
            let label_ids = &args.positional[1..];
            atomically(conn, || {
                label_ids.iter().try_for_each(|label_id| {
                    crate::db::labels::attach_label(conn, &entity_id, label_id)
                })
            })?;
            let key = crate::db::entities::entity_key(conn, &entity_id)?;
            Ok(json!({ "attached": label_ids, "to": entity_id, "toKey": key }))
        }
        "detach" => {
            let entity_id = args.require_entity(conn, 0, "entity-id")?;
            args.require_positional(1, "label-id")?;
            let label_ids = &args.positional[1..];
            atomically(conn, || {
                label_ids.iter().try_for_each(|label_id| {
                    crate::db::labels::detach_label(conn, &entity_id, label_id)
                })
            })?;
            let key = crate::db::entities::entity_key(conn, &entity_id)?;
            Ok(json!({ "detached": label_ids, "from": entity_id, "fromKey": key }))
        }
        other => Err(AppError::InvalidInput(format!(
            "unknown label command '{other}'. Expected one of: list, get, create, update, delete, attach, detach"
        ))),
    }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(conn: &Connection, line: &str) -> AppResult<Value> {
        dispatch(conn, line.split_whitespace().map(str::to_string).collect())
    }

    #[test]
    fn child_collection_verbs_manage_deck_cards() {
        let dir = std::env::temp_dir().join(format!("nookly-cli-test-{}", crate::db::new_id()));
        let conn = crate::db::connect(&dir).unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
        let course =
            crate::db::courses::create_course(&conn, space.id.clone(), "Algorithms".into())
                .unwrap();
        let exam = crate::db::exams::create_exam(
            &conn,
            space.id.clone(),
            "Midterm".into(),
            course.id,
            None,
            None,
        )
        .unwrap();
        let deck = crate::db::decks::create_deck(
            &conn,
            space.id.clone(),
            "Deck".into(),
            Some(exam.entity.id.clone()),
        )
        .unwrap();

        let described = run(&conn, "describe index_card_deck").unwrap();
        assert_eq!(described["childCollections"][0]["name"], "cards");

        let card = run(
            &conn,
            &format!(
                "index_card_deck add-card {} --field front=Q --field back=A",
                deck.id
            ),
        )
        .unwrap();
        let card_id = card["id"].as_str().unwrap().to_string();
        assert!(run(
            &conn,
            &format!("index_card_deck add-card {} --field front=Q", deck.id)
        )
        .is_err());

        let updated = run(
            &conn,
            &format!("index_card_deck update-card {card_id} --field back=B"),
        )
        .unwrap();
        assert_eq!(updated["card"]["back"], "B");

        let reviewed = run(
            &conn,
            &format!("index_card_deck review-card {card_id} --field rating=good"),
        )
        .unwrap();
        assert_eq!(reviewed["reps"], 1);
        let undone = run(
            &conn,
            &format!("index_card_deck undo-review-card {card_id}"),
        )
        .unwrap();
        assert_eq!(undone["reps"], 0);

        assert!(run(&conn, &format!("index_card_deck delete-card {card_id}")).is_err());
        run(
            &conn,
            &format!("index_card_deck delete-card {card_id} --yes"),
        )
        .unwrap();
        let listed = run(&conn, &format!("index_card_deck cards {}", deck.key)).unwrap();
        assert_eq!(listed["count"], 0);
        run(&conn, &format!("index_card_deck restore-card {card_id}")).unwrap();

        let copy = run(&conn, &format!("index_card_deck duplicate {}", deck.id)).unwrap();
        assert_eq!(copy["data"]["stats"]["total"], 1);
        assert!(run(&conn, &format!("index_card_deck frobnicate-card {card_id}")).is_err());

        // A deck stands alone, and can be filed under an Exam later or unfiled.
        let loose = run(
            &conn,
            &format!("index_card_deck create --space {} --title Vocab", space.id),
        )
        .unwrap();
        assert!(loose["data"]["examId"].is_null());
        let loose_id = loose["data"]["id"].as_str().unwrap().to_string();
        let filed = run(
            &conn,
            &format!(
                "index_card_deck update {loose_id} --field examId={}",
                exam.entity.key
            ),
        )
        .unwrap();
        assert_eq!(filed["data"]["examId"], exam.entity.id.as_str());
        let unfiled = run(
            &conn,
            &format!("index_card_deck update {loose_id} --field examId="),
        )
        .unwrap();
        assert!(unfiled["data"]["examId"].is_null());
        drop(conn);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn list_filters_by_label_and_rejects_unknown_flags() {
        let dir = std::env::temp_dir().join(format!("nookly-cli-test-{}", crate::db::new_id()));
        let conn = crate::db::connect(&dir).unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let huk =
            crate::db::labels::create_label(&conn, space.id.clone(), "HUK".into(), "#f00".into())
                .unwrap();
        let insurance = crate::db::labels::create_label(
            &conn,
            space.id.clone(),
            "Insurance".into(),
            "#0f0".into(),
        )
        .unwrap();

        let both = run(
            &conn,
            &format!("task create --space {} --title Both", space.id),
        )
        .unwrap();
        let both_id = both["data"]["entity"]["id"].as_str().unwrap().to_string();
        let only_huk = run(
            &conn,
            &format!("task create --space {} --title OnlyHuk", space.id),
        )
        .unwrap();
        let only_huk_id = only_huk["data"]["entity"]["id"]
            .as_str()
            .unwrap()
            .to_string();
        let _neither = run(
            &conn,
            &format!("task create --space {} --title Neither", space.id),
        )
        .unwrap();

        run(
            &conn,
            &format!("label attach {both_id} {} {}", huk.id, insurance.id),
        )
        .unwrap();
        run(&conn, &format!("label attach {only_huk_id} {}", huk.id)).unwrap();

        // A typo'd flag (`--labels` for `--label`) used to parse fine and silently do
        // nothing; it must now be rejected instead.
        let err = run(
            &conn,
            &format!("task list --space {} --labels HUK", space.id),
        )
        .unwrap_err()
        .to_string();
        assert!(err.contains("unknown flag"), "{err}");

        // AND match: only the task carrying both labels comes back.
        let filtered = run(
            &conn,
            &format!("task list --space {} --label HUK,Insurance", space.id),
        )
        .unwrap();
        assert_eq!(filtered["count"], 1);
        assert_eq!(filtered["items"][0]["entity"]["id"], both_id.as_str());

        // Case-insensitive, single name.
        let single = run(
            &conn,
            &format!("task list --space {} --label huk", space.id),
        )
        .unwrap();
        assert_eq!(single["count"], 2);

        // No label at all, or an unknown name, doesn't just come back empty.
        assert!(run(&conn, "task list --label HUK").is_err());
        assert!(run(
            &conn,
            &format!("task list --space {} --label Nope", space.id)
        )
        .is_err());

        // `--fields labels` on `list` now resolves, matching what `get` already returns.
        let projected = run(
            &conn,
            &format!("task list --space {} --fields labels", space.id),
        )
        .unwrap();
        let both_item = projected["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["id"] == both_id.as_str())
            .unwrap();
        assert!(both_item.get("unknownFields").is_none());
        let names: Vec<&str> = both_item["labels"]
            .as_array()
            .unwrap()
            .iter()
            .map(|l| l["name"].as_str().unwrap())
            .collect();
        assert!(
            names.contains(&"HUK") && names.contains(&"Insurance"),
            "{names:?}"
        );

        // The reverse lookup: every entity carrying a label.
        let reverse = run(&conn, &format!("label get {}", huk.id)).unwrap();
        assert_eq!(reverse["count"], 2);

        drop(conn);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn file_reindex_bulk_action_is_listed_and_dispatches() {
        let dir = std::env::temp_dir().join(format!("nookly-cli-test-{}", crate::db::new_id()));
        let conn = crate::db::connect(&dir).unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Work".into(), None, "#000".into()).unwrap();

        let described = run(&conn, "describe file").unwrap();
        let bulk_actions = described["bulkActions"].as_array().unwrap();
        assert!(bulk_actions.iter().any(|a| a["name"] == "reindex"));

        // A blank .docx has nothing to extract, so it starts out needing a reindex.
        let source_dir = dir.join("sources");
        std::fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("blank.docx");
        {
            let file = std::fs::File::create(&source).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            zip.start_file("word/document.xml", options).unwrap();
            std::io::Write::write_all(
                &mut zip,
                br#"<w:document xmlns:w="ns"><w:body></w:body></w:document>"#,
            )
            .unwrap();
            zip.finish().unwrap();
        }
        let created = run(
            &conn,
            &format!(
                "file create --space {} --title Blank --field localPath={}",
                space.id,
                source.display()
            ),
        )
        .unwrap();
        assert_eq!(created["data"]["needsReindex"], true);

        let summary = run(&conn, &format!("file reindex --space {}", space.id)).unwrap();
        assert_eq!(summary["checked"], 1);
        assert_eq!(summary["reindexed"], 0);

        assert!(run(&conn, "file frobnicate").is_err());

        drop(conn);
        let _ = std::fs::remove_dir_all(dir);
    }
}
