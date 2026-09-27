//! The fixed generic tool set (PLAN §4.1): `describe`, `schema`, `search`,
//! `list`, `get`, `create`, `update`, `delete`, `restore`, `relate`,
//! `unrelate`, `run_action`, `navigate`. Every one is a thin translator from
//! the model's JSON call into the exact argv the CLI (`crate::cli`) already
//! validates — new entity types, fields, actions and relationship types reach
//! the assistant the moment they register a schema, with zero code here.
//!
//! Writes (`create`/`update`/`delete`/`restore`/`relate`/`unrelate`/
//! `run_action`) never commit inline. `call` with `dry_run: true` reuses the
//! CLI's own `--dry-run` savepoint-and-rollback mechanism to produce the exact
//! result a preview card shows (PLAN §4.3); `agent_loop.rs` only calls again
//! with `dry_run: false`, after the user confirms.

use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use serde_json::{json, Value};

use super::provider::ToolSpec;

pub fn tool_specs() -> Vec<ToolSpec> {
    vec![
        ToolSpec {
            name: "schema".into(),
            description: "The whole data model: every entity type's name and every relationship type. \
                           Call this (or `describe`) before guessing a field or relationship name."
                .into(),
            parameters: json!({ "type": "object", "properties": {}, "additionalProperties": false }),
        },
        ToolSpec {
            name: "describe".into(),
            description: "One entity type's fields, actions, child collections, block support and \
                           relationship types."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": { "entity_type": { "type": "string" } },
                "required": ["entity_type"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: "search".into(),
            description: "Full-text search across the whole app (titles, keys and note/jot content), \
                           ignoring the Space wall."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string" },
                    "space_id": { "type": "string", "description": "Restrict to one Space." },
                    "entity_types": { "type": "array", "items": { "type": "string" } },
                    "limit": { "type": "integer" },
                },
                "required": ["query"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: "list".into(),
            description: "List entities of one type.".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "entity_type": { "type": "string" },
                    "space_id": { "type": "string" },
                    "include_deleted": { "type": "boolean" },
                    "limit": { "type": "integer" },
                },
                "required": ["entity_type"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: "get".into(),
            description: "Fetch one entity by id or key (e.g. TSK-14), with its relationships, labels and \
                           backlinks."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "entity_type": { "type": "string", "description": "From a prior describe/search/list/get result." },
                    "id": { "type": "string" },
                },
                "required": ["entity_type", "id"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: "create".into(),
            description: "Create a new entity. Requires user confirmation before it takes effect.".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "entity_type": { "type": "string" },
                    "space_id": { "type": "string" },
                    "title": { "type": "string" },
                    "icon": { "type": "string" },
                    "fields": { "type": "object", "description": "Module-specific fields, per describe()." },
                },
                "required": ["entity_type", "space_id", "title"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: "update".into(),
            description: "Edit an existing entity's base fields and/or module-specific fields. Requires \
                           user confirmation before it takes effect."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "entity_type": { "type": "string" },
                    "id": { "type": "string" },
                    "title": { "type": "string" },
                    "icon": { "type": "string" },
                    "pinned": { "type": "boolean" },
                    "space_id": { "type": "string", "description": "Moves the entity to this Space." },
                    "fields": { "type": "object" },
                },
                "required": ["entity_type", "id"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: "delete".into(),
            description: "Soft delete an entity (goes to Trash, recoverable with restore). Requires user \
                           confirmation before it takes effect."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": { "entity_type": { "type": "string" }, "id": { "type": "string" } },
                "required": ["entity_type", "id"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: "restore".into(),
            description: "Restore a soft-deleted entity from Trash. Requires user confirmation before it \
                           takes effect."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": { "entity_type": { "type": "string" }, "id": { "type": "string" } },
                "required": ["entity_type", "id"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: "relate".into(),
            description: "Create one or more relationships from one entity to others. Requires user \
                           confirmation before it takes effect."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "from_id": { "type": "string" },
                    "relationship_type": { "type": "string" },
                    "to_ids": { "type": "array", "items": { "type": "string" } },
                },
                "required": ["from_id", "relationship_type", "to_ids"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: "unrelate".into(),
            description: "Delete a relationship by its own id (from a prior get/relate result). Requires \
                           user confirmation before it takes effect."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": { "relationship_id": { "type": "string" } },
                "required": ["relationship_id"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: "run_action".into(),
            description: "Run one registered action on an entity beyond a plain field edit (describe() \
                           lists a type's actions). Requires user confirmation before it takes effect."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "entity_type": { "type": "string" },
                    "id": { "type": "string" },
                    "action": { "type": "string" },
                    "fields": { "type": "object" },
                },
                "required": ["entity_type", "id", "action"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: "navigate".into(),
            description: "Resolve an entity id/key so the app can open it. Read only, runs immediately, \
                           no confirmation needed."
                .into(),
            parameters: json!({
                "type": "object",
                "properties": { "id": { "type": "string" } },
                "required": ["id"],
                "additionalProperties": false,
            }),
        },
    ]
}

/// Writes ask for confirmation (PLAN §4.3); reads and `navigate` run freely.
pub fn is_write_tool(name: &str) -> bool {
    matches!(
        name,
        "create" | "update" | "delete" | "restore" | "relate" | "unrelate" | "run_action"
    )
}

fn str_arg(args: &Value, name: &str) -> AppResult<String> {
    args.get(name)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| AppError::InvalidInput(format!("tool call missing required argument '{name}'")))
}

/// Renders a JSON field value the way a user would type it after `--field
/// name=`, so it round-trips through the CLI's own `parse_field_value`.
fn field_value_arg(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

fn push_fields(argv: &mut Vec<String>, fields: Option<&Value>) {
    let Some(Value::Object(map)) = fields else { return };
    for (key, value) in map {
        if value.is_null() {
            continue;
        }
        argv.push("--field".into());
        argv.push(format!("{key}={}", field_value_arg(value)));
    }
}

/// Runs one tool call. `dry_run` reuses the CLI's `--dry-run` transaction
/// rollback to produce a preview with no write taking effect.
pub fn call(conn: &Connection, name: &str, args: &Value, dry_run: bool) -> AppResult<Value> {
    match name {
        "navigate" => {
            let id = str_arg(args, "id")?;
            let resolved = crate::db::entities::resolve_entity_ref(conn, &id)?;
            let entity = crate::db::entities::get_entity(conn, &resolved)?;
            Ok(json!({
                "id": entity.id,
                "key": entity.key,
                "entityType": entity.entity_type,
                "title": entity.title,
                "spaceId": entity.space_id,
            }))
        }
        "schema" => crate::cli::run_for_agent(conn, vec!["schema".into()]),
        "describe" => {
            let entity_type = str_arg(args, "entity_type")?;
            crate::cli::run_for_agent(conn, vec!["describe".into(), entity_type])
        }
        "search" => {
            let query = str_arg(args, "query")?;
            let mut argv = vec!["search".into(), query];
            if let Some(space_id) = args.get("space_id").and_then(Value::as_str) {
                argv.push("--space".into());
                argv.push(space_id.into());
            }
            if let Some(types) = args.get("entity_types").and_then(Value::as_array) {
                let joined = types.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(",");
                if !joined.is_empty() {
                    argv.push("--type".into());
                    argv.push(joined);
                }
            }
            if let Some(limit) = args.get("limit").and_then(Value::as_u64) {
                argv.push("--limit".into());
                argv.push(limit.to_string());
            }
            crate::cli::run_for_agent(conn, argv)
        }
        "list" => {
            let entity_type = str_arg(args, "entity_type")?;
            let mut argv = vec![entity_type, "list".into()];
            if let Some(space_id) = args.get("space_id").and_then(Value::as_str) {
                argv.push("--space".into());
                argv.push(space_id.into());
            }
            if args.get("include_deleted").and_then(Value::as_bool) == Some(true) {
                argv.push("--include-deleted".into());
            }
            if let Some(limit) = args.get("limit").and_then(Value::as_u64) {
                argv.push("--limit".into());
                argv.push(limit.to_string());
            }
            crate::cli::run_for_agent(conn, argv)
        }
        "get" => {
            let entity_type = str_arg(args, "entity_type")?;
            let id = str_arg(args, "id")?;
            crate::cli::run_for_agent(conn, vec![entity_type, "get".into(), id])
        }
        "create" => {
            let entity_type = str_arg(args, "entity_type")?;
            let space_id = str_arg(args, "space_id")?;
            let title = str_arg(args, "title")?;
            let mut argv = vec![entity_type, "create".into(), "--space".into(), space_id, "--title".into(), title];
            if let Some(icon) = args.get("icon").and_then(Value::as_str) {
                argv.push("--icon".into());
                argv.push(icon.into());
            }
            push_fields(&mut argv, args.get("fields"));
            if dry_run {
                argv.push("--dry-run".into());
            }
            crate::cli::run_for_agent(conn, argv)
        }
        "update" => {
            let entity_type = str_arg(args, "entity_type")?;
            let id = str_arg(args, "id")?;
            let mut argv = vec![entity_type, "update".into(), id];
            if let Some(title) = args.get("title").and_then(Value::as_str) {
                argv.push("--title".into());
                argv.push(title.into());
            }
            if let Some(icon) = args.get("icon").and_then(Value::as_str) {
                argv.push("--icon".into());
                argv.push(icon.into());
            }
            if let Some(pinned) = args.get("pinned").and_then(Value::as_bool) {
                argv.push("--pinned".into());
                argv.push(pinned.to_string());
            }
            if let Some(space_id) = args.get("space_id").and_then(Value::as_str) {
                argv.push("--space".into());
                argv.push(space_id.into());
            }
            push_fields(&mut argv, args.get("fields"));
            if dry_run {
                argv.push("--dry-run".into());
            }
            crate::cli::run_for_agent(conn, argv)
        }
        "delete" => {
            let entity_type = str_arg(args, "entity_type")?;
            let id = str_arg(args, "id")?;
            let mut argv = vec![entity_type, "delete".into(), id];
            argv.push(if dry_run { "--dry-run".into() } else { "--yes".into() });
            crate::cli::run_for_agent(conn, argv)
        }
        "restore" => {
            let entity_type = str_arg(args, "entity_type")?;
            let id = str_arg(args, "id")?;
            let mut argv = vec![entity_type, "restore".into(), id];
            if dry_run {
                argv.push("--dry-run".into());
            }
            crate::cli::run_for_agent(conn, argv)
        }
        "relate" => {
            let from_id = str_arg(args, "from_id")?;
            let relationship_type = str_arg(args, "relationship_type")?;
            let to_ids: Vec<String> = args
                .get("to_ids")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
                .unwrap_or_default();
            if to_ids.is_empty() {
                return Err(AppError::InvalidInput("relate needs at least one to_id".into()));
            }
            let mut argv = vec!["relate".into(), from_id, relationship_type];
            argv.extend(to_ids);
            argv.push(if dry_run { "--dry-run".into() } else { "--yes".into() });
            crate::cli::run_for_agent(conn, argv)
        }
        "unrelate" => {
            let relationship_id = str_arg(args, "relationship_id")?;
            let mut argv = vec!["unrelate".into(), relationship_id];
            argv.push(if dry_run { "--dry-run".into() } else { "--yes".into() });
            crate::cli::run_for_agent(conn, argv)
        }
        "run_action" => {
            let entity_type = str_arg(args, "entity_type")?;
            let id = str_arg(args, "id")?;
            let action = str_arg(args, "action")?;
            let mut argv = vec![entity_type, action, id];
            push_fields(&mut argv, args.get("fields"));
            argv.push(if dry_run { "--dry-run".into() } else { "--yes".into() });
            crate::cli::run_for_agent(conn, argv)
        }
        other => Err(AppError::InvalidInput(format!("unknown tool '{other}'"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::spaces::create_space;

    fn setup() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS.to_latest(&mut conn).unwrap();
        conn
    }

    /// A `create`/`get`/action result is wrapped as `{ entityType, data: { entity: \
    /// { id, key, type, .. }, ...moduleFields }, relationships, labels, mentionedIn }`
    /// (`cli::enrich`) — this is the base entity id/key every test reads through.
    fn entity_of(value: &Value) -> &Value {
        &value["data"]["entity"]
    }

    #[test]
    fn schema_and_describe_reach_the_registry() {
        let conn = setup();
        let schema = call(&conn, "schema", &json!({}), false).unwrap();
        assert!(schema["entityTypes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|t| t["entityType"] == "task"));

        let described = call(&conn, "describe", &json!({ "entity_type": "task" }), false).unwrap();
        assert_eq!(described["entityType"], "task");
        assert!(described["actions"]
            .as_array()
            .unwrap()
            .iter()
            .any(|a| a["name"] == "convert-to-subtask"));
    }

    #[test]
    fn dry_run_create_does_not_persist() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let args = json!({ "entity_type": "task", "space_id": space.id, "title": "Draft task" });

        let preview = call(&conn, "create", &args, true).unwrap();
        assert_eq!(preview["dryRun"], true);

        let listed = call(&conn, "list", &json!({ "entity_type": "task", "space_id": space.id }), false).unwrap();
        assert_eq!(listed["count"], 0, "a dry run must not leave a row behind");

        let applied = call(&conn, "create", &args, false).unwrap();
        assert!(entity_of(&applied)["id"].is_string());
        let listed = call(&conn, "list", &json!({ "entity_type": "task", "space_id": space.id }), false).unwrap();
        assert_eq!(listed["count"], 1);
    }

    #[test]
    fn run_action_reaches_a_registered_entity_action() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let parent = call(
            &conn,
            "create",
            &json!({ "entity_type": "task", "space_id": space.id, "title": "Parent" }),
            false,
        )
        .unwrap();
        let child = call(
            &conn,
            "create",
            &json!({ "entity_type": "task", "space_id": space.id, "title": "Child" }),
            false,
        )
        .unwrap();

        let result = call(
            &conn,
            "run_action",
            &json!({
                "entity_type": "task",
                "id": entity_of(&child)["id"],
                "action": "convert-to-subtask",
                "fields": { "parent_entity_id": entity_of(&parent)["id"] },
            }),
            false,
        )
        .unwrap();
        assert_eq!(entity_of(&result)["type"], "sub_task");
    }

    #[test]
    fn navigate_resolves_by_key() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let created = call(
            &conn,
            "create",
            &json!({ "entity_type": "task", "space_id": space.id, "title": "Find me" }),
            false,
        )
        .unwrap();
        let key = entity_of(&created)["key"].as_str().unwrap().to_string();

        let navigated = call(&conn, "navigate", &json!({ "id": key }), false).unwrap();
        assert_eq!(navigated["id"], entity_of(&created)["id"]);
        assert_eq!(navigated["entityType"], "task");
    }
}
