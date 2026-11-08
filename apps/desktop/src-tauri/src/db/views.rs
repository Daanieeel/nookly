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

/// The `version` the app writes View configs with. A config without one is version 1.
/// Mirrors `VIEW_CONFIG_VERSION` in `packages/frontend/src/features/views/engine/types.ts`.
pub const VIEW_CONFIG_VERSION: i64 = 2;

/// The entity type a module page's Views show. Mirrors `viewSourceOf` in
/// `packages/frontend/src/lib/api/views.ts`.
pub fn source_of(module: &str) -> &'static str {
    match module {
        "tasks" | "tasks-overview" => "task",
        _ => "assignment",
    }
}

/// The `version` a stored config says it has, 1 when it has none or can't be read.
fn stored_version(config: &str) -> i64 {
    serde_json::from_str::<serde_json::Value>(config)
        .ok()
        .and_then(|v| v.get("version").and_then(serde_json::Value::as_i64))
        .unwrap_or(1)
}

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
    crate::db::atomically(conn, || {
        let entity =
            crate::db::entities::create_entity(conn, space_id, "view".into(), title, icon)?;
        // Joins at the end, after every View that already has a position.
        let position: i64 = conn.query_row(
            "SELECT COALESCE(MAX(position), 0) + 1 FROM views",
            [],
            |row| row.get(0),
        )?;
        conn.execute(
            "INSERT INTO views (entity_id, module, config, position) VALUES (?1, ?2, ?3, ?4)",
            params![entity.id, module, config, position],
        )?;
        Ok(View {
            entity,
            module,
            config,
            position,
        })
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
    // A newer Nookly may have stored what this one can't read; saving over it would lose it.
    if stored_version(&get_view(conn, entity_id)?.config) > VIEW_CONFIG_VERSION {
        return Err(AppError::InvalidInput(
            "this View was saved by a newer version of Nookly. Update Nookly to change it".into(),
        ));
    }
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
    crate::db::atomically(conn, || {
        for (position, id) in ids.iter().enumerate() {
            conn.execute(
                "UPDATE views SET position = ?1 WHERE entity_id = ?2",
                params![position as i64, id],
            )?;
        }
        Ok(())
    })
}

// --- CLI config validation --------------------------------------------------

const AGE_VALUES: &[&str] = &["today", "week", "last", "earlier"];
const DATE_VALUES: &[&str] = &["overdue", "today", "week", "later", "none"];
const LAYOUTS: &[&str] = &["list", "board", "table"];
/// The layouts that group and can show their empty groups.
const GROUPED_LAYOUTS: &[&str] = &["list", "board"];
const SCOPE_DIRECTIONS: &[&str] = &["outgoing", "incoming", "both"];

/// How a field of a source compares, which decides the conditions it takes.
#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Text,
    Number,
    Date,
    /// An option (a status) or the entities it points at (labels, a Course): only the
    /// text conditions and the empty checks.
    Choice,
}

/// The table columns and condition fields of each source. Mirrors the field registry in
/// `packages/frontend/src/features/views/engine/sources/`.
const TASK_FIELDS: &[(&str, Kind)] = &[
    ("key", Kind::Text),
    ("title", Kind::Text),
    ("status", Kind::Choice),
    ("labels", Kind::Choice),
    ("start", Kind::Date),
    ("due", Kind::Date),
    ("effort", Kind::Number),
    ("course", Kind::Choice),
    ("completedAt", Kind::Date),
    ("space", Kind::Choice),
    ("created", Kind::Date),
    ("updated", Kind::Date),
];
const ASSIGNMENT_FIELDS: &[(&str, Kind)] = &[
    ("key", Kind::Text),
    ("title", Kind::Text),
    ("status", Kind::Choice),
    ("due", Kind::Date),
    ("course", Kind::Choice),
    ("grade", Kind::Number),
    ("weight", Kind::Number),
    ("evaluatedAt", Kind::Date),
    ("space", Kind::Choice),
    ("created", Kind::Date),
    ("updated", Kind::Date),
];

fn fields_of(source: &str) -> &'static [(&'static str, Kind)] {
    if source == "task" {
        TASK_FIELDS
    } else {
        ASSIGNMENT_FIELDS
    }
}

const ANY_KIND: &[Kind] = &[Kind::Text, Kind::Number, Kind::Date, Kind::Choice];

