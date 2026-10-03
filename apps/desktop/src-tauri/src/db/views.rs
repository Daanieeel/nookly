use crate::db::entities::Entity;
use crate::db::schema::{CreateInput, EntitySchemaDef, FieldDef, FieldKind, JsonMap};
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

/// Modules whose page can be saved as a View. Mirrors `VIEW_MODULES` in
/// `packages/frontend/src/lib/api/views.ts`.
pub const VIEW_MODULES: &[&str] = &[
    "tasks",
    "assignments",
    "tasks-overview",
    "assignments-overview",
];

/// `tasks-overview` and `assignments-overview` are the cross-Space pages. Their Views still live in one Space,
/// since every entity does, but show the tasks of all of them.
///
/// A named, per-Space snapshot of one module page: its filters and display
/// options. The backend keeps `config` as opaque JSON; the page that owns the
/// module reads it back and checks every field, so a stale shape only loses
/// that field.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub entity: Entity,
    pub module: String,
    pub config: String,
    /// Sidebar order among the Space's Views of this module, lowest first.
    pub position: i64,
}

fn row_to_view(row: &rusqlite::Row) -> rusqlite::Result<View> {
    Ok(View {
        entity: crate::db::entities::row_to_entity(row)?,
        module: row.get("module")?,
        config: row.get("config")?,
        position: row.get("position")?,
    })
}

fn check_module(module: &str) -> AppResult<()> {
    if VIEW_MODULES.contains(&module) {
        Ok(())
    } else {
        Err(AppError::InvalidInput(format!(
            "views are not available for '{module}'. Use one of: {}",
            VIEW_MODULES.join(", ")
        )))
    }
}

fn check_config(config: &str) -> AppResult<()> {
    match serde_json::from_str::<serde_json::Value>(config) {
        Ok(value) if value.is_object() => Ok(()),
        _ => Err(AppError::InvalidInput(
            "view config must be a JSON object".into(),
        )),
    }
}

pub fn create_view(
    conn: &Connection,
    space_id: String,
    title: String,
    module: String,
    config: String,
    icon: Option<String>,
) -> AppResult<View> {
    check_module(&module)?;
    check_config(&config)?;
    let tx = conn.unchecked_transaction()?;
    let entity = crate::db::entities::create_entity(&tx, space_id, "view".into(), title, icon)?;
    // Joins at the end, after every View that already has a position.
    let position: i64 = tx.query_row(
        "SELECT COALESCE(MAX(position), 0) + 1 FROM views",
        [],
        |row| row.get(0),
    )?;
    tx.execute(
        "INSERT INTO views (entity_id, module, config, position) VALUES (?1, ?2, ?3, ?4)",
        params![entity.id, module, config, position],
    )?;
    tx.commit()?;
    Ok(View {
        entity,
        module,
        config,
        position,
    })
}

/// A Space's Views in sidebar order (position, then oldest first). `module`
/// narrows to one module's Views.
pub fn list_views(conn: &Connection, space_id: &str, module: Option<&str>) -> AppResult<Vec<View>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, v.module, v.config, v.position FROM entities e
         JOIN views v ON v.entity_id = e.id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL AND (?2 IS NULL OR v.module = ?2)
         ORDER BY v.position ASC, e.created_at ASC",
    )?;
    let rows = stmt.query_map(params![space_id, module], row_to_view)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Every Space's Views of `module`, for the cross-Space pages whose Views live in
/// whichever Space they were saved in.
pub fn list_views_everywhere(conn: &Connection, module: &str) -> AppResult<Vec<View>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, v.module, v.config, v.position FROM entities e
         JOIN views v ON v.entity_id = e.id
         WHERE e.deleted_at IS NULL AND v.module = ?1
         ORDER BY v.position ASC, e.created_at ASC",
    )?;
    let rows = stmt.query_map(params![module], row_to_view)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_view(conn: &Connection, entity_id: &str) -> AppResult<View> {
    conn.query_row(
        "SELECT e.*, v.module, v.config, v.position FROM entities e
         JOIN views v ON v.entity_id = e.id WHERE e.id = ?1",
        params![entity_id],
        row_to_view,
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("view {entity_id}")))
}

