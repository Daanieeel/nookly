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

struct Args {
    positional: Vec<String>,
    flags: HashMap<String, String>,
    bool_flags: std::collections::HashSet<String>,
    fields: JsonMap,
}

fn parse_args(argv: &[String]) -> Args {
    let mut positional = Vec::new();
    let mut flags = HashMap::new();
    let mut bool_flags = std::collections::HashSet::new();
    let mut fields = JsonMap::new();

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
            if let Some((key, value)) = rest.split_once('=') {
                flags.insert(key.to_string(), value.to_string());
                i += 1;
                continue;
            }
            let takes_value = argv
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
    }
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
        self.flags.get(name).cloned()
    }

    fn require_flag(&self, name: &str) -> AppResult<String> {
        self.flag(name)
            .ok_or_else(|| AppError::InvalidInput(format!("missing required flag: --{name}")))
    }

    fn has_bool(&self, name: &str) -> bool {
        self.bool_flags.contains(name) || self.flags.get(name).map(|v| v == "true").unwrap_or(false)
    }

    fn require_yes(&self) -> AppResult<()> {
        if self.has_bool("yes") {
            Ok(())
        } else {
            Err(AppError::InvalidInput(
                "this is a mutating/destructive command — pass --yes to confirm (never prompts interactively)".into(),
            ))
        }
    }
}

// --- dispatch -----------------------------------------------------------