/// The richer filters, and the kinds of field each fits.
const CONDITION_OPERATORS: &[(&str, &[Kind])] = &[
    ("isEmpty", ANY_KIND),
    ("isNotEmpty", ANY_KIND),
    ("contains", &[Kind::Text, Kind::Choice]),
    ("notContains", &[Kind::Text, Kind::Choice]),
    ("before", &[Kind::Date]),
    ("after", &[Kind::Date]),
    ("between", &[Kind::Date]),
    ("eq", &[Kind::Number]),
    ("lt", &[Kind::Number]),
    ("lte", &[Kind::Number]),
    ("gt", &[Kind::Number]),
    ("gte", &[Kind::Number]),
];

fn is_day(value: &str) -> bool {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok() && value.len() == 10
}

/// Checks one richer filter: its field fits its operator, and its values fit both.
fn validate_condition(
    source: &str,
    id: &str,
    operator: &str,
    kinds: &[Kind],
    filter: &serde_json::Value,
) -> AppResult<()> {
    let Some((_, kind)) = fields_of(source).iter().find(|(name, _)| *name == id) else {
        let names: Vec<_> = fields_of(source).iter().map(|(n, _)| *n).collect();
        return Err(bad(format!(
            "unknown field '{id}' for {operator}. Use one of: {}",
            names.join(", ")
        )));
    };
    if !kinds.contains(kind) {
        return Err(bad(format!("'{operator}' does not fit field '{id}'")));
    }
    if filter.get("join").is_some() {
        return Err(bad(format!(
            "'{operator}' takes no join; conditions always join with and"
        )));
    }
    let values = string_list(
        "filter values",
        filter.get("values").unwrap_or(&serde_json::Value::Null),
    )?;
    let ok = match operator {
        "isEmpty" | "isNotEmpty" => true,
        "contains" | "notContains" => values.len() == 1 && !values[0].trim().is_empty(),
        "before" | "after" => values.len() == 1 && is_day(values[0]),
        "between" => values.len() == 2 && values.iter().all(|v| is_day(v)),
        _ => values.len() == 1 && values[0].trim().parse::<f64>().is_ok_and(f64::is_finite),
    };
    if ok {
        Ok(())
    } else {
        Err(bad(format!(
            "values of '{operator}' on '{id}' must be: {}",
            match operator {
                "contains" | "notContains" => "one text",
                "before" | "after" => "one day as YYYY-MM-DD",
                "between" => "two days as YYYY-MM-DD",
                _ => "one number",
            }
        )))
    }
}

/// Checks the table layout's sort and columns against the source's fields.
fn validate_table(source: &str, table: &serde_json::Value) -> AppResult<()> {
    let table = table
        .as_object()
        .ok_or_else(|| bad("display.table must be an object".into()))?;
    let known = |field: &serde_json::Value, what: &str| -> AppResult<()> {
        let names: Vec<_> = fields_of(source).iter().map(|(n, _)| *n).collect();
        one_of(what, field, &names)
    };
    for (key, value) in table {
        let entries = value
            .as_array()
            .ok_or_else(|| bad(format!("display.table.{key} must be an array")))?;
        match key.as_str() {
            "sort" => {
                for rule in entries {
                    known(
                        rule.get("field").unwrap_or(&serde_json::Value::Null),
                        "display.table.sort field",
                    )?;
                    one_of(
                        "display.table.sort direction",
                        rule.get("direction").unwrap_or(&serde_json::Value::Null),
                        &["asc", "desc"],
                    )?;
                }
            }
            "columns" => {
                for column in entries {
                    known(
                        column.get("field").unwrap_or(&serde_json::Value::Null),
                        "display.table.columns field",
                    )?;
                    if column.get("width").is_some_and(|w| !w.is_number()) {
                        return Err(bad("a column width must be a number of pixels".into()));
                    }
                }
            }
            other => return Err(bad(format!("unknown display.table option '{other}'"))),
        }
    }
    Ok(())
}

