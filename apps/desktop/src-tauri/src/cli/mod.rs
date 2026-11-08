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
//! - Non-interactive: destructive commands take `--yes` instead of prompting.
//! - Errors are JSON on stderr, `{"error": {"kind": ..., "message": ...}}`,
//!   with a non-zero exit code.
//! - Every entity type is discoverable at runtime: `nookly cli schema` dumps
//!   the whole data model (entity types, their fields, relationship types);
//!   `nookly cli describe <entity-type>` dumps just one.

mod args;
#[cfg(test)]
mod generic_tests;
mod help;
#[cfg(test)]
mod property_tests;
#[cfg(test)]
mod snapshot_tests;
mod view;
mod warnings;

use args::*;
use help::*;
use warnings::*;

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
    write_line(
        &mut std::io::stderr(),
        &serde_json::to_string_pretty(&value).unwrap_or_else(|_| value.to_string()),
    );
    std::process::exit(1);
}

/// Writes one line, ignoring failures. `println!` panics when the reader has
/// gone away (`| head`), and release builds abort on panic.
fn write_line(out: &mut impl std::io::Write, line: &str) {
    let _ = writeln!(out, "{line}");
}

fn print_json(value: &Value) {
    if std::io::stdout().is_terminal() {
        write_line(
            &mut std::io::stdout(),
            &serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string()),
        );
    } else {
        write_line(&mut std::io::stdout(), &value.to_string());
    }
}

// --- dispatch -----------------------------------------------------------

