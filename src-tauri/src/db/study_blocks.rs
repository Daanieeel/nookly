use crate::db::entities::Entity;
use crate::db::relationships::{Cardinality, RelationshipTypeDef};
use crate::error::AppResult;
use rusqlite::{params, Connection};
use serde::Serialize;

inventory::submit! {
    RelationshipTypeDef { name: "study-block-exam", inverse_label: "has study block", cardinality: Cardinality::OneToPerFrom }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyBlock {
    pub entity: Entity,
    pub date: String,
    pub start_time: String,
    pub end_time: String,
}

fn row_to_study_block(row: &rusqlite::Row) -> rusqlite::Result<StudyBlock> {
    Ok(StudyBlock {
        entity: crate::db::entities::row_to_entity(row)?,
        date: row.get("date")?,
        start_time: row.get("start_time")?,
        end_time: row.get("end_time")?,
    })
}

#[allow(clippy::too_many_arguments)]
pub fn create_study_block(
    conn: &Connection,
    space_id: String,
    title: String,
    exam_id: String,
    date: String,
    start_time: String,
    end_time: String,
) -> AppResult<StudyBlock> {
    let entity =
        crate::db::entities::create_entity(conn, space_id, "study_block".into(), title, None)?;
    conn.execute(
        "INSERT INTO study_blocks (entity_id, date, start_time, end_time) VALUES (?1, ?2, ?3, ?4)",
        params![entity.id, date, start_time, end_time],
    )?;
    crate::db::relationships::create_relationship(
        conn,
        entity.id.clone(),
        exam_id,
        "study-block-exam".into(),
        None,
        None,
    )?;
    Ok(StudyBlock {
        entity,
        date,
        start_time,
        end_time,
    })
}

pub fn list_study_blocks(conn: &Connection, space_id: &str) -> AppResult<Vec<StudyBlock>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, s.date, s.start_time, s.end_time FROM entities e
         JOIN study_blocks s ON s.entity_id = e.id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY s.date ASC, s.start_time ASC",
    )?;
    let rows = stmt.query_map(params![space_id], row_to_study_block)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