pub fn update_view_config(conn: &Connection, entity_id: &str, config: String) -> AppResult<View> {
    check_config(&config)?;
    let changed = conn.execute(
        "UPDATE views SET config = ?1 WHERE entity_id = ?2",
        params![config, entity_id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("view {entity_id}")));
    }
    conn.execute(
        "UPDATE entities SET updated_at = ?1 WHERE id = ?2",
        params![super::now(), entity_id],
    )?;
    get_view(conn, entity_id)
}

/// Puts the Views of `module` in the order of `ids`: a Space's own, or with no
/// `space_id` the Views of a cross-Space page from every Space. `ids` must name each of
/// them exactly once, so a stale list (a View created or trashed meanwhile) is
/// refused instead of scrambling the order.
pub fn reorder_views(
    conn: &Connection,
    space_id: Option<&str>,
    module: &str,
    ids: &[String],
) -> AppResult<()> {
    check_module(module)?;
    let listed = match space_id {
        Some(space_id) => list_views(conn, space_id, Some(module))?,
        None => list_views_everywhere(conn, module)?,
    };
    let mut current: Vec<String> = listed.into_iter().map(|v| v.entity.id).collect();
    let mut wanted = ids.to_vec();
    current.sort();
    wanted.sort();
    if current != wanted {
        return Err(AppError::InvalidInput(
            "reorder must list every view of this module exactly once".into(),
        ));
    }
    let tx = conn.unchecked_transaction()?;
    for (position, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE views SET position = ?1 WHERE entity_id = ?2",
            params![position as i64, id],
        )?;
    }
    tx.commit()?;
    Ok(())
}

// --- CLI config validation --------------------------------------------------

const AGE_VALUES: &[&str] = &["today", "week", "last", "earlier"];
const DATE_VALUES: &[&str] = &["overdue", "today", "week", "later", "none"];
const LAYOUTS: &[&str] = &["list", "board"];

/// What one module's View config may contain. Mirrors the filter fields and display
/// options in `packages/frontend/src/features/{tasks,assignments}`. A filter with
/// `None` values takes ids that only exist per Space (statuses, labels, courses).
struct ConfigSpec {
    module: &'static str,
    filters: &'static [(&'static str, Option<&'static [&'static str]>)],
    groupings: &'static [&'static str],
    orderings: &'static [&'static str],
    /// Card and row properties a display can show. Empty when the module has none.
    properties: &'static [&'static str],
}

const CONFIG_SPECS: &[ConfigSpec] = &[
    ConfigSpec {
        module: "tasks",
        filters: &[
            ("status", None),
            ("labels", None),
            ("due", Some(DATE_VALUES)),
            ("start", Some(DATE_VALUES)),
            ("created", Some(AGE_VALUES)),
            ("updated", Some(AGE_VALUES)),
        ],
        groupings: &[
            "status", "label", "start", "due", "created", "updated", "none",
        ],
        orderings: &["due", "start", "created", "updated", "title", "status"],
        properties: &["key", "status", "labels", "due", "created"],
    },
    ConfigSpec {
        module: "tasks-overview",
        filters: &[
            ("space", None),
            ("status", None),
            ("due", Some(DATE_VALUES)),
            ("start", Some(DATE_VALUES)),
            ("created", Some(AGE_VALUES)),
            ("updated", Some(AGE_VALUES)),
            (
                "completed",
                Some(&["today", "week", "last", "earlier", "none"]),
            ),
            ("effort", None),
        ],
        groupings: &[
            "status", "space", "start", "due", "created", "updated", "none",
        ],
        orderings: &["due", "start", "created", "updated", "title", "status"],
        properties: &["key", "status", "due", "effort", "created"],
    },
    ConfigSpec {
        module: "assignments-overview",
        filters: &[
            ("space", None),
            ("course", None),
            (
                "status",
                Some(&["not_started", "in_progress", "submitted", "graded"]),
            ),
            (
                "due",
                Some(&["overdue", "today", "week", "next", "later", "none", "done"]),
            ),
            ("grade", Some(&["graded", "none"])),
            ("created", Some(AGE_VALUES)),
            ("updated", Some(AGE_VALUES)),
        ],
        groupings: &[
            "deadline", "created", "updated", "status", "grade", "course", "space", "none",
        ],
        orderings: &[
            "auto", "due", "created", "updated", "title", "status", "grade",
        ],
        properties: &[],
    },
    ConfigSpec {
        module: "assignments",
        filters: &[
            ("course", None),
            (
                "status",
                Some(&["not_started", "in_progress", "submitted", "graded"]),
            ),
            (
                "due",
                Some(&["overdue", "today", "week", "next", "later", "none", "done"]),
            ),
            ("grade", Some(&["graded", "none"])),
            ("created", Some(AGE_VALUES)),
            ("updated", Some(AGE_VALUES)),
        ],
        groupings: &[
            "deadline", "created", "updated", "status", "grade", "course", "none",
        ],
        orderings: &[
            "auto", "due", "created", "updated", "title", "status", "grade",
        ],
        properties: &[],
    },
];

