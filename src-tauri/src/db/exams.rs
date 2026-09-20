use crate::db::entities::Entity;
use crate::db::relationships::{Cardinality, RelationshipTypeDef};
use crate::error::AppResult;
use rusqlite::{params, Connection};
use serde::Serialize;

inventory::submit! {
    RelationshipTypeDef { name: "exam-course", inverse_label: "has exam", cardinality: Cardinality::OneToPerFrom }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Exam {
    pub entity: Entity,
    pub exam_date: Option<String>,
    pub weight: Option<f64>,
    pub grade: Option<f64>,
    pub status: String,
}

fn row_to_exam(row: &rusqlite::Row) -> rusqlite::Result<Exam> {
    Ok(Exam {
        entity: crate::db::entities::row_to_entity(row)?,
        exam_date: row.get("exam_date")?,
        weight: row.get("weight")?,
        grade: row.get("grade")?,
        status: row.get("status")?,
    })
}

pub fn create_exam(
    conn: &Connection,
    space_id: String,
    title: String,
    course_id: String,
    exam_date: Option<String>,
    weight: Option<f64>,
) -> AppResult<Exam> {
    let entity = crate::db::entities::create_entity(conn, space_id, "exam".into(), title, None)?;
    conn.execute(
        "INSERT INTO exams (entity_id, exam_date, weight, grade, status) VALUES (?1, ?2, ?3, NULL, 'upcoming')",
        params![entity.id, exam_date, weight],
    )?;
    crate::db::relationships::create_relationship(
        conn,
        entity.id.clone(),
        course_id,
        "exam-course".into(),
        None,
        None,
    )?;
    Ok(Exam {
        entity,
        exam_date,
        weight,
        grade: None,
        status: "upcoming".into(),
    })
}

pub fn list_exams(conn: &Connection, space_id: &str) -> AppResult<Vec<Exam>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, x.exam_date, x.weight, x.grade, x.status FROM entities e
         JOIN exams x ON x.entity_id = e.id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY x.exam_date ASC",
    )?;
    let rows = stmt.query_map(params![space_id], row_to_exam)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Cross-Space, for the Dashboard briefing's Exam/Assignment clause.
pub fn list_exams_all_spaces(conn: &Connection) -> AppResult<Vec<Exam>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, x.exam_date, x.weight, x.grade, x.status FROM entities e
         JOIN exams x ON x.entity_id = e.id
         WHERE e.deleted_at IS NULL ORDER BY x.exam_date ASC",
    )?;
    let rows = stmt.query_map([], row_to_exam)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn update_exam(
    conn: &Connection,
    entity_id: &str,
    grade: Option<f64>,
    status: Option<String>,
) -> AppResult<()> {
    if let Some(grade) = grade {
        conn.execute(
            "UPDATE exams SET grade = ?1 WHERE entity_id = ?2",
            params![grade, entity_id],
        )?;
    }
    if let Some(status) = status {
        conn.execute(
            "UPDATE exams SET status = ?1 WHERE entity_id = ?2",
            params![status, entity_id],
        )?;
    }
    Ok(())
}
