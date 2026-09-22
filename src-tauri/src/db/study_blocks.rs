use crate::db::entities::Entity;
use crate::db::relationships::{Cardinality, RelationshipTypeDef};
use crate::db::schema::{CreateInput, EntitySchemaDef, FieldDef, FieldKind, JsonMap};
use crate::error::AppResult;
use rusqlite::{params, Connection, OptionalExtension};
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

pub fn get_study_block(conn: &Connection, entity_id: &str) -> AppResult<StudyBlock> {
    conn.query_row(
        "SELECT e.*, s.date, s.start_time, s.end_time FROM entities e
         JOIN study_blocks s ON s.entity_id = e.id WHERE e.id = ?1",
        params![entity_id],
        row_to_study_block,
    )
    .optional()?
    .ok_or_else(|| crate::error::AppError::NotFound(format!("study block {entity_id}")))
}

// --- CLI schema registration (PLAN.md §1/§3) -------------------------------

const STUDY_BLOCK_FIELDS: &[FieldDef] = &[
    FieldDef {
        name: "examId",
        kind: FieldKind::EntityRef("exam"),
        required_on_create: true,
        writable_on_update: false,
        description: "The Exam this study block belongs to (structural: exactly one).",
    },
    FieldDef {
        name: "date",
        kind: FieldKind::Date,
        required_on_create: true,
        writable_on_update: false,
        description: "ISO date. Set at creation only.",
    },
    FieldDef {
        name: "startTime",
        kind: FieldKind::Text,
        required_on_create: true,
        writable_on_update: false,
        description: "\"HH:MM\", 24-hour. Set at creation only.",
    },
    FieldDef {
        name: "endTime",
        kind: FieldKind::Text,
        required_on_create: true,
        writable_on_update: false,
        description: "\"HH:MM\", 24-hour. Set at creation only.",
    },
];

fn cli_create_study_block(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    let exam_id = crate::db::schema::require_str(&input.fields, "examId")?;
    let date = crate::db::schema::require_str(&input.fields, "date")?;
    let start_time = crate::db::schema::require_str(&input.fields, "startTime")?;
    let end_time = crate::db::schema::require_str(&input.fields, "endTime")?;
    let block = create_study_block(
        conn,
        input.space_id,
        input.title,
        exam_id,
        date,
        start_time,
        end_time,
    )?;
    Ok(serde_json::to_value(block).expect("StudyBlock always serializes"))
}

fn cli_update_study_block(
    conn: &Connection,
    id: &str,
    _fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    cli_get_study_block(conn, id)
}

fn cli_get_study_block(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    Ok(serde_json::to_value(get_study_block(conn, id)?).expect("StudyBlock always serializes"))
}

fn cli_list_study_blocks(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id.ok_or_else(|| {
        crate::error::AppError::InvalidInput("study_block list requires --space <space-id>".into())
    })?;
    Ok(list_study_blocks(conn, space_id)?
        .into_iter()
        .map(|b| serde_json::to_value(b).expect("StudyBlock always serializes"))
        .collect())
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "study_block",
        supports_blocks: false,
        description: "A scheduled block of study time for an Exam.",
        fields: STUDY_BLOCK_FIELDS,
        relationship_types: &["study-block-exam"],
        create: cli_create_study_block,
        update: cli_update_study_block,
        get: cli_get_study_block,
        list: cli_list_study_blocks,
    }
}