fn bad(msg: String) -> AppError {
    AppError::InvalidInput(format!("view config: {msg}"))
}

fn one_of(what: &str, value: &serde_json::Value, allowed: &[&str]) -> AppResult<()> {
    match value.as_str() {
        Some(v) if allowed.contains(&v) => Ok(()),
        _ => Err(bad(format!(
            "{what} must be one of: {} (got {value})",
            allowed.join(", ")
        ))),
    }
}

fn string_list<'a>(what: &str, value: &'a serde_json::Value) -> AppResult<Vec<&'a str>> {
    value
        .as_array()
        .and_then(|a| a.iter().map(|v| v.as_str()).collect::<Option<Vec<_>>>())
        .ok_or_else(|| bad(format!("{what} must be an array of strings")))
}

/// Strict check for configs written through the CLI, so a typo is reported instead
/// of quietly falling back to a default when the app opens the View. The app's own
/// saves skip it: it reads back leniently and must never refuse a user's View.
fn validate_config(module: &str, config: &str) -> AppResult<()> {
    let spec = CONFIG_SPECS
        .iter()
        .find(|s| s.module == module)
        .ok_or_else(|| bad(format!("no config format for module '{module}'")))?;
    let value: serde_json::Value = serde_json::from_str(config)
        .map_err(|_| AppError::InvalidInput("view config must be a JSON object".into()))?;
    let root = value
        .as_object()
        .ok_or_else(|| AppError::InvalidInput("view config must be a JSON object".into()))?;
    if let Some(key) = root.keys().find(|k| *k != "filters" && *k != "display") {
        return Err(bad(format!(
            "unknown key '{key}'. Use only 'filters' and 'display'"
        )));
    }

    if let Some(filters) = root.get("filters") {
        let filters = filters
            .as_array()
            .ok_or_else(|| bad("filters must be an array".into()))?;
        let mut seen = Vec::new();
        for f in filters {
            let id = f.get("fieldId").and_then(|v| v.as_str()).unwrap_or("");
            let Some((_, allowed)) = spec.filters.iter().find(|(name, _)| *name == id) else {
                let names: Vec<_> = spec.filters.iter().map(|(n, _)| *n).collect();
                return Err(bad(format!(
                    "unknown filter field '{id}' for {module}. Use one of: {}",
                    names.join(", ")
                )));
            };
            if seen.contains(&id) {
                return Err(bad(format!("filter field '{id}' appears twice")));
            }
            seen.push(id);
            one_of(
                "filter operator",
                f.get("operator").unwrap_or(&serde_json::Value::Null),
                &["is", "isNot"],
            )?;
            let values = string_list(
                "filter values",
                f.get("values").unwrap_or(&serde_json::Value::Null),
            )?;
            if values.is_empty() {
                return Err(bad(format!("filter '{id}' needs at least one value")));
            }
            if let Some(allowed) = allowed {
                if let Some(v) = values.iter().find(|v| !allowed.contains(v)) {
                    return Err(bad(format!(
                        "'{v}' is not a value of filter '{id}'. Use one of: {}",
                        allowed.join(", ")
                    )));
                }
            }
        }
    }

    if let Some(display) = root.get("display") {
        let display = display
            .as_object()
            .ok_or_else(|| bad("display must be an object".into()))?;
        for (key, v) in display {
            match key.as_str() {
                "layout" => one_of("display.layout", v, LAYOUTS)?,
                "grouping" | "subGrouping" => one_of(&format!("display.{key}"), v, spec.groupings)?,
                "ordering" => one_of("display.ordering", v, spec.orderings)?,
                "showEmpty" => {
                    let ok = v.as_object().is_some_and(|o| {
                        o.iter()
                            .all(|(k, b)| LAYOUTS.contains(&k.as_str()) && b.is_boolean())
                    });
                    if !ok {
                        return Err(bad(
                            "display.showEmpty must be an object like {\"board\":true,\"list\":false}"
                                .into(),
                        ));
                    }
                }
                "hiddenColumns" => {
                    string_list("display.hiddenColumns", v)?;
                }
                "properties" if !spec.properties.is_empty() => {
                    let props = string_list("display.properties", v)?;
                    if let Some(p) = props.iter().find(|p| !spec.properties.contains(p)) {
                        return Err(bad(format!(
                            "'{p}' is not a display property. Use: {}",
                            spec.properties.join(", ")
                        )));
                    }
                }
                other => return Err(bad(format!("unknown display option '{other}'"))),
            }
        }
    }
    Ok(())
}

