use crate::db::entities::Entity;
use crate::db::relationships::{Cardinality, RelationshipTypeDef};
use crate::db::schema::{CreateInput, EntitySchemaDef, FieldDef, FieldKind, JsonMap};
use crate::error::AppResult;
use rusqlite::{params, Connection, OptionalExtension};
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

pub fn get_exam(conn: &Connection, entity_id: &str) -> AppResult<Exam> {
    conn.query_row(
        "SELECT e.*, x.exam_date, x.weight, x.grade, x.status FROM entities e
         JOIN exams x ON x.entity_id = e.id WHERE e.id = ?1",
        params![entity_id],
        row_to_exam,
    )
    .optional()?
    .ok_or_else(|| crate::error::AppError::NotFound(format!("exam {entity_id}")))
}

// --- CLI schema registration (PLAN.md §1/§3) -------------------------------

const EXAM_FIELDS: &[FieldDef] = &[
    FieldDef {
        name: "courseId",
        kind: FieldKind::EntityRef("course"),
        required_on_create: true,
        writable_on_update: false,
        description: "The Course this exam belongs to (structural: exactly one).",
    },
    FieldDef {
        name: "examDate",
        kind: FieldKind::Date,
        required_on_create: false,
        writable_on_update: false,
        description: "ISO date. Set at creation only.",
    },
    FieldDef {
        name: "weight",
        kind: FieldKind::Float,
        required_on_create: false,
        writable_on_update: false,
        description: "Weight toward the course grade. Set at creation only.",
    },
    FieldDef {
        name: "grade",
        kind: FieldKind::Float,
        required_on_create: false,
        writable_on_update: true,
        description: "Grade received.",
    },
    FieldDef {
        name: "status",
        kind: FieldKind::Enum(&["upcoming", "studying", "done"]),
        required_on_create: false,
        writable_on_update: true,
        description: "Defaults to 'upcoming' on creation.",
    },
];

fn cli_create_exam(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    let course_id = crate::db::schema::require_str(&input.fields, "courseId")?;
    let exam_date = crate::db::schema::field_str(&input.fields, "examDate");
    let weight = crate::db::schema::field_f64(&input.fields, "weight");
    let exam = create_exam(
        conn,
        input.space_id,
        input.title,
        course_id,
        exam_date,
        weight,
    )?;
    Ok(serde_json::to_value(exam).expect("Exam always serializes"))
}

fn cli_update_exam(conn: &Connection, id: &str, fields: &JsonMap) -> AppResult<serde_json::Value> {
    let grade = crate::db::schema::field_f64(fields, "grade");
    let status = crate::db::schema::field_str(fields, "status");
    update_exam(conn, id, grade, status)?;
    cli_get_exam(conn, id)
}

fn cli_get_exam(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    Ok(serde_json::to_value(get_exam(conn, id)?).expect("Exam always serializes"))
}

fn cli_list_exams(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id.ok_or_else(|| {
        crate::error::AppError::InvalidInput("exam list requires --space <space-id>".into())
    })?;
    Ok(list_exams(conn, space_id)?
        .into_iter()
        .map(|x| serde_json::to_value(x).expect("Exam always serializes"))
        .collect())
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "exam",
        supports_blocks: false,
        description: "A graded exam belonging to exactly one Course.",
        fields: EXAM_FIELDS,
        relationship_types: &["exam-course", "deck-exam", "study-block-exam", "relates-to"],
        create: cli_create_exam,
        update: cli_update_exam,
        get: cli_get_exam,
        list: cli_list_exams,
    }
}
