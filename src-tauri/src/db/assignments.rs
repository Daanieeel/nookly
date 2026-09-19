use crate::db::entities::Entity;
use crate::db::relationships::{Cardinality, RelationshipTypeDef};
use crate::error::AppResult;
use rusqlite::{params, Connection};
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