// --- CLI schema registration ------------------------------------------------

const VIEW_FIELDS: &[FieldDef] = &[
    FieldDef {
        name: "module",
        kind: FieldKind::Enum(VIEW_MODULES),
        required_on_create: true,
        writable_on_update: false,
        description: "The module page this View belongs to. Fixed once created.",
    },
    FieldDef {
        name: "config",
        kind: FieldKind::LongText,
        required_on_create: false,
        writable_on_update: true,
        description: "JSON object {\"filters\":[{\"fieldId\":..,\"operator\":\"is\"|\"isNot\",\"values\":[..]}],\"display\":{\"layout\",\"grouping\",\"subGrouping\",\"ordering\",\"showEmpty\":{\"board\",\"list\"},\"hiddenColumns\":[group ids]}}, both keys optional; '{}' opens the module with its default display. Checked on write. tasks: filter fields status and labels (ids of the Space's statuses and labels), due and start (overdue|today|week|later|none), created and updated (today|week|last|earlier); grouping status|label|start|due|created|updated|none; ordering due|start|created|updated|title|status; display.properties any of key|status|labels|due|created. assignments: filter fields course (Course ids), status (not_started|in_progress|submitted|graded), due (overdue|today|week|next|later|none|done), grade (graded|none), created and updated (today|week|last|earlier); grouping deadline|created|updated|status|grade|course|none; ordering auto|due|created|updated|title|status|grade. layout is list|board, subGrouping takes the grouping values, a board needs a grouping other than none. tasks-overview: the cross-Space Tasks page; like tasks plus a space filter (Space ids) and grouping space, without the labels filter, grouping and property. assignments-overview: the cross-Space Assignments page; like assignments plus a space filter and grouping space.",
    },
    FieldDef {
        name: "position",
        kind: FieldKind::Integer,
        required_on_create: false,
        writable_on_update: true,
        description: "Sidebar order among the Space's Views of this module, lowest first. New Views go last.",
    },
];

fn cli_create_view(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    let module = crate::db::schema::require_str(&input.fields, "module")?;
    let config =
        crate::db::schema::field_str(&input.fields, "config").unwrap_or_else(|| "{}".into());
    check_module(&module)?;
    validate_config(&module, &config)?;
    let view = create_view(conn, input.space_id, input.title, module, config, None)?;
    Ok(serde_json::to_value(view).expect("View always serializes"))
}