fn dispatch(conn: &Connection, argv: Vec<String>) -> AppResult<Value> {
    let Some(head) = argv.first().cloned() else {
        return Ok(top_level_help());
    };

    match head.as_str() {
        "help" | "--help" | "-h" => Ok(top_level_help()),
        "agent-instructions" => Ok(agent_instructions()),
        "schema" => Ok(schema_all()),
        "describe" => {
            let args = parse_args(&argv[1..]);
            let entity_type = args.require_positional(0, "entity-type")?;
            describe_one(&entity_type)
        }
        "search" => {
            let args = parse_args(&argv[1..]);
            let query = args.require_positional(0, "query")?;
            let space_id = args.flag("space");
            let hits = crate::db::search::search(conn, &query, space_id.as_deref())?;
            Ok(json!({ "query": query, "count": hits.len(), "items": hits }))
        }
        "relate" => relate(conn, &parse_args(&argv[1..])),
        "unrelate" => unrelate(conn, &parse_args(&argv[1..])),
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
            "usage": "nookly cli <entity-type> <list|get|create|update|delete|restore> ...",
            "ids": "Every entity <id> argument (get, update, delete, restore, blocks, relate, label attach, \
                    entity_ref --field values) also accepts the entity's `key`, e.g. TSK-14.",
            "entityTypes": entity_types,
            "list": "nookly cli <entity-type> list [--space <id>] [--include-deleted]",
            "get": "nookly cli <entity-type> get <id>  (includes relationships, labels + mentionedIn backlinks)",
            "create": "nookly cli <entity-type> create --space <id> --title <title> [--icon <icon>] [--field name=value ...]",
            "update": "nookly cli <entity-type> update <id> [--title <t>] [--icon <i>] [--pinned true|false] [--field name=value ...]",
            "delete": "nookly cli <entity-type> delete <id> --yes  (soft delete only — goes to Trash, never permanent)",
            "restore": "nookly cli <entity-type> restore <id>",
            "blocks": "note/jot only (`describe <type>` reports supportsBlocks) — full block editing: \
                       `nookly cli <type> blocks <id>`, `add-block <id> --type <t> --content <c> [--language <l>] [--filename <f>]`, \
                       `update-block <block-id> [--content <c>] [--type <t>] [--language <l>] [--filename <f>]`, \
                       `delete-block <block-id> --yes`, `reorder-blocks <id> <block-id> <block-id> ...`. \
                       `--language`/`--filename` are the code block header row and only apply to `type=code`. \
                       See `describe note` for the full list of known block types.",
        },
        "coreCommands": {
            "relate": "nookly cli relate <from-id> <relationship-type> <to-id> --yes",
            "unrelate": "nookly cli unrelate <relationship-id> --yes",
            "search": "nookly cli search <query> [--space <id>]",
            "describe": "nookly cli describe <entity-type>",
            "schema": "nookly cli schema  (the whole data model: every entity type + relationship type)",
            "space": "nookly cli space <list|create|update|delete> ...",
            "label": "nookly cli label <list|create|delete|attach|detach> ...",
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
nookly cli <entity-type> list [--space <id>] [--include-deleted]
nookly cli <entity-type> get <id>                    # includes relationships, labels + mentionedIn
nookly cli <entity-type> create --space <id> --title <title> [--icon <icon>] [--field name=value ...]
nookly cli <entity-type> update <id> [--title <t>] [--icon <i>] [--pinned true|false] [--field name=value ...]
nookly cli <entity-type> delete <id> --yes            # soft delete — Trash, not permanent
nookly cli <entity-type> restore <id>
```

Every entity carries a short `key` next to its `id`, like `TSK-14` or `NOT-3`: a three
letter type prefix and a number. Anywhere a command takes an entity id (including `relate`,
`label attach`, block commands and entity reference `--field` values) you can pass the key
instead. `search` matches keys too. Space, label, block and relationship ids have no key.

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
nookly cli <type> blocks <id>                                                    # list blocks in order
nookly cli <type> add-block <id> --type <blockType> --content <text> [--position <n>] [--language <l>] [--filename <f>]
nookly cli <type> update-block <block-id> [--content <c>] [--type <t>] [--language <l>] [--filename <f>]
nookly cli <type> delete-block <block-id> --yes
nookly cli <type> reorder-blocks <id> <block-id> <block-id> ...
```

One call per element — a heading, a paragraph, a code block, one list, one table — not one
call with a whole document jammed into `--content`. `describe <type>` lists every known
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
nookly cli relate <from-id> <relationship-type> <to-id> --yes
nookly cli unrelate <relationship-id> --yes
nookly cli search <query> [--space <id>]              # full-text, across every entity type
```

Search matches entity titles and, for Notes/Jots, individual blocks. A block hit
carries `blockId` plus a `snippet` whose matched terms are wrapped in `\u0001` / `\u0002`.

## Spaces and Labels

A Space is a top-level workspace (everything else lives inside exactly one). Labels are
freeform tags, siloed per Space (the same label name in two Spaces is two separate labels):

```
nookly cli space <list|create|update|delete> ...      # space delete is PERMANENT, no Trash
nookly cli label <list|create|delete|attach|detach> ...
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
    let args = parse_args(&rest[1..]);

    match verb.as_str() {
        "list" => {
            let items = (def.list)(conn, args.flag("space").as_deref(), args.has_bool("include-deleted"))?;
            Ok(json!({ "entityType": entity_type, "count": items.len(), "items": items }))
        }
        "get" => {
            let id = args.require_entity(conn, 0, "id")?;
            let data = (def.get)(conn, &id)?;
            enrich(conn, entity_type, &id, data)
        }
        "create" => {
            validate_fields(entity_type, def, &args.fields, true)?;
            let space_id = args.require_flag("space")?;
            let title = args.require_flag("title")?;
            let icon = args.flag("icon");
            let fields = resolve_ref_fields(conn, def, &args.fields)?;
            let input = schema::CreateInput { space_id, title, fields };
            let data = (def.create)(conn, input)?;
            let id = extract_id(&data)?;
            // `icon` is base-entity data (§ entity model), not a module field —
            // every `create_*` fn takes it as `None` today, so it's applied
            // here generically rather than threading it through every module.
            let data = if icon.is_some() {
                crate::db::entities::update_entity(
                    conn,
                    &id,
                    crate::db::entities::EntityPatch { title: None, icon, pinned: None },
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
            let title = args.flag("title");
            let icon = args.flag("icon");
            let pinned = args.flag("pinned").map(|v| v == "true");
            if title.is_some() || icon.is_some() || pinned.is_some() {
                crate::db::entities::update_entity(
                    conn,
                    &id,
                    crate::db::entities::EntityPatch { title, icon, pinned },
                )?;
            }
            let fields = resolve_ref_fields(conn, def, &args.fields)?;
            let data = (def.update)(conn, &id, &fields)?;
            enrich(conn, entity_type, &id, data)
        }
        "delete" => {
            let id = args.require_entity(conn, 0, "id")?;
            args.require_yes()?;
            crate::db::entities::soft_delete_entity(conn, &id)?;
            let key = crate::db::entities::entity_key(conn, &id)?;
            Ok(json!({ "deleted": id, "key": key, "note": "soft delete only — recoverable with `restore`, see Trash" }))
        }
        "restore" => {
            let id = args.require_entity(conn, 0, "id")?;
            crate::db::entities::restore_entity(conn, &id)?;
            let data = (def.get)(conn, &id)?;
            enrich(conn, entity_type, &id, data)
        }
        "blocks" | "add-block" | "update-block" | "delete-block" | "reorder-blocks" => {
            if !def.supports_blocks {
                return Err(AppError::InvalidInput(format!(
                    "'{entity_type}' has no block content — block commands only apply to types where \
                     `describe {entity_type}` reports supportsBlocks: true"
                )));
            }
            block_command(conn, entity_type, verb, &args)
        }
        other => Err(AppError::InvalidInput(format!(
            "unknown verb '{other}' for entity type '{entity_type}'. Expected one of: list, get, create, \
             update, delete, restore, blocks, add-block, update-block, delete-block, reorder-blocks"
        ))),
    }
}

/// Block-level editing (§2.1: Notes/Jots are "block-level
/// addressable" pages) for any entity type that opts in via
/// `EntitySchemaDef::supports_blocks` — currently `note`/`jot`,
/// but generic: a future page-like module gets these commands for free.
/// Blocks aren't entities themselves (no base entity fields — same reasoning
/// as Index Cards, see `db::decks`), so they live outside the `<entity-type>
/// list/get/create/update/delete` pattern as their own small set of verbs.
fn block_command(
    conn: &Connection,
    entity_type: &str,
    verb: &str,
    args: &Args,
) -> AppResult<Value> {
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
            Ok(json!({ "pageId": id, "pageKey": page_key, "count": blocks.len(), "items": blocks }))
        }
        "add-block" => {
            let id = args.require_entity(conn, 0, "id")?;
            require_page(conn, entity_type, &id)?;
            let block_type = args.require_flag("type")?;
            let content = args.require_flag("content")?;
            let position = args.flag("position").and_then(|v| v.parse::<i64>().ok());
            // `--language`/`--filename` only mean anything on a `code` block (the
            // markdown editor's code block header row) — harmless no-ops on any other type.
            let language = args.flag("language");
            let filename = args.flag("filename");
            let submitted_content = content.clone();
            let block = crate::db::notes::create_block(
                conn, &id, block_type, content, position, language, filename,
            )?;
            let page_key = crate::db::entities::entity_key(conn, &id)?;
            let mut result = json!({ "pageId": id, "pageKey": page_key, "block": block.clone() });
            if let Some(warning) = paragraph_mistake_warning(conn, entity_type, &id, &block)? {
                result["warning"] = json!(warning);
            }
            if let Some(warning) = table_normalize_warning(&block, &submitted_content) {
                result["warning"] = json!(warning);
            }
            Ok(result)
        }
        "update-block" => {
            let block_id = args.require_positional(0, "block-id")?;
            let submitted_content = args.flag("content");
            let patch = crate::db::notes::BlockPatch {
                content: submitted_content.clone(),
                block_type: args.flag("type"),
                language: args.flag("language"),
                filename: args.flag("filename"),
            };
            let block = crate::db::notes::update_block(conn, &block_id, patch)?;
            let mut result = json!({ "block": block.clone() });
            if let Some(submitted) = &submitted_content {
                if let Some(warning) = table_normalize_warning(&block, submitted) {
                    result["warning"] = json!(warning);
                }
            }
            let page_id = block.entity_id.clone();
            if let Some(warning) = paragraph_mistake_warning(conn, entity_type, &page_id, &block)? {
                result["warning"] = json!(warning);
            }
            Ok(result)
        }
        "delete-block" => {
            let block_id = args.require_positional(0, "block-id")?;
            args.require_yes()?;
            crate::db::notes::delete_block(conn, &block_id)?;
            Ok(json!({ "deleted": block_id }))
        }
        "reorder-blocks" => {
            let id = args.require_entity(conn, 0, "id")?;
            require_page(conn, entity_type, &id)?;
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
            Ok(json!({ "pageId": id, "pageKey": page_key, "count": blocks.len(), "items": blocks }))
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
    let candidate = data.get("id").or_else(|| data.pointer("/entity/id"));
    candidate
        .and_then(Value::as_str)
        .map(str::to_string)
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

fn relate(conn: &Connection, args: &Args) -> AppResult<Value> {
    let from_id = args.require_entity(conn, 0, "from-id")?;
    let relationship_type = args.require_positional(1, "relationship-type")?;
    let to_id = args.require_entity(conn, 2, "to-id")?;
    args.require_yes()?;
    let rel = crate::db::relationships::create_relationship(
        conn,
        from_id,
        to_id,
        relationship_type,
        None,
        None,
    )?;
    relationship_json(conn, rel)
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
        }));
    };
    let args = parse_args(&argv[1..]);
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
        other => Err(AppError::InvalidInput(format!(
            "unknown space command '{other}'. Expected one of: list, create, update, delete"
        ))),
    }
}

