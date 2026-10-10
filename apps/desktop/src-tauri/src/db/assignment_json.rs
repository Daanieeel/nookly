//! Export and import of one Assignment as a Nookly JSON file (`nookly-assignment`,
//! version 1).
//!
//! The file holds the Assignment's title, status, due day, grade, weight and description
//! blocks. An Assignment has no sub-items of its own: its matching Tasks are separate
//! entities related to it, and relationships stay behind. The due day travels as the day
//! it is due on the day of the export, even when it followed a session of the Course
//! (that link, and the sessions, belong to one instance). The Course is named in the file
//! as plain text for whoever reads it, and is never looked up: an import has to be filed
//! under a Course the user picks, because every Assignment belongs to exactly one.
//!
//! Import creates a new Assignment and never changes an existing one, and lands whole or
//! not at all.

use crate::db::assignments::{self, ASSIGNMENT_STATUSES};
use crate::db::entities::Entity;
use crate::db::page_json::{export_blocks, import_blocks, preview_blocks, BlockJson};
use crate::db::portable::{check_date, parse_document, Importer, PortableDef, PortablePreview};
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

pub const FORMAT: &str = "nookly-assignment";
pub const VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AssignmentFile {
    format: String,
    version: u32,
    /// Always `assignment`.
    kind: String,
    title: String,
    /// The Course's name, as text. Not used on import.
    #[serde(default)]
    course: Option<String>,
    /// One of `not_started`, `in_progress`, `submitted` or `graded`.
    status: String,
    #[serde(default)]
    due_date: Option<String>,
    #[serde(default)]
    grade: Option<f64>,
    #[serde(default)]
    weight: Option<f64>,
    #[serde(default)]
    blocks: Vec<BlockJson>,
}

fn course_title(conn: &Connection, assignment_id: &str) -> AppResult<Option<String>> {
    let course_id = crate::db::relationships::list_relationships(
        conn,
        assignment_id,
        crate::db::relationships::Direction::From,
    )?
    .into_iter()
    .find(|r| r.relationship_type == "assignment-course")
    .map(|r| r.to_entity_id);
    match course_id {
        Some(id) => Ok(Some(crate::db::entities::get_entity(conn, &id)?.title)),
        None => Ok(None),
    }
}

/// The Assignment as a `nookly-assignment` JSON document.
pub fn export_assignment_json(conn: &Connection, entity_id: &str) -> AppResult<String> {
    let entity = crate::db::entities::get_entity(conn, entity_id)?;
    if entity.entity_type != "assignment" {
        return Err(AppError::InvalidInput(format!(
            "only an assignment can be exported this way, not a {}",
            entity.entity_type
        )));
    }
    let assignment = assignments::get_assignment(conn, entity_id)?;
    let file = AssignmentFile {
        format: FORMAT.into(),
        version: VERSION,
        kind: "assignment".into(),
        title: entity.title,
        course: course_title(conn, entity_id)?,
        status: assignment.status,
        due_date: assignment.due_date,
        grade: assignment.grade,
        weight: assignment.weight,
        blocks: export_blocks(conn, entity_id)?,
    };
    serde_json::to_string_pretty(&file).map_err(|e| AppError::Io(e.to_string()))
}

/// Reads and checks a document without touching the database.
fn parse(text: &str) -> AppResult<AssignmentFile> {
    let file: AssignmentFile = parse_document(text, FORMAT, VERSION, "assignment")?;
    if file.kind != "assignment" {
        return Err(AppError::InvalidInput(format!(
            "this assignment file holds a \"{}\", not an assignment",
            file.kind
        )));
    }
    crate::db::require_one_of("status", &file.status, ASSIGNMENT_STATUSES)?;
    if let Some(day) = &file.due_date {
        check_date("dueDate", day)?;
    }
    if file.grade.is_some_and(|g| !g.is_finite() || g < 0.0) {
        return Err(AppError::InvalidInput(
            "grade must be a number of 0 or more".into(),
        ));
    }
    if file.weight.is_some_and(|w| !w.is_finite() || w < 0.0) {
        return Err(AppError::InvalidInput(
            "weight must be a number of 0 or more".into(),
        ));
    }
    Ok(file)
}

