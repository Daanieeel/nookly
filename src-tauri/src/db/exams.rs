use crate::db::entities::Entity;
use crate::db::relationships::{Cardinality, MovesWith, RelationshipTypeDef};
use crate::db::schema::{CreateInput, EntitySchemaDef, FieldDef, FieldKind, JsonMap};
use crate::error::AppResult;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

inventory::submit! {
    RelationshipTypeDef { name: "exam-course", inverse_label: "has exam", cardinality: Cardinality::OneToPerFrom, moves_with: MovesWith::FromFollowsTo }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Exam {
    pub entity: Entity,
    pub exam_date: Option<String>,
    pub weight: Option<f64>,
    pub grade: Option<f64>,
    pub status: String,
    pub room: Option<String>,
}

fn row_to_exam(row: &rusqlite::Row) -> rusqlite::Result<Exam> {
    Ok(Exam {
        entity: crate::db::entities::row_to_entity(row)?,
        exam_date: row.get("exam_date")?,
        weight: row.get("weight")?,
        grade: row.get("grade")?,
        status: row.get("status")?,
        room: row.get("room")?,
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
        room: None,
    })
}

pub fn list_exams(conn: &Connection, space_id: &str) -> AppResult<Vec<Exam>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, x.exam_date, x.weight, x.grade, x.status, x.room FROM entities e
         JOIN exams x ON x.entity_id = e.id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY x.exam_date ASC",
    )?;
    let rows = stmt.query_map(params![space_id], row_to_exam)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Cross-Space, for the Dashboard briefing's Exam/Assignment clause.
pub fn list_exams_all_spaces(conn: &Connection) -> AppResult<Vec<Exam>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, x.exam_date, x.weight, x.grade, x.status, x.room FROM entities e
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

pub fn update_exam_date(conn: &Connection, entity_id: &str, exam_date: Option<String>) -> AppResult<()> {
    conn.execute(
        "UPDATE exams SET exam_date = ?1 WHERE entity_id = ?2",
        params![exam_date, entity_id],
    )?;
    Ok(())
}

pub fn update_exam_weight(conn: &Connection, entity_id: &str, weight: Option<f64>) -> AppResult<()> {
    conn.execute(
        "UPDATE exams SET weight = ?1 WHERE entity_id = ?2",
        params![weight, entity_id],
    )?;
    Ok(())
}

/// Unlike `update_exam`, `None` clears the grade.
pub fn update_exam_grade(conn: &Connection, entity_id: &str, grade: Option<f64>) -> AppResult<()> {
    conn.execute(
        "UPDATE exams SET grade = ?1 WHERE entity_id = ?2",
        params![grade, entity_id],
    )?;
    Ok(())
}

pub fn update_exam_room(conn: &Connection, entity_id: &str, room: Option<String>) -> AppResult<()> {
    let room = room.map(|r| r.trim().to_string()).filter(|r| !r.is_empty());
    conn.execute(
        "UPDATE exams SET room = ?1 WHERE entity_id = ?2",
        params![room, entity_id],
    )?;
    Ok(())
}

/// Moves an exam to another Course, replacing its one `exam-course` link rather
/// than erroring on the cardinality rule. The old link stays if the new one fails.
pub fn set_exam_course(conn: &Connection, entity_id: &str, course_id: String) -> AppResult<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "DELETE FROM relationships WHERE from_entity_id = ?1 AND relationship_type = 'exam-course'",
        params![entity_id],
    )?;
    crate::db::relationships::create_relationship(
        &tx,
        entity_id.to_string(),
        course_id,
        "exam-course".into(),
        None,
        None,
    )?;
    tx.commit()?;
    Ok(())
}

