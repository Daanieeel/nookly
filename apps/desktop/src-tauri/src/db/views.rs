use crate::db::entities::Entity;
use crate::db::schema::{CreateInput, EntitySchemaDef, FieldDef, FieldKind, JsonMap};
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

/// Modules whose page can be saved as a View. Mirrors `VIEW_MODULES` in
/// `packages/frontend/src/lib/api/views.ts`.
pub const VIEW_MODULES: &[&str] = &["tasks", "assignments"];

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

/// Puts the Space's Views of `module` in the order of `ids`. `ids` must name each of
/// them exactly once, so a stale list (a View created or trashed meanwhile) is
/// refused instead of scrambling the order.
pub fn reorder_views(
    conn: &Connection,
    space_id: &str,
    module: &str,
    ids: &[String],
) -> AppResult<()> {
    check_module(module)?;
    let mut current: Vec<String> = list_views(conn, space_id, Some(module))?
        .into_iter()
        .map(|v| v.entity.id)
        .collect();
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
        description: "JSON object holding the View's filters and display options, as the app saves it. Defaults to '{}', which opens the module with its default display.",
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
    let view = create_view(conn, input.space_id, input.title, module, config, None)?;
    Ok(serde_json::to_value(view).expect("View always serializes"))
}

fn cli_update_view(conn: &Connection, id: &str, fields: &JsonMap) -> AppResult<serde_json::Value> {
    if let Some(config) = crate::db::schema::field_str(fields, "config") {
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
            &space.id,
            "tasks",
            &[c.clone(), a.clone(), b.clone()],
        )
        .unwrap();
        assert_eq!(order(), [c.clone(), a.clone(), b.clone()]);

        // A missing or unknown id changes nothing.
        assert!(reorder_views(&conn, &space.id, "tasks", &[a.clone(), b.clone()]).is_err());
        assert!(reorder_views(&conn, &space.id, "tasks", &[a, b, "nope".into()]).is_err());
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
}