/// Creates a new Assignment, filed under `course_id`, in `space_id` from a
/// `nookly-assignment` document. The caller has checked the Course (`portable::import`).
pub fn import_assignment_json(
    conn: &Connection,
    space_id: &str,
    course_id: &str,
    text: &str,
) -> AppResult<Entity> {
    let file = parse(text)?;
    crate::db::atomically(conn, || {
        let created = assignments::create_assignment(
            conn,
            space_id.to_string(),
            file.title.clone(),
            course_id.to_string(),
            file.due_date.clone(),
        )?;
        let id = &created.entity.id;
        conn.execute(
            "UPDATE assignments SET status = ?1, grade = ?2 WHERE entity_id = ?3",
            params![file.status, file.grade, id],
        )?;
        assignments::update_assignment_weight(conn, id, file.weight)?;
        import_blocks(conn, id, &file.blocks)?;
        crate::db::entities::get_entity(conn, id)
    })
}

fn status_words(status: &str) -> String {
    let spaced = status.replace('_', " ");
    let mut chars = spaced.chars();
    chars
        .next()
        .map(|c| c.to_uppercase().collect::<String>() + chars.as_str())
        .unwrap_or_default()
}

fn preview(text: &str) -> AppResult<PortablePreview> {
    let file = parse(text)?;
    let mut facts = vec![format!("Status: {}", status_words(&file.status))];
    if let Some(day) = &file.due_date {
        facts.push(format!("Due {day}"));
    }
    if let Some(grade) = file.grade {
        facts.push(format!("Grade {grade}"));
    }
    if let Some(weight) = file.weight {
        facts.push(format!("Weight {weight}"));
    }
    if let Some(course) = &file.course {
        facts.push(format!("From the course {course}"));
    }
    let (items, converted) = preview_blocks(&file.blocks);
    Ok(PortablePreview {
        format: FORMAT.into(),
        kind: "assignment".into(),
        title: file.title,
        facts,
        count: items.len(),
        count_label: "block".into(),
        items,
        converted,
        parent_type: Some("course".into()),
    })
}

