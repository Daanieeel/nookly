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
            "entityTypes": entity_types,
            "list": "nookly cli <entity-type> list [--space <id>] [--include-deleted]",
            "get": "nookly cli <entity-type> get <id>  (includes relationships + labels)",
            "create": "nookly cli <entity-type> create --space <id> --title <title> [--icon <icon>] [--field name=value ...]",
            "update": "nookly cli <entity-type> update <id> [--title <t>] [--icon <i>] [--pinned true|false] [--field name=value ...]",
            "delete": "nookly cli <entity-type> delete <id> --yes  (soft delete only — goes to Trash, never permanent)",
            "restore": "nookly cli <entity-type> restore <id>",
            "blocks": "note/jot/refinement only (`describe <type>` reports supportsBlocks) — full block editing: \
                       `nookly cli <type> blocks <id>`, `add-block <id> --type <t> --content <c>`, \
                       `update-block <block-id> [--content <c>] [--type <t>]`, `delete-block <block-id> --yes`, \
                       `reorder-blocks <id> <block-id> <block-id> ...`. See `describe note` for the full list \
                       of known block types.",
        },
        "coreCommands": {
            "relate": "nookly cli relate <from-id> <relationship-type> <to-id> --yes",
            "unrelate": "nookly cli unrelate <relationship-id> --yes",
            "search": "nookly cli search <query> [--space <id>]",
            "describe": "nookly cli describe <entity-type>",
            "schema": "nookly cli schema  (the whole data model: every entity type + relationship type)",
            "space": "nookly cli space <list|create|update|delete> ...",
            "label": "nookly cli label <list|create|delete|attach|detach> ...",
        },
    })
}

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
            let id = args.require_positional(0, "id")?;
            let data = (def.get)(conn, &id)?;
            enrich(conn, entity_type, &id, data)
        }
        "create" => {
            validate_fields(entity_type, def, &args.fields, true)?;
            let space_id = args.require_flag("space")?;
            let title = args.require_flag("title")?;
            let icon = args.flag("icon");
            let input = schema::CreateInput { space_id, title, fields: args.fields.clone() };
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
            let id = args.require_positional(0, "id")?;
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
            let data = (def.update)(conn, &id, &args.fields)?;
            enrich(conn, entity_type, &id, data)
        }
        "delete" => {
            let id = args.require_positional(0, "id")?;
            args.require_yes()?;
            crate::db::entities::soft_delete_entity(conn, &id)?;
            Ok(json!({ "deleted": id, "note": "soft delete only — recoverable with `restore`, see Trash" }))
        }
        "restore" => {
            let id = args.require_positional(0, "id")?;
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

/// Block-level editing (§2.1: Notes/Jots/Refinements are "block-level
/// addressable" pages) for any entity type that opts in via
/// `EntitySchemaDef::supports_blocks` — currently `note`/`jot`/`refinement`,
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
            let id = args.require_positional(0, "id")?;
            require_page(conn, entity_type, &id)?;
            let blocks = crate::db::notes::list_blocks(conn, &id)?;
            Ok(json!({ "pageId": id, "count": blocks.len(), "items": blocks }))
        }
        "add-block" => {
            let id = args.require_positional(0, "id")?;
            require_page(conn, entity_type, &id)?;
            let block_type = args.require_flag("type")?;
            let content = args.require_flag("content")?;
            let position = args.flag("position").and_then(|v| v.parse::<i64>().ok());
            let block = crate::db::notes::create_block(conn, &id, block_type, content, position)?;
            Ok(json!({ "pageId": id, "block": block }))
        }
        "update-block" => {
            let block_id = args.require_positional(0, "block-id")?;
            let patch = crate::db::notes::BlockPatch {
                content: args.flag("content"),
                block_type: args.flag("type"),
            };
            let block = crate::db::notes::update_block(conn, &block_id, patch)?;
            Ok(json!({ "block": block }))
        }
        "delete-block" => {
            let block_id = args.require_positional(0, "block-id")?;
            args.require_yes()?;
            crate::db::notes::delete_block(conn, &block_id)?;
            Ok(json!({ "deleted": block_id }))
        }
        "reorder-blocks" => {
            let id = args.require_positional(0, "id")?;
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
            Ok(json!({ "pageId": id, "count": blocks.len(), "items": blocks }))
        }
        _ => unreachable!("dispatch guarantees verb is one of the block commands"),
    }
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

/// Wraps a `get`/`create`/`update` payload with its relationships and labels —
/// the right sidebar's three sections (§ philosophy), so an agent gets full
/// context on an entity in one call instead of chasing it down separately.
fn enrich(conn: &Connection, entity_type: &str, id: &str, data: Value) -> AppResult<Value> {
    let relationships = crate::db::relationships::list_relationships(
        conn,
        id,
        crate::db::relationships::Direction::Both,
    )?;
    let labels = crate::db::labels::list_labels_for_entity(conn, id)?;
    Ok(json!({
        "entityType": entity_type,
        "data": data,
        "relationships": relationships,
        "labels": labels,
    }))
}

fn relate(conn: &Connection, args: &Args) -> AppResult<Value> {
    let from_id = args.require_positional(0, "from-id")?;
    let relationship_type = args.require_positional(1, "relationship-type")?;
    let to_id = args.require_positional(2, "to-id")?;
    args.require_yes()?;
    let rel = crate::db::relationships::create_relationship(
        conn,
        from_id,
        to_id,
        relationship_type,
        None,
        None,
    )?;
    Ok(serde_json::to_value(rel).expect("Relationship always serializes"))
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
            let entity_id = args.require_positional(0, "entity-id")?;
            let label_id = args.require_positional(1, "label-id")?;
            crate::db::labels::attach_label(conn, &entity_id, &label_id)?;
            Ok(json!({ "attached": label_id, "to": entity_id }))
        }
        "detach" => {
            let entity_id = args.require_positional(0, "entity-id")?;
            let label_id = args.require_positional(1, "label-id")?;
            crate::db::labels::detach_label(conn, &entity_id, &label_id)?;
            Ok(json!({ "detached": label_id, "from": entity_id }))
        }
        other => Err(AppError::InvalidInput(format!(
            "unknown label command '{other}'. Expected one of: list, create, delete, attach, detach"
        ))),
    }
}
