use crate::db::entities::Entity;
use crate::db::relationships::{Cardinality, RelationshipTypeDef};
use crate::db::schema::{CreateInput, EntitySchemaDef, FieldDef, FieldKind, JsonMap};
use crate::error::AppResult;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

inventory::submit! {
    RelationshipTypeDef { name: "assignment-course", inverse_label: "has assignment", cardinality: Cardinality::OneToPerFrom }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Assignment {
    pub entity: Entity,
    pub due_date: Option<String>,
    pub status: String,
    pub grade: Option<f64>,
}

fn row_to_assignment(row: &rusqlite::Row) -> rusqlite::Result<Assignment> {
    Ok(Assignment {
        entity: crate::db::entities::row_to_entity(row)?,
        due_date: row.get("due_date")?,
        status: row.get("status")?,
        grade: row.get("grade")?,
    })
}

pub fn create_assignment(
    conn: &Connection,
    space_id: String,
    title: String,
    course_id: String,
    due_date: Option<String>,
) -> AppResult<Assignment> {
    let entity =
        crate::db::entities::create_entity(conn, space_id, "assignment".into(), title, None)?;
    conn.execute(
        "INSERT INTO assignments (entity_id, due_date, status, grade) VALUES (?1, ?2, 'not_started', NULL)",
        params![entity.id, due_date],
    )?;
    crate::db::relationships::create_relationship(
        conn,
        entity.id.clone(),
        course_id,
        "assignment-course".into(),
        None,
        None,
    )?;
    Ok(Assignment {
        entity,
        due_date,
        status: "not_started".into(),
        grade: None,
    })
}

pub fn list_assignments(conn: &Connection, space_id: &str) -> AppResult<Vec<Assignment>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, a.due_date, a.status, a.grade FROM entities e
         JOIN assignments a ON a.entity_id = e.id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY a.due_date ASC",
    )?;
    let rows = stmt.query_map(params![space_id], row_to_assignment)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Cross-Space, for the Dashboard briefing's Exam/Assignment clause.
pub fn list_assignments_all_spaces(conn: &Connection) -> AppResult<Vec<Assignment>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, a.due_date, a.status, a.grade FROM entities e
         JOIN assignments a ON a.entity_id = e.id
         WHERE e.deleted_at IS NULL ORDER BY a.due_date ASC",
    )?;
    let rows = stmt.query_map([], row_to_assignment)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn update_assignment_status(
    conn: &Connection,
    entity_id: &str,
    status: String,
    grade: Option<f64>,
) -> AppResult<()> {
    conn.execute(
        "UPDATE assignments SET status = ?1, grade = ?2 WHERE entity_id = ?3",
        params![status, grade, entity_id],
    )?;
    Ok(())
}

pub fn get_assignment(conn: &Connection, entity_id: &str) -> AppResult<Assignment> {
    conn.query_row(
        "SELECT e.*, a.due_date, a.status, a.grade FROM entities e
         JOIN assignments a ON a.entity_id = e.id WHERE e.id = ?1",
        params![entity_id],
        row_to_assignment,
    )
    .optional()?
    .ok_or_else(|| crate::error::AppError::NotFound(format!("assignment {entity_id}")))
}

// --- CLI schema registration (PLAN.md §1/§3) -------------------------------

const ASSIGNMENT_FIELDS: &[FieldDef] = &[
    FieldDef {
        name: "courseId",
        kind: FieldKind::EntityRef("course"),
        required_on_create: true,
        writable_on_update: false,
        description: "The Course this assignment belongs to (structural: exactly one).",
    },
    FieldDef {
        name: "dueDate",
        kind: FieldKind::Date,
        required_on_create: false,
        writable_on_update: false,
        description: "ISO date. Set at creation only.",
    },
    FieldDef {
        name: "status",
        kind: FieldKind::Enum(&["not_started", "in_progress", "submitted", "graded"]),
        required_on_create: false,
        writable_on_update: true,
        description: "Defaults to 'not_started' on creation.",
    },
    FieldDef {
        name: "grade",
        kind: FieldKind::Float,
        required_on_create: false,
        writable_on_update: true,
        description: "Grade received.",
    },
];

fn cli_create_assignment(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    let course_id = crate::db::schema::require_str(&input.fields, "courseId")?;
    let due_date = crate::db::schema::field_str(&input.fields, "dueDate");
    let assignment = create_assignment(conn, input.space_id, input.title, course_id, due_date)?;
    Ok(serde_json::to_value(assignment).expect("Assignment always serializes"))
}

fn cli_update_assignment(
    conn: &Connection,
    id: &str,
    fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    let current = get_assignment(conn, id)?;
    let status = crate::db::schema::field_str(fields, "status").unwrap_or(current.status);
    let grade = crate::db::schema::field_f64(fields, "grade").or(current.grade);
    update_assignment_status(conn, id, status, grade)?;
    cli_get_assignment(conn, id)
}

fn cli_get_assignment(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    Ok(serde_json::to_value(get_assignment(conn, id)?).expect("Assignment always serializes"))
}

fn cli_list_assignments(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id.ok_or_else(|| {
        crate::error::AppError::InvalidInput("assignment list requires --space <space-id>".into())
    })?;
    Ok(list_assignments(conn, space_id)?
        .into_iter()
        .map(|a| serde_json::to_value(a).expect("Assignment always serializes"))
        .collect())
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "assignment",
        supports_blocks: false,
        description: "A gradeable assignment belonging to exactly one Course.",
        fields: ASSIGNMENT_FIELDS,
        relationship_types: &["assignment-course", "relates-to"],
        create: cli_create_assignment,
        update: cli_update_assignment,
        get: cli_get_assignment,
        list: cli_list_assignments,
    }
}