/// Checks `version`, `source` and `scope`, the keys a config says about itself.
fn validate_meta(module: &str, root: &serde_json::Map<String, serde_json::Value>) -> AppResult<()> {
    if let Some(version) = root.get("version") {
        if !version
            .as_i64()
            .is_some_and(|v| (1..=VIEW_CONFIG_VERSION).contains(&v))
        {
            return Err(bad(format!(
                "version must be a number from 1 to {VIEW_CONFIG_VERSION}"
            )));
        }
    }
    if let Some(source) = root.get("source") {
        one_of("source", source, &[source_of(module)])?;
    }
    if let Some(scope) = root.get("scope") {
        let relationship = scope
            .get("relationship")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("");
        if crate::db::relationships::lookup_relationship_type(relationship).is_none() {
            return Err(bad(format!(
                "scope.relationship '{relationship}' is not a relationship type"
            )));
        }
        one_of(
            "scope.direction",
            scope.get("direction").unwrap_or(&serde_json::Value::Null),
            SCOPE_DIRECTIONS,
        )?;
    }
    Ok(())
}

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
                "completedAt",
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
                Some(&["not_started", "in_progress", "submitted", "evaluated"]),
            ),
            (
                "due",
                Some(&["overdue", "today", "week", "next", "later", "none", "done"]),
            ),
            ("grade", Some(&["graded", "none", "ungraded"])),
            (
                "evaluatedAt",
                Some(&["today", "week", "last", "earlier", "none"]),
            ),
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
                Some(&["not_started", "in_progress", "submitted", "evaluated"]),
            ),
            (
                "due",
                Some(&["overdue", "today", "week", "next", "later", "none", "done"]),
            ),
            ("grade", Some(&["graded", "none", "ungraded"])),
            (
                "evaluatedAt",
                Some(&["today", "week", "last", "earlier", "none"]),
            ),
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
    const KEYS: &[&str] = &["version", "source", "scope", "filters", "display"];
    if let Some(key) = root.keys().find(|k| !KEYS.contains(&k.as_str())) {
        return Err(bad(format!(
            "unknown key '{key}'. Use only {}",
            KEYS.join(", ")
        )));
    }
    validate_meta(module, root)?;
    let source = source_of(module);

    if let Some(filters) = root.get("filters") {
        let filters = filters
            .as_array()
            .ok_or_else(|| bad("filters must be an array".into()))?;
        let mut seen = Vec::new();
        let mut conditions = Vec::new();
        for f in filters {
            let id = f.get("fieldId").and_then(|v| v.as_str()).unwrap_or("");
            let operator = f.get("operator").and_then(|v| v.as_str()).unwrap_or("");
            if let Some((_, kinds)) = CONDITION_OPERATORS.iter().find(|(o, _)| *o == operator) {
                if conditions.contains(&(id, operator)) {
                    return Err(bad(format!(
                        "condition '{operator}' on '{id}' appears twice"
                    )));
                }
                conditions.push((id, operator));
                validate_condition(source, id, operator, kinds, f)?;
                continue;
            }
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
            let operators: Vec<_> = ["is", "isNot"]
                .into_iter()
                .chain(CONDITION_OPERATORS.iter().map(|(o, _)| *o))
                .collect();
            one_of(
                "filter operator",
                f.get("operator").unwrap_or(&serde_json::Value::Null),
                &operators,
            )?;
            if let Some(join) = f.get("join") {
                one_of("filter join", join, &["and", "or"])?;
            }
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
                            .all(|(k, b)| GROUPED_LAYOUTS.contains(&k.as_str()) && b.is_boolean())
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
                "table" => validate_table(source, v)?,
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
        description: "JSON object {\"version\":2,\"source\",\"scope\",\"filters\":[{\"fieldId\":..,\"operator\":..,\"values\":[..],\"join\":\"and\"|\"or\"}],\"display\":{\"layout\",\"grouping\",\"subGrouping\",\"ordering\",\"showEmpty\":{\"board\",\"list\"},\"hiddenColumns\":[group ids],\"table\":{\"sort\":[{\"field\",\"direction\":\"asc\"|\"desc\"}],\"columns\":[{\"field\",\"width\":pixels}]}}}, every key optional; '{}' opens the module with its defaults. Checked on write. version: 1 or 2 (the app writes 2). source: the entity type shown, task for tasks and tasks-overview, assignment for assignments and assignments-overview; left out it is read from module. scope: {\"relationship\":a relationship type,\"direction\":\"outgoing\"|\"incoming\"|\"both\"}, shows only the items linked to the page the View sits in (outgoing: the item links to the page); on its module page it is ignored. Option filters use operator \"is\"|\"isNot\" with option values; a filter's optional join says how it connects to the filter before it: \"or\" matches either, \"and\" (the default) needs both, and filters joined by \"or\" group together, so [A, B or, C] reads A and (B or C). Conditions use the other operators on a field, always joined with and: isEmpty and isNotEmpty (values []), contains and notContains (one text, on text and choice fields), before and after (one day YYYY-MM-DD) and between (two days) on date fields, eq, lt, lte, gt and gte (one number) on number fields. Fields, which table.sort and table.columns also name: task: key, title, status, labels, course, space (choice or text), start, due, completedAt, created, updated (date), effort (number). assignment: key, title, status, course, space, due, evaluatedAt, created, updated, grade and weight (number). tasks: filter fields status and labels (ids of the Space's statuses and labels), due and start (overdue|today|week|later|none), created and updated (today|week|last|earlier); grouping status|label|start|due|created|updated|none; ordering due|start|created|updated|title|status; display.properties any of key|status|labels|due|created. assignments: filter fields course (Course ids), status (not_started|in_progress|submitted|evaluated), due (overdue|today|week|next|later|none|done), grade (graded|none|ungraded), evaluatedAt (today|week|last|earlier|none), created and updated (today|week|last|earlier); grouping deadline|created|updated|status|grade|course|none; ordering auto|due|created|updated|title|status|grade. layout is list|board|table, subGrouping takes the grouping values, a board needs a grouping other than none, a table shows table.columns (the type's default columns when empty) sorted by table.sort (the ordering when empty). tasks-overview: the cross-Space Tasks page; like tasks plus a space filter (Space ids) and grouping space, without the labels filter, grouping and property. assignments-overview: the cross-Space Assignments page; like assignments plus a space filter and grouping space.",
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
    crate::error::to_json(view)
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
    crate::error::to_json(get_view(conn, id)?)
}

fn cli_list_views(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id
        .ok_or_else(|| AppError::InvalidInput("view list requires --space <space-id>".into()))?;
    list_views(conn, space_id, None)?
        .into_iter()
        .map(crate::error::to_json)
        .collect::<crate::error::AppResult<Vec<_>>>()
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "view",
        supports_blocks: false,
        description: "A saved View of a module page (Tasks or Assignments): a name plus the filters, conditions and display options (list, board or table) to reopen it with.",
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
        crate::db::test_conn()
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
            "tasks",
            r#"{"filters":[{"fieldId":"due","operator":"is","values":["overdue"]},{"fieldId":"start","operator":"is","values":["today"],"join":"or"}]}"#
        )
        .is_ok());
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
            (
                "tasks",
                r#"{"filters":[{"fieldId":"due","operator":"is","values":["today"],"join":"xor"}]}"#,
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

    #[test]
    fn cli_config_takes_the_view_engine_keys() {
        let good = r#"{"version":2,"source":"assignment","scope":{"relationship":"assignment-course","direction":"outgoing"},"filters":[{"fieldId":"status","operator":"is","values":["submitted"]},{"fieldId":"due","operator":"between","values":["2026-11-01","2026-11-30"]},{"fieldId":"due","operator":"isEmpty","values":[]},{"fieldId":"grade","operator":"gte","values":["4.5"]},{"fieldId":"title","operator":"contains","values":["essay"]}],"display":{"layout":"table","table":{"sort":[{"field":"due","direction":"asc"}],"columns":[{"field":"title","width":320},{"field":"course"}]}}}"#;
        assert!(validate_config("assignments", good).is_ok());
        assert!(validate_config(
            "tasks-overview",
            r#"{"version":1,"source":"task","filters":[{"fieldId":"effort","operator":"lt","values":["3"]},{"fieldId":"created","operator":"after","values":["2026-01-01"]}],"display":{"layout":"table","table":{"sort":[],"columns":[{"field":"space"}]}}}"#
        )
        .is_ok());

        for (module, config) in [
            // A View of a module page shows that module's type.
            ("tasks", r#"{"source":"assignment"}"#),
            ("tasks", r#"{"version":3}"#),
            ("tasks", r#"{"version":"2"}"#),
            (
                "tasks",
                r#"{"scope":{"relationship":"no-such-link","direction":"outgoing"}}"#,
            ),
            (
                "tasks",
                r#"{"scope":{"relationship":"relates-to","direction":"sideways"}}"#,
            ),
            (
                "tasks",
                r#"{"filters":[{"fieldId":"weight","operator":"gt","values":["1"]}]}"#,
            ),
            (
                "tasks",
                r#"{"filters":[{"fieldId":"effort","operator":"before","values":["2026-01-01"]}]}"#,
            ),
            (
                "tasks",
                r#"{"filters":[{"fieldId":"due","operator":"before","values":["soon"]}]}"#,
            ),
            (
                "tasks",
                r#"{"filters":[{"fieldId":"due","operator":"between","values":["2026-01-01"]}]}"#,
            ),
            (
                "tasks",
                r#"{"filters":[{"fieldId":"effort","operator":"gt","values":["many"]}]}"#,
            ),
            (
                "tasks",
                r#"{"filters":[{"fieldId":"title","operator":"contains","values":[""]}]}"#,
            ),
            (
                "tasks",
                r#"{"filters":[{"fieldId":"due","operator":"isEmpty","values":[],"join":"or"}]}"#,
            ),
            (
                "tasks",
                r#"{"display":{"table":{"sort":[{"field":"grade","direction":"asc"}]}}}"#,
            ),
            (
                "tasks",
                r#"{"display":{"table":{"sort":[{"field":"due","direction":"up"}]}}}"#,
            ),
            (
                "tasks",
                r#"{"display":{"table":{"columns":[{"field":"title","width":"wide"}]}}}"#,
            ),
            ("tasks", r#"{"display":{"table":{"rows":[]}}}"#),
            ("tasks", r#"{"display":{"showEmpty":{"table":true}}}"#),
        ] {
            assert!(
                validate_config(module, config).is_err(),
                "{module} {config}"
            );
        }
    }

    #[test]
    fn a_config_saved_by_a_newer_version_is_never_overwritten() {
        let conn = setup();
        let space = create_space(&conn, "Uni".into(), None, "#000".into()).unwrap();
        let newer =
            r#"{"version":99,"filters":[{"fieldId":"due","operator":"someday","values":[]}]}"#;
        let view = create_view(
            &conn,
            space.id.clone(),
            "From the future".into(),
            "tasks".into(),
            newer.into(),
            None,
        )
        .unwrap();
        assert!(update_view_config(&conn, &view.entity.id, r#"{"version":2}"#.into()).is_err());
        assert_eq!(get_view(&conn, &view.entity.id).unwrap().config, newer);

        // A config from before versions, or one that can't be read, saves as usual.
        let old = create_view(
            &conn,
            space.id.clone(),
            "Old".into(),
            "tasks".into(),
            r#"{"filters":[]}"#.into(),
            None,
        )
        .unwrap();
        assert!(update_view_config(&conn, &old.entity.id, r#"{"version":2}"#.into()).is_ok());
    }

    #[test]
    fn migration_46_renames_the_completed_and_evaluated_filter_fields_in_saved_views() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migration_upgrade_tests::migrate_to(&mut conn, 45);
        // The Views stand alone here, without the entities they belong to.
        conn.execute_batch("PRAGMA foreign_keys = OFF").unwrap();
        let config = |fields: &[&str]| {
            let filters: Vec<_> = fields
                .iter()
                .map(|f| format!(r#"{{"fieldId":"{f}","operator":"is","values":["today"]}}"#))
                .collect();
            format!(
                r#"{{"filters":[{}],"display":{{"grouping":"none"}}}}"#,
                filters.join(",")
            )
        };
        let rows = [
            ("tasks", config(&["status", "completed"])),
            ("tasks-overview", config(&["completed"])),
            ("assignments", config(&["evaluated", "grade"])),
            ("assignments-overview", config(&["evaluated"])),
            // A config that is not JSON, or has no filters, is left as it is.
            ("tasks", "nope".to_string()),
            ("tasks", r#"{"display":{}}"#.to_string()),
        ];
        for (n, (module, config)) in rows.iter().enumerate() {
            conn.execute(
                "INSERT INTO views (entity_id, module, config) VALUES (?1, ?2, ?3)",
                params![format!("v{n}"), module, config],
            )
            .unwrap();
        }

        crate::db::migration_upgrade_tests::migrate_to(&mut conn, 46);

        let read = |n: usize| -> String {
            conn.query_row(
                "SELECT config FROM views WHERE entity_id = ?1",
                params![format!("v{n}")],
                |r| r.get(0),
            )
            .unwrap()
        };
        assert_eq!(read(0), config(&["status", "completedAt"]));
        assert_eq!(read(1), config(&["completedAt"]));
        assert_eq!(read(2), config(&["evaluatedAt", "grade"]));
        assert_eq!(read(3), config(&["evaluatedAt"]));
        assert_eq!(read(4), "nope");
        assert_eq!(read(5), r#"{"display":{}}"#);
    }
}