/// `--dry-run` anywhere runs the command inside a savepoint that is always rolled
/// back: every validation, cardinality check and write happens for real, then none
/// of it is kept. Works for every command with no per-command code. Database
/// changes only; a `file create` from `localPath` still copies the file on disk.
fn dispatch(conn: &Connection, argv: Vec<String>) -> AppResult<Value> {
    if !argv.iter().any(|a| a == "--dry-run") {
        return dispatch_atomic(conn, argv);
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

/// A command that fails for any reason, including flag validation that only runs
/// after the command body (see `run_command`), must leave nothing behind, so a
/// retry can never create a duplicate.
fn dispatch_atomic(conn: &Connection, argv: Vec<String>) -> AppResult<Value> {
    conn.execute_batch("SAVEPOINT cli_command")?;
    match dispatch_command(conn, argv) {
        Ok(value) => {
            conn.execute_batch("RELEASE cli_command")?;
            Ok(value)
        }
        Err(err) => {
            conn.execute_batch("ROLLBACK TO cli_command; RELEASE cli_command")?;
            Err(err)
        }
    }
}

/// Runs a command, then writes every mention in its output with the readable key of what it
/// points at (`mention:JOT-12`) instead of the id it is stored with. The key is accepted
/// back by every command that takes block content.
fn dispatch_command(conn: &Connection, argv: Vec<String>) -> AppResult<Value> {
    let mut value = dispatch_command_raw(conn, argv)?;
    show_mention_keys(conn, &mut value);
    Ok(value)
}

fn show_mention_keys(conn: &Connection, value: &mut Value) {
    match value {
        Value::String(text) => {
            if text.contains("](mention:") {
                if let Ok(readable) = crate::db::mention_keys::ids_to_keys(conn, text) {
                    *text = readable;
                }
            }
        }
        Value::Array(items) => items.iter_mut().for_each(|v| show_mention_keys(conn, v)),
        Value::Object(fields) => {
            // Source text (a code block) is shown exactly as it is stored.
            let verbatim = fields
                .get("blockType")
                .and_then(Value::as_str)
                .is_some_and(|t| !crate::db::mention_keys::holds_mentions(t));
            for (name, field) in fields.iter_mut() {
                if !(verbatim && name == "content") {
                    show_mention_keys(conn, field);
                }
            }
        }
        _ => {}
    }
}

fn dispatch_command_raw(conn: &Connection, argv: Vec<String>) -> AppResult<Value> {
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

fn schema_all() -> Value {
    let entity_types: Vec<Value> = schema::all()
        .iter()
        .map(|d| schema::describe_json(d))
        .collect();
    let relationship_types: Vec<_> = crate::db::relationships::list_relationship_types();
    json!({
        "entityTypes": entity_types,
        "relationshipTypes": relationship_types,
        "note": "`space` and `label` are core infrastructure, not registered entity types, see \
                 `nookly cli space`/`nookly cli label` --help-style usage in `nookly cli` with no args.",
    })
}

fn describe_one(entity_type: &str) -> AppResult<Value> {
    let def = schema::lookup(entity_type).ok_or_else(|| unknown_entity_type(entity_type))?;
    Ok(schema::describe_json(def))
}

/// The file format a type exports and imports, or an error naming the types that have one.
fn portable_def(entity_type: &str) -> AppResult<&'static crate::db::portable::PortableDef> {
    crate::db::portable::for_type(entity_type).ok_or_else(|| {
        let known: Vec<&str> = crate::db::portable::all()
            .iter()
            .map(|d| d.entity_type)
            .collect();
        AppError::InvalidInput(format!(
            "'{entity_type}' has no file format to export or import. Types that do: {}",
            known.join(", ")
        ))
    })
}

/// Reads a file to import, refusing one over the size limit before reading it.
fn read_import_file(path: &str) -> AppResult<String> {
    let size = std::fs::metadata(path)
        .map_err(|e| AppError::Io(format!("{path}: {e}")))?
        .len();
    let limit = crate::db::portable::largest_import_bytes();
    if size > limit {
        return Err(crate::db::portable::too_large(limit));
    }
    std::fs::read_to_string(path).map_err(|e| AppError::Io(format!("{path}: {e}")))
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
                    "'{entity_type}' has no 'body' field, its content is built from real blocks, not \
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
        for key in fields.keys() {
            if let Some(f) = known.get(key.as_str()) {
                if !f.required_on_create && !f.writable_on_update {
                    return Err(AppError::InvalidInput(format!(
                        "field '{key}' on '{entity_type}' is read only, it can't be set at creation"
                    )));
                }
            }
        }
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

/// Checks every `--field` value against its declared kind and converts what can be
/// converted (a number given for a text field becomes its text), so a wrong value is
/// refused up front instead of being silently dropped, stored as is, or clearing the
/// stored value. `null` and an empty value still mean "clear" on the kinds that
/// allow it.
fn coerce_fields(def: &schema::EntitySchemaDef, fields: &JsonMap) -> AppResult<JsonMap> {
    use schema::FieldKind;
    let mut out = fields.clone();
    for f in def.fields {
        let Some(value) = fields.get(f.name) else {
            continue;
        };
        let bad = |expected: &str| {
            AppError::InvalidInput(format!("field '{}' takes {expected}, got {value}", f.name))
        };
        let clears = matches!(value, Value::Null) || value == &Value::String(String::new());
        let coerced = match f.kind {
            FieldKind::Text | FieldKind::LongText => match value {
                Value::Number(n) => Value::String(n.to_string()),
                Value::Bool(b) => Value::String(b.to_string()),
                Value::Array(_) | Value::Object(_) => return Err(bad("text")),
                other => other.clone(),
            },
            FieldKind::Integer => match value {
                _ if clears => value.clone(),
                Value::Number(n) if n.is_i64() || n.is_u64() => value.clone(),
                _ => return Err(bad("a whole number")),
            },
            FieldKind::Float => match value {
                _ if clears => value.clone(),
                Value::Number(_) => value.clone(),
                _ => return Err(bad("a number")),
            },
            FieldKind::Boolean => match value {
                Value::Bool(_) | Value::Null => value.clone(),
                _ => return Err(bad("true or false")),
            },
            FieldKind::Date => match value {
                _ if clears => value.clone(),
                Value::String(s) if chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok() => {
                    value.clone()
                }
                _ => return Err(bad("a date like 2026-01-05")),
            },
            FieldKind::DateTime => match value {
                _ if clears => value.clone(),
                Value::String(s)
                    if chrono::DateTime::parse_from_rfc3339(s).is_ok()
                        || chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok() =>
                {
                    value.clone()
                }
                _ => return Err(bad("a date or an RFC 3339 timestamp")),
            },
            _ => value.clone(),
        };
        out.insert(f.name.to_string(), coerced);
    }
    Ok(out)
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
        "get" => entity_get(conn, def, entity_type, args),
        "create" => entity_create(conn, def, entity_type, args),
        "update" => entity_update(conn, def, entity_type, args),
        "delete" => entity_delete(conn, def, args),
        "duplicate" => entity_duplicate(conn, entity_type, args),
        "convert" => entity_convert(conn, def, args),
        "restore" => entity_restore(conn, def, entity_type, args),
        "export" => entity_export(conn, entity_type, args),
        "import" => entity_import(conn, entity_type, args),
        "blocks" | "grep" | "add-block" | "update-block" | "delete-block" | "reorder-blocks" => {
            if !def.supports_blocks && schema::embedded_page(entity_type).is_none() {
                return Err(AppError::InvalidInput(format!(
                    "'{entity_type}' has no block content, block commands only apply to types where \
                     `describe {entity_type}` reports supportsBlocks: true"
                )));
            }
            block_command(conn, def, verb, args)
        }
        other => entity_custom_verb(conn, def, entity_type, other, args),
    })
}

fn entity_get(
    conn: &Connection,
    def: &schema::EntitySchemaDef,
    entity_type: &str,
    args: &Args,
) -> AppResult<Value> {
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

fn entity_create(
    conn: &Connection,
    def: &schema::EntitySchemaDef,
    entity_type: &str,
    args: &Args,
) -> AppResult<Value> {
    validate_fields(entity_type, def, &args.fields, true)?;
    let coerced = coerce_fields(def, &args.fields)?;
    let space_id = args.require_flag("space")?;
    let title = args.require_flag("title")?;
    let icon = args.flag("icon");
    let fields = resolve_ref_fields(conn, def, &coerced)?;
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

fn entity_update(
    conn: &Connection,
    def: &schema::EntitySchemaDef,
    entity_type: &str,
    args: &Args,
) -> AppResult<Value> {
    let id = args.require_entity(conn, 0, "id")?;
    validate_fields(entity_type, def, &args.fields, false)?;
    let coerced = coerce_fields(def, &args.fields)?;
    let before = (def.get)(conn, &id)?;
    args.check_revision(&before)?;
    let title = args.flag("title");
    let icon = args.flag("icon");
    let pinned = match args.flag("pinned").as_deref() {
        None => None,
        Some("true") => Some(true),
        Some("false") => Some(false),
        Some(other) => {
            return Err(AppError::InvalidInput(format!(
                "--pinned takes true or false, got '{other}'"
            )))
        }
    };
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
    let fields = resolve_ref_fields(conn, def, &coerced)?;
    (def.update)(conn, &id, &fields)?;
    let after = (def.get)(conn, &id)?;
    let changes = view::diff_values(&before, &after);
    let mut result = enrich(conn, entity_type, &id, after)?;
    result["changes"] = json!(changes);
    Ok(result)
}

fn entity_delete(
    conn: &Connection,
    def: &schema::EntitySchemaDef,
    args: &Args,
) -> AppResult<Value> {
    let id = args.require_entity(conn, 0, "id")?;
    args.require_yes()?;
    args.check_revision(&(def.get)(conn, &id)?)?;
    crate::db::entities::soft_delete_entity(conn, &id)?;
    let key = crate::db::entities::entity_key(conn, &id)?;
    Ok(
        json!({ "deleted": id, "key": key, "note": "soft delete only, recoverable with `restore`, see Trash" }),
    )
}

fn entity_duplicate(conn: &Connection, entity_type: &str, args: &Args) -> AppResult<Value> {
    let id = args.require_entity(conn, 0, "id")?;
    let data = schema::duplicate(conn, &id)?;
    let new_id = extract_id(&data)?;
    enrich(conn, entity_type, &new_id, data)
}

fn entity_convert(
    conn: &Connection,
    def: &schema::EntitySchemaDef,
    args: &Args,
) -> AppResult<Value> {
    let id = args.require_entity(conn, 0, "id")?;
    let to = args.require_flag("to")?;
    args.check_revision(&(def.get)(conn, &id)?)?;
    schema::convert(conn, &id, &to)?;
    let target = schema::lookup(&to).ok_or_else(|| unknown_entity_type(&to))?;
    let data = (target.get)(conn, &id)?;
    enrich(conn, &to, &id, data)
}

fn entity_restore(
    conn: &Connection,
    def: &schema::EntitySchemaDef,
    entity_type: &str,
    args: &Args,
) -> AppResult<Value> {
    let id = args.require_entity(conn, 0, "id")?;
    crate::db::entities::restore_entity(conn, &id)?;
    let data = (def.get)(conn, &id)?;
    enrich(conn, entity_type, &id, data)
}

fn entity_export(conn: &Connection, entity_type: &str, args: &Args) -> AppResult<Value> {
    let id = args.require_entity(conn, 0, "id")?;
    let portable = portable_def(entity_type)?;
    let text = (portable.export)(conn, &id)?;
    match args.flag("out") {
        // Written next to nothing else of Nookly's: the path is the caller's.
        Some(path) => {
            std::fs::write(&path, &text).map_err(|e| AppError::Io(e.to_string()))?;
            Ok(json!({ "exported": id, "format": portable.format, "path": path }))
        }
        None => serde_json::from_str(&text).map_err(|e| AppError::Io(e.to_string())),
    }
}

fn entity_import(conn: &Connection, entity_type: &str, args: &Args) -> AppResult<Value> {
    let portable = portable_def(entity_type)?;
    let path = args.require_flag("file")?;
    let space_id = args.require_flag("space")?;
    let parent = match args.flag("parent") {
        Some(raw) => Some(crate::db::entities::resolve_entity_ref(conn, &raw)?),
        None => None,
    };
    let text = read_import_file(&path)?;
    // A task file is imported as a task: `nookly cli deck import` refuses it by name.
    let format = crate::db::portable::format_of(&text)?;
    if format != portable.format {
        return Err(AppError::InvalidInput(format!(
            "this file is a {format} file, not a {} file. Import it with `nookly cli <type> import` \
             for its own type (`describe <type>` lists `portable`)",
            portable.format
        )));
    }
    let created = crate::db::portable::import(conn, &space_id, parent.as_deref(), &text)?;
    let data = schema::lookup(&created.entity_type)
        .ok_or_else(|| unknown_entity_type(&created.entity_type))
        .and_then(|def| (def.get)(conn, &created.id))?;
    enrich(conn, &created.entity_type, &created.id, data)
}

fn entity_custom_verb(
    conn: &Connection,
    def: &schema::EntitySchemaDef,
    entity_type: &str,
    other: &str,
    args: &Args,
) -> AppResult<Value> {
    if let Some(action) = schema::entity_actions(entity_type)
        .into_iter()
        .find(|a| a.name == other)
    {
        let id = args.require_entity(conn, 0, "id")?;
        validate_child_fields(action.name, action.fields, &args.fields, true)?;
        let title = args.flag("title");
        return atomically(conn, || {
            (action.run)(conn, &id, title.as_deref(), &args.fields)
        });
    }
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
    let action_verbs: Vec<&str> = schema::entity_actions(entity_type)
        .iter()
        .map(|a| a.name)
        .collect();
    let extra = [
        child_verbs.join(", "),
        bulk_verbs.join(", "),
        action_verbs.join(", "),
    ]
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
                "note": format!("soft delete only, recoverable with `restore-{singular}`"),
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
            let fetched = crate::db::labels::list_labels(conn, &space_id)?
                .into_iter()
                .map(|l| Ok((l.id.clone(), crate::error::to_json(&l)?)))
                .collect::<AppResult<HashMap<String, Value>>>()?;
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
    let include_deleted = args.has_bool("include-deleted");
    let mut items = (def.list)(conn, args.flag("space").as_deref(), include_deleted)?;
    if include_deleted {
        // Not every type's own listing knows about Trash, so every type's trashed
        // entities are added here, once, for all of them.
        let listed: std::collections::HashSet<String> =
            items.iter().filter_map(|i| extract_id(i).ok()).collect();
        for e in crate::db::entities::list_entities(conn, args.flag("space").as_deref(), true)? {
            if e.entity_type == def.entity_type && e.deleted_at.is_some() && !listed.contains(&e.id)
            {
                items.push((def.get)(conn, &e.id)?);
            }
        }
    }
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
                "--label requires --space, labels are siloed per Space (§ entity model), so a \
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
                        "no label named '{name}' in space {space_id}, see `nookly cli label list \
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

/// What the block verbs need to find and read a page: the owner's page for a type with an
/// embedded one (a Course's notes), or the entity itself.
struct BlockPage<'a> {
    conn: &'a Connection,
    def: &'a schema::EntitySchemaDef,
    embedded: Option<&'static schema::EmbeddedPageDef>,
    entity_type: &'a str,
    get_page: fn(&Connection, &str) -> AppResult<Value>,
}

impl BlockPage<'_> {
    fn target_page(&self, args: &Args) -> AppResult<String> {
        let id = args.require_entity(self.conn, 0, "id")?;
        if let Some(e) = self.embedded {
            if crate::db::entities::get_entity(self.conn, &id)?.entity_type == self.def.entity_type
            {
                return Ok((e.resolve)(self.conn, &id)?.id);
            }
        }
        require_page(self.conn, self.entity_type, &id)?;
        Ok(id)
    }
}

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
    // An owner with an embedded page (a Course's notes) takes the block verbs for
    // that page: its id or key, or the page's own, both land on the page.
    let embedded = if def.supports_blocks {
        None
    } else {
        schema::embedded_page(def.entity_type)
    };
    let page = BlockPage {
        conn,
        def,
        embedded,
        entity_type: embedded.map_or(def.entity_type, |e| e.page_type),
        get_page: if embedded.is_some() {
            crate::db::notes::cli_get_page
        } else {
            def.get
        },
    };
    match verb {
        "blocks" => block_list(&page, args),
        "grep" => block_grep(&page, args),
        "add-block" => block_add(&page, args),
        "update-block" => block_update(&page, args),
        "delete-block" => block_delete(&page, args),
        "reorder-blocks" => block_reorder(&page, args),
        _ => unreachable!("dispatch guarantees verb is one of the block commands"),
    }
}

fn block_list(page: &BlockPage, args: &Args) -> AppResult<Value> {
    let BlockPage { conn, .. } = *page;
    let id = page.target_page(args)?;
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

fn block_grep(page: &BlockPage, args: &Args) -> AppResult<Value> {
    let BlockPage { conn, .. } = *page;
    let id = page.target_page(args)?;
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

fn block_add(page: &BlockPage, args: &Args) -> AppResult<Value> {
    let BlockPage {
        conn,
        entity_type,
        get_page,
        ..
    } = *page;
    let id = page.target_page(args)?;
    args.check_revision(&get_page(conn, &id)?)?;
    let block_type = args.require_flag("type")?;
    let content = args.require_flag("content")?;
    check_media_content(&block_type, &content)?;
    let position = args.flag("position").and_then(|v| v.parse::<i64>().ok());
    // `--language`/`--filename` only mean anything on a `code` block (the
    // markdown editor's code block header row) — harmless no-ops on any other type.
    let language = args.flag("language");
    let filename = args.flag("filename");
    let submitted_content = content.clone();
    let mut attrs = args.attrs()?;
    // Whoever writes these blocks through the CLI wants to see the result, not the
    // code, so they open on the preview unless `--attr view=...` says otherwise.
    if matches!(
        block_type.as_str(),
        "equation" | "math" | "diagram" | "circuit" | "plot" | "mindmap"
    ) {
        attrs
            .entry("view".to_string())
            .or_insert_with(|| "rendered".to_string());
    }
    let block = crate::db::notes::create_block_with_attrs(
        conn, &id, block_type, content, position, language, filename, attrs,
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
    add_warning(&mut result, unreachable_file_warning(&block));
    Ok(result)
}

fn block_update(page: &BlockPage, args: &Args) -> AppResult<Value> {
    let BlockPage {
        conn,
        entity_type,
        get_page,
        ..
    } = *page;
    let block_id = args.require_positional(0, "block-id")?;
    let before = crate::db::notes::get_block(conn, &block_id)?;
    args.check_revision(&get_page(conn, &before.entity_id)?)?;
    let submitted_content = args.flag("content");
    if let Some(content) = &submitted_content {
        let block_type = args
            .flag("type")
            .unwrap_or_else(|| before.block_type.clone());
        check_media_content(&block_type, content)?;
    }
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
    add_warning(&mut result, unreachable_file_warning(&block));
    Ok(result)
}

fn block_delete(page: &BlockPage, args: &Args) -> AppResult<Value> {
    let BlockPage { conn, get_page, .. } = *page;
    let block_id = args.require_positional(0, "block-id")?;
    args.require_yes()?;
    let block = crate::db::notes::get_block(conn, &block_id)?;
    args.check_revision(&get_page(conn, &block.entity_id)?)?;
    crate::db::notes::delete_block(conn, &block_id)?;
    Ok(json!({ "deleted": block_id, "block": block }))
}

fn block_reorder(page: &BlockPage, args: &Args) -> AppResult<Value> {
    let BlockPage { conn, get_page, .. } = *page;
    let id = page.target_page(args)?;
    args.check_revision(&get_page(conn, &id)?)?;
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
    let count = created.len();
    let mut items = created;
    if count == 1 {
        if let Some(only) = items.pop() {
            return Ok(only);
        }
    }
    Ok(json!({ "count": count, "items": items }))
}

/// A relationship with both ends' keys next to their ids.
fn relationship_json(
    conn: &Connection,
    rel: crate::db::relationships::Relationship,
) -> AppResult<Value> {
    let from_key = crate::db::entities::entity_key(conn, &rel.from_entity_id)?;
    let to_key = crate::db::entities::entity_key(conn, &rel.to_entity_id)?;
    let mut value = crate::error::to_json(rel)?;
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
            "delete": "nookly cli space delete <id> --yes  (PERMANENT, Spaces have no Trash; deletes every entity inside)",
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
            crate::error::to_json(space)
        }
        "update" => {
            let id = args.require_positional(0, "id")?;
            let patch = crate::db::spaces::SpacePatch {
                name: args.flag("name"),
                icon: args.flag("icon"),
                color: args.flag("color"),
            };
            let space = crate::db::spaces::update_space(conn, &id, patch)?;
            crate::error::to_json(space)
        }
        "delete" => {
            let id = args.require_positional(0, "id")?;
            args.require_yes()?;
            crate::db::spaces::delete_space(conn, &id)?;
            Ok(json!({ "deleted": id, "note": "permanent, Spaces have no Trash" }))
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
            "note": "Labels are space-siloed (§ entity model), the same name in two Spaces is two separate labels.",
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
            crate::error::to_json(label)
        }
        "update" => {
            let id = args.require_positional(0, "id")?;
            let label = crate::db::labels::update_label(
                conn,
                &id,
                args.flag("name"),
                args.flag("color"),
            )?;
            crate::error::to_json(label)
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
mod tests;