fn cli_update_view(conn: &Connection, id: &str, fields: &JsonMap) -> AppResult<serde_json::Value> {
    if let Some(config) = crate::db::schema::field_str(fields, "config") {
        validate_config(&get_view(conn, id)?.module, &config)?;
        update_view_config(conn, id, config)?;
    }
    if let Some(position) = crate::db::schema::field_i64(fields, "position") {
        conn.execute(
            "UPDATE views SET position = ?1 WHERE entity_id = ?2",
            params![position, id],
        )?;
    }
    cli_get_view(conn, id)
}

fn cli_get_view(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    Ok(serde_json::to_value(get_view(conn, id)?).expect("View always serializes"))
}

fn cli_list_views(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id
        .ok_or_else(|| AppError::InvalidInput("view list requires --space <space-id>".into()))?;
    Ok(list_views(conn, space_id, None)?
        .into_iter()
        .map(|v| serde_json::to_value(v).expect("View always serializes"))
        .collect())
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "view",
        supports_blocks: false,
        description: "A saved View of a module page (Tasks or Assignments): a name plus the filters and display options to reopen it with.",
        fields: VIEW_FIELDS,
        relationship_types: &["relates-to"],
        create: cli_create_view,
        update: cli_update_view,
        get: cli_get_view,
        list: cli_list_views,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::spaces::create_space;

    fn setup() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        conn
    }

    #[test]
    fn creates_lists_and_updates_a_view() {
        let conn = setup();
        let space = create_space(&conn, "Uni".into(), None, "#000".into()).unwrap();
        let view = create_view(
            &conn,
            space.id.clone(),
            "Due soon".into(),
            "tasks".into(),
            r#"{"filters":[]}"#.into(),
            None,
        )
        .unwrap();
        assert_eq!(view.entity.key, "VEW-1");

        let other = create_view(
            &conn,
            space.id.clone(),
            "Open".into(),
            "assignments".into(),
            "{}".into(),
            None,
        )
        .unwrap();
        assert_eq!(list_views(&conn, &space.id, None).unwrap().len(), 2);
        let tasks = list_views(&conn, &space.id, Some("tasks")).unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].entity.id, view.entity.id);

        let updated = update_view_config(&conn, &other.entity.id, r#"{"a":1}"#.into()).unwrap();
        assert_eq!(updated.config, r#"{"a":1}"#);
    }

    #[test]
    fn cross_space_views_reorder_across_spaces() {
        let conn = setup();
        let one = create_space(&conn, "One".into(), None, "#000".into()).unwrap();
        let two = create_space(&conn, "Two".into(), None, "#111".into()).unwrap();
        let make = |space: &str, title: &str| {
            create_view(
                &conn,
                space.into(),
                title.into(),
                "tasks-overview".into(),
                "{}".into(),
                None,
            )
            .unwrap()
            .entity
            .id
        };
        let (a, b) = (make(&one.id, "A"), make(&two.id, "B"));
        let order = || -> Vec<String> {
            list_views_everywhere(&conn, "tasks-overview")
                .unwrap()
                .into_iter()
                .map(|v| v.entity.id)
                .collect()
        };
        assert_eq!(order(), [a.clone(), b.clone()]);
        reorder_views(&conn, None, "tasks-overview", &[b.clone(), a.clone()]).unwrap();
        assert_eq!(order(), [b.clone(), a.clone()]);
        // A list missing one of the Spaces' Views is refused.
        assert!(reorder_views(&conn, None, "tasks-overview", &[a]).is_err());
    }

    #[test]
    fn reorders_views_and_refuses_a_stale_list() {
        let conn = setup();
        let space = create_space(&conn, "Uni".into(), None, "#000".into()).unwrap();
        let make = |title: &str| {
            create_view(
                &conn,
                space.id.clone(),
                title.into(),
                "tasks".into(),
                "{}".into(),
                None,
            )
            .unwrap()
            .entity
            .id
        };
        let (a, b, c) = (make("A"), make("B"), make("C"));
        let order = || -> Vec<String> {
            list_views(&conn, &space.id, Some("tasks"))
                .unwrap()
                .into_iter()
                .map(|v| v.entity.id)
                .collect()
        };
        assert_eq!(order(), [a.clone(), b.clone(), c.clone()]);

        reorder_views(
            &conn,
            Some(&space.id),
            "tasks",
            &[c.clone(), a.clone(), b.clone()],
        )
        .unwrap();
        assert_eq!(order(), [c.clone(), a.clone(), b.clone()]);

        // A missing or unknown id changes nothing.
        assert!(reorder_views(&conn, Some(&space.id), "tasks", &[a.clone(), b.clone()]).is_err());
        assert!(reorder_views(&conn, Some(&space.id), "tasks", &[a, b, "nope".into()]).is_err());
        assert_eq!(order()[0], c);

        // A View made afterwards lands last.
        let d = make("D");
        assert_eq!(order().last(), Some(&d));
    }

    #[test]
    fn refuses_a_bad_module_or_config() {
        let conn = setup();
        let space = create_space(&conn, "Uni".into(), None, "#000".into()).unwrap();
        let create = |module: &str, config: &str| {
            create_view(
                &conn,
                space.id.clone(),
                "V".into(),
                module.into(),
                config.into(),
                None,
            )
        };
        assert!(create("notes", "{}").is_err());
        assert!(create("tasks", "not json").is_err());
        assert!(create("tasks", "[]").is_err());
        // A refused create leaves no half made entity behind.
        assert!(list_views(&conn, &space.id, None).unwrap().is_empty());
        let entities: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM entities WHERE type = 'view'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(entities, 0);
    }

    #[test]
    fn cli_config_is_checked_against_the_module() {
        let good = r#"{"filters":[{"fieldId":"due","operator":"is","values":["overdue"]},{"fieldId":"labels","operator":"isNot","values":["any-label-id"]}],"display":{"layout":"board","grouping":"updated","subGrouping":"status","ordering":"start","showEmpty":{"board":true,"list":false},"hiddenColumns":["x"],"properties":["key","due"]}}"#;
        assert!(validate_config("tasks", good).is_ok());
        assert!(validate_config("tasks", "{}").is_ok());
        assert!(validate_config(
            "tasks-overview",
            r#"{"filters":[{"fieldId":"space","operator":"is","values":["any-space-id"]}],"display":{"grouping":"space"}}"#
        )
        .is_ok());
        assert!(validate_config(
            "tasks",
            r#"{"filters":[{"fieldId":"space","operator":"is","values":["x"]}]}"#
        )
        .is_err());
        assert!(validate_config(
            "assignments",
            r#"{"display":{"ordering":"grade","grouping":"grade"}}"#
        )
        .is_ok());

        for (module, config) in [
            (
                "tasks",
                r#"{"filters":[{"fieldId":"grade","operator":"is","values":["graded"]}]}"#,
            ),
            (
                "tasks",
                r#"{"filters":[{"fieldId":"due","operator":"is","values":["next"]}]}"#,
            ),
            (
                "tasks",
                r#"{"filters":[{"fieldId":"due","operator":"eq","values":["today"]}]}"#,
            ),
            (
                "tasks",
                r#"{"filters":[{"fieldId":"due","operator":"is","values":[]}]}"#,
            ),
            ("tasks", r#"{"display":{"grouping":"course"}}"#),
            ("tasks", r#"{"display":{"ordering":"grade"}}"#),
            ("tasks", r#"{"display":{"layout":"grid"}}"#),
            ("tasks", r#"{"display":{"colour":"red"}}"#),
            ("assignments", r#"{"display":{"properties":["key"]}}"#),
            ("assignments", r#"{"display":{"grouping":"label"}}"#),
            ("tasks", r#"{"grouping":"status"}"#),
        ] {
            assert!(
                validate_config(module, config).is_err(),
                "{module} {config}"
            );
        }
    }
}