inventory::submit! {
    PortableDef { entity_type: "assignment", format: FORMAT, version: VERSION, parent_type: Some("course"), noun: "assignment", export: export_assignment_json, preview, import: Importer::Filed(import_assignment_json) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::notes::list_blocks;

    struct Fixture {
        conn: Connection,
        space: String,
        other_space: String,
        course: String,
        other_course: String,
    }

    fn fixture() -> Fixture {
        let conn = crate::db::test_conn();
        let space =
            crate::db::spaces::create_space(&conn, "A".into(), None, "#000".into()).unwrap();
        let other =
            crate::db::spaces::create_space(&conn, "B".into(), None, "#111".into()).unwrap();
        let course =
            crate::db::courses::create_course(&conn, space.id.clone(), "Physics 101".into())
                .unwrap();
        let other_course =
            crate::db::courses::create_course(&conn, other.id.clone(), "Chemistry".into()).unwrap();
        Fixture {
            conn,
            space: space.id,
            other_space: other.id,
            course: course.id,
            other_course: other_course.id,
        }
    }

    fn entity_count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM entities", [], |r| r.get(0))
            .unwrap()
    }

    fn graded(fx: &Fixture) -> Entity {
        let a = assignments::create_assignment(
            &fx.conn,
            fx.space.clone(),
            "Lab report 3".into(),
            fx.course.clone(),
            Some("2026-03-10".into()),
        )
        .unwrap();
        let id = &a.entity.id;
        assignments::update_assignment_status(&fx.conn, id, "graded".into(), Some(8.5)).unwrap();
        assignments::update_assignment_weight(&fx.conn, id, Some(0.25)).unwrap();
        crate::db::notes::create_block(
            &fx.conn,
            id,
            "paragraph".into(),
            "Hand in **both** parts.".into(),
            None,
            None,
            None,
        )
        .unwrap();
        a.entity
    }

    #[test]
    fn an_assignment_round_trips_under_a_course_it_is_given() {
        let fx = fixture();
        let a = graded(&fx);
        let json = export_assignment_json(&fx.conn, &a.id).unwrap();
        for private in [
            a.id.as_str(),
            fx.space.as_str(),
            fx.course.as_str(),
            "createdAt",
            "labels",
        ] {
            assert!(!json.contains(private), "{private} leaked into {json}");
        }
        // The course is named, as text only.
        assert!(json.contains("\"course\": \"Physics 101\""));

        let imported =
            crate::db::portable::import(&fx.conn, &fx.other_space, Some(&fx.other_course), &json)
                .unwrap();
        assert_ne!(imported.id, a.id);
        assert_eq!(imported.entity_type, "assignment");
        assert_eq!(imported.space_id, fx.other_space);
        let got = assignments::get_assignment(&fx.conn, &imported.id).unwrap();
        assert_eq!(
            (
                got.status.as_str(),
                got.due_date.as_deref(),
                got.grade,
                got.weight
            ),
            ("graded", Some("2026-03-10"), Some(8.5), Some(0.25))
        );
        assert_eq!(
            list_blocks(&fx.conn, &imported.id).unwrap()[0].content,
            "Hand in **both** parts."
        );
        // Filed under the course it was given, and no other.
        let course = course_title(&fx.conn, &imported.id).unwrap();
        assert_eq!(course.as_deref(), Some("Chemistry"));
    }

    #[test]
    fn a_due_day_that_followed_a_session_travels_as_a_plain_day() {
        let fx = fixture();
        let a = graded(&fx);
        crate::db::sessions::create_one_off_session(
            &fx.conn,
            fx.space.clone(),
            "Lecture".into(),
            fx.course.clone(),
            "2026-04-07".into(),
            "10:00".into(),
            "11:00".into(),
            None,
        )
        .unwrap();
        assignments::update_assignment_due_before_session(&fx.conn, &a.id, Some(2), None).unwrap();
        let json = export_assignment_json(&fx.conn, &a.id).unwrap();
        assert!(json.contains("2026-04-05"), "{json}");
        assert!(!json.to_lowercase().contains("session"), "{json}");
        let imported = import_assignment_json(&fx.conn, &fx.space, &fx.course, &json).unwrap();
        let got = assignments::get_assignment(&fx.conn, &imported.id).unwrap();
        assert_eq!(got.due_date.as_deref(), Some("2026-04-05"));
        assert_eq!(got.due_session_offset_days, None);
    }

    #[test]
    fn an_import_has_to_be_filed_under_a_course_in_the_same_space() {
        let fx = fixture();
        let a = graded(&fx);
        let json = export_assignment_json(&fx.conn, &a.id).unwrap();
        let note =
            crate::db::notes::create_page(&fx.conn, fx.space.clone(), "note", "N".into()).unwrap();
        let before = entity_count(&fx.conn);
        for (space, parent, expected) in [
            (fx.space.as_str(), None, "has to be filed under a course"),
            (fx.space.as_str(), Some(note.id.as_str()), "not a note"),
            (
                fx.space.as_str(),
                Some(fx.other_course.as_str()),
                "another Space",
            ),
            (fx.space.as_str(), Some("missing"), "missing"),
        ] {
            let err = crate::db::portable::import(&fx.conn, space, parent, &json).unwrap_err();
            assert!(err.to_string().contains(expected), "{err}");
            assert_eq!(entity_count(&fx.conn), before);
        }
        assert!(crate::db::portable::import(&fx.conn, &fx.space, Some(&fx.course), &json).is_ok());
    }

    #[test]
    fn importing_leaves_the_original_alone() {
        let fx = fixture();
        let a = graded(&fx);
        let before = assignments::get_assignment(&fx.conn, &a.id).unwrap();
        let json = export_assignment_json(&fx.conn, &a.id).unwrap();
        import_assignment_json(&fx.conn, &fx.space, &fx.course, &json).unwrap();
        import_assignment_json(&fx.conn, &fx.space, &fx.course, &json).unwrap();
        let after = assignments::get_assignment(&fx.conn, &a.id).unwrap();
        assert_eq!(after.entity.updated_at, before.entity.updated_at);
        assert_eq!(
            (after.status, after.grade, after.weight),
            (before.status, before.grade, before.weight)
        );
    }

    #[test]
    fn something_that_is_not_an_assignment_is_refused() {
        let fx = fixture();
        assert!(matches!(
            export_assignment_json(&fx.conn, &fx.course),
            Err(AppError::InvalidInput(_))
        ));
        assert!(matches!(
            export_assignment_json(&fx.conn, "missing"),
            Err(AppError::NotFound(_))
        ));
    }

    fn with(patch: serde_json::Value) -> String {
        let mut value = serde_json::json!({
            "format": "nookly-assignment", "version": 1, "kind": "assignment",
            "title": "A", "status": "not_started"
        });
        for (key, v) in patch.as_object().unwrap() {
            value[key] = v.clone();
        }
        value.to_string()
    }

    #[test]
    fn a_bad_file_is_refused_clearly_and_creates_nothing() {
        let fx = fixture();
        let before = entity_count(&fx.conn);
        let cases = [
            ("{ nope".to_string(), "not a Nookly assignment file"),
            (
                r#"{"format":"nookly-task","version":1}"#.to_string(),
                "not a Nookly assignment file",
            ),
            (with(serde_json::json!({ "version": 3 })), "version 3"),
            (
                with(serde_json::json!({ "kind": "task" })),
                "not an assignment",
            ),
            (
                with(serde_json::json!({ "status": "done" })),
                "status must be one of",
            ),
            (with(serde_json::json!({ "dueDate": "soon" })), "dueDate"),
            (with(serde_json::json!({ "grade": -1 })), "grade"),
            (with(serde_json::json!({ "weight": -0.5 })), "weight"),
            (with(serde_json::json!({ "color": "red" })), "color"),
            (
                with(
                    serde_json::json!({ "blocks": [{ "type": "callout", "content": "", "attrs": { "variant": "nope" } }] }),
                ),
                "block 1",
            ),
        ];
        for (text, expected) in cases {
            let err = import_assignment_json(&fx.conn, &fx.space, &fx.course, &text).unwrap_err();
            assert!(matches!(err, AppError::InvalidInput(_)), "{text}");
            assert!(err.to_string().contains(expected), "{text}: {err}");
            assert_eq!(entity_count(&fx.conn), before, "{text}");
        }
    }

    #[test]
    fn the_preview_says_what_comes_and_that_a_course_is_needed() {
        let fx = fixture();
        let a = graded(&fx);
        let json = export_assignment_json(&fx.conn, &a.id).unwrap();
        let before = entity_count(&fx.conn);
        let p = preview(&json).unwrap();
        assert_eq!(
            (p.kind.as_str(), p.title.as_str(), p.parent_type.as_deref()),
            ("assignment", "Lab report 3", Some("course"))
        );
        for fact in [
            "Status: Graded",
            "Due 2026-03-10",
            "Grade 8.5",
            "Weight 0.25",
            "From the course Physics 101",
        ] {
            assert!(p.facts.iter().any(|f| f == fact), "{fact} in {:?}", p.facts);
        }
        assert_eq!((p.count, p.count_label.as_str()), (1, "block"));
        assert_eq!(entity_count(&fx.conn), before);
    }

    #[test]
    fn it_is_registered_and_needs_a_course() {
        let def = crate::db::portable::for_type("assignment").unwrap();
        assert_eq!((def.format, def.parent_type), (FORMAT, Some("course")));
    }
}