fn label_command(conn: &Connection, argv: &[String]) -> AppResult<Value> {
    let Some(verb) = argv.first() else {
        return Ok(json!({
            "list": "nookly cli label list --space <id>",
            "create": "nookly cli label create --space <id> --name <name> --color <hex>",
            "delete": "nookly cli label delete <id> --yes",
            "attach": "nookly cli label attach <entity-id> <label-id>",
            "detach": "nookly cli label detach <entity-id> <label-id>",
            "note": "Labels are space-siloed (§ entity model) — the same name in two Spaces is two separate labels.",
        }));
    };
    let args = parse_args(&argv[1..]);
    match verb.as_str() {
        "list" => {
            let space_id = args.require_flag("space")?;
            let labels = crate::db::labels::list_labels(conn, &space_id)?;
            Ok(json!({ "count": labels.len(), "items": labels }))
        }
        "create" => {
            let space_id = args.require_flag("space")?;
            let name = args.require_flag("name")?;
            let color = args.require_flag("color")?;
            let label = crate::db::labels::create_label(conn, space_id, name, color)?;
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
            let label_id = args.require_positional(1, "label-id")?;
            crate::db::labels::attach_label(conn, &entity_id, &label_id)?;
            let key = crate::db::entities::entity_key(conn, &entity_id)?;
            Ok(json!({ "attached": label_id, "to": entity_id, "toKey": key }))
        }
        "detach" => {
            let entity_id = args.require_entity(conn, 0, "entity-id")?;
            let label_id = args.require_positional(1, "label-id")?;
            crate::db::labels::detach_label(conn, &entity_id, &label_id)?;
            let key = crate::db::entities::entity_key(conn, &entity_id)?;
            Ok(json!({ "detached": label_id, "from": entity_id, "fromKey": key }))
        }
        other => Err(AppError::InvalidInput(format!(
            "unknown label command '{other}'. Expected one of: list, create, delete, attach, detach"
        ))),
    }
}