pub fn get_exam(conn: &Connection, entity_id: &str) -> AppResult<Exam> {
    conn.query_row(
        "SELECT e.*, x.exam_date, x.weight, x.grade, x.status, x.room FROM entities e
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
        writable_on_update: true,
        description: "The Course this exam belongs to (structural: exactly one). Updating it moves the exam.",
    },
    FieldDef {
        name: "examDate",
        kind: FieldKind::Date,
        required_on_create: false,
        writable_on_update: true,
        description: "ISO date. Pass null to clear it.",
    },
    FieldDef {
        name: "weight",
        kind: FieldKind::Float,
        required_on_create: false,
        writable_on_update: true,
        description: "Weight toward the course grade, as a fraction like 0.2. Pass null to clear it.",
    },
    FieldDef {
        name: "grade",
        kind: FieldKind::Float,
        required_on_create: false,
        writable_on_update: true,
        description: "Grade received. Pass null to clear it.",
    },
    FieldDef {
        name: "status",
        kind: FieldKind::Enum(&["upcoming", "studying", "done"]),
        required_on_create: false,
        writable_on_update: true,
        description: "Defaults to 'upcoming' on creation.",
    },
    FieldDef {
        name: "room",
        kind: FieldKind::Text,
        required_on_create: false,
        writable_on_update: true,
        description: "Where the exam takes place, like \"H 0104\". Pass null to clear it.",
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
    use crate::db::schema::{field_f64, field_str};
    update_exam(conn, id, None, field_str(fields, "status"))?;
    if fields.contains_key("grade") {
        update_exam_grade(conn, id, field_f64(fields, "grade"))?;
    }
    if fields.contains_key("examDate") {
        update_exam_date(conn, id, field_str(fields, "examDate"))?;
    }
    if fields.contains_key("weight") {
        update_exam_weight(conn, id, field_f64(fields, "weight"))?;
    }
    if fields.contains_key("room") {
        update_exam_room(conn, id, field_str(fields, "room"))?;
    }
    if let Some(course_id) = field_str(fields, "courseId") {
        set_exam_course(conn, id, course_id)?;
    }
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
        supports_blocks: true,
        description: "A graded exam belonging to exactly one Course.",
        fields: EXAM_FIELDS,
        relationship_types: &["exam-course", "deck-exam", "study-block-exam", "relates-to"],
        create: cli_create_exam,
        update: cli_update_exam,
        get: cli_get_exam,
        list: cli_list_exams,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::courses::create_course;
    use crate::db::spaces::create_space;

    fn setup() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        conn
    }

    #[test]
    fn exam_fields_update_and_clear() {
        let conn = setup();
        let space = create_space(&conn, "Uni".into(), None, "#000".into()).unwrap();
        let algo = create_course(&conn, space.id.clone(), "Algorithms".into()).unwrap();
        let math = create_course(&conn, space.id.clone(), "Math".into()).unwrap();
        let exam = create_exam(&conn, space.id, "Final".into(), algo.id, None, None).unwrap();
        let id = exam.entity.id;

        update_exam_date(&conn, &id, Some("2026-10-01".into())).unwrap();
        update_exam_weight(&conn, &id, Some(0.4)).unwrap();
        update_exam_grade(&conn, &id, Some(1.7)).unwrap();
        update_exam_room(&conn, &id, Some("  H 0104 ".into())).unwrap();
        set_exam_course(&conn, &id, math.id.clone()).unwrap();
        let exam = get_exam(&conn, &id).unwrap();
        assert_eq!(exam.exam_date.as_deref(), Some("2026-10-01"));
        assert_eq!(exam.weight, Some(0.4));
        assert_eq!(exam.grade, Some(1.7));
        assert_eq!(exam.room.as_deref(), Some("H 0104"));
        let course: String = conn
            .query_row(
                "SELECT to_entity_id FROM relationships
                 WHERE from_entity_id = ?1 AND relationship_type = 'exam-course'",
                params![id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(course, math.id);

        update_exam_grade(&conn, &id, None).unwrap();
        update_exam_room(&conn, &id, Some("   ".into())).unwrap();
        let exam = get_exam(&conn, &id).unwrap();
        assert_eq!(exam.grade, None);
        assert_eq!(exam.room, None);
    }
}
