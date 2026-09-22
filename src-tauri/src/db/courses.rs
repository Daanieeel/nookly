use crate::db::entities::Entity;
use crate::db::relationships::{Cardinality, RelationshipTypeDef};
use crate::error::AppResult;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

inventory::submit! {
    RelationshipTypeDef { name: "sequel-of", inverse_label: "prequel-of", cardinality: Cardinality::Unrestricted }
}
inventory::submit! {
    RelationshipTypeDef { name: "course-semester", inverse_label: "has course", cardinality: Cardinality::Unrestricted }
}
inventory::submit! {
    RelationshipTypeDef { name: "course-notes", inverse_label: "notes for course", cardinality: Cardinality::OneToPerFrom }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Semester {
    pub entity: Entity,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

fn row_to_semester(row: &rusqlite::Row) -> rusqlite::Result<Semester> {
    Ok(Semester {
        entity: crate::db::entities::row_to_entity(row)?,
        start_date: row.get("start_date")?,
        end_date: row.get("end_date")?,
    })
}

pub fn create_course(conn: &Connection, space_id: String, title: String) -> AppResult<Entity> {
    let entity = crate::db::entities::create_entity(conn, space_id, "course".into(), title, None)?;
    conn.execute(
        "INSERT INTO courses (entity_id) VALUES (?1)",
        params![entity.id],
    )?;
    Ok(entity)
}

pub fn list_courses(conn: &Connection, space_id: &str) -> AppResult<Vec<Entity>> {
    let mut stmt = conn.prepare(
        "SELECT e.* FROM entities e JOIN courses c ON c.entity_id = e.id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY e.created_at ASC",
    )?;
    let rows = stmt.query_map(params![space_id], crate::db::entities::row_to_entity)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn create_semester(
    conn: &Connection,
    space_id: String,
    title: String,
    start_date: Option<String>,
    end_date: Option<String>,
) -> AppResult<Semester> {
    let entity =
        crate::db::entities::create_entity(conn, space_id, "semester".into(), title, None)?;
    conn.execute(
        "INSERT INTO semesters (entity_id, start_date, end_date) VALUES (?1, ?2, ?3)",
        params![entity.id, start_date, end_date],
    )?;
    Ok(Semester {
        entity,
        start_date,
        end_date,
    })
}

pub fn list_semesters(conn: &Connection, space_id: &str) -> AppResult<Vec<Semester>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, s.start_date, s.end_date FROM entities e JOIN semesters s ON s.entity_id = e.id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY e.created_at ASC",
    )?;
    let rows = stmt.query_map(params![space_id], row_to_semester)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Same "if `Some`, update that column" convention as `exams::update_exam` —
/// `None` means "leave unchanged," not "clear."
pub fn update_semester(
    conn: &Connection,
    entity_id: &str,
    start_date: Option<String>,
    end_date: Option<String>,
) -> AppResult<()> {
    if let Some(start_date) = start_date {
        conn.execute(
            "UPDATE semesters SET start_date = ?1 WHERE entity_id = ?2",
            params![start_date, entity_id],
        )?;
    }
    if let Some(end_date) = end_date {
        conn.execute(
            "UPDATE semesters SET end_date = ?1 WHERE entity_id = ?2",
            params![end_date, entity_id],
        )?;
    }
    Ok(())
}

/// Links a Course to a Semester it runs in (§5.4) — a Course spanning multiple
/// semesters is one Course entity related to several Semester entities.
pub fn link_course_to_semester(
    conn: &Connection,
    course_id: String,
    semester_id: String,
) -> AppResult<()> {
    crate::db::relationships::create_relationship(
        conn,
        course_id,
        semester_id,
        "course-semester".into(),
        None,
        None,
    )?;
    Ok(())
}

/// Every Course gets exactly one Course Notes page, rendered inline on the
/// Course page (§ course sub-dashboard plan) — found via the `course-notes`
/// structural relationship, or created lazily on first request so courses
/// created before this feature still get one.
///
/// Entity type is `course_notes`, deliberately distinct from `note` — this is
/// not a real Notes-module page (it must never show up in the Notes list or
/// count toward the Notes module), just a block-backed text surface owned by
/// the Course. It reuses the same `blocks` table `notes::create_page` writes
/// to, since block storage isn't type-specific.
pub fn get_or_create_course_notes(conn: &Connection, course_id: &str) -> AppResult<Entity> {
    let existing: Option<String> = conn
        .query_row(
            "SELECT to_entity_id FROM relationships
             WHERE from_entity_id = ?1 AND relationship_type = 'course-notes'",
            params![course_id],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(note_id) = existing {
        return crate::db::entities::get_entity(conn, &note_id);
    }

    let course = crate::db::entities::get_entity(conn, course_id)?;
    let title = if course.title.trim().is_empty() {
        "Course Notes".to_string()
    } else {
        format!("{} Notes", course.title)
    };
    let note = crate::db::notes::create_page(conn, course.space_id, "course_notes", title)?;
    crate::db::relationships::create_relationship(
        conn,
        course_id.to_string(),
        note.id.clone(),
        "course-notes".into(),
        None,
        None,
    )?;
    Ok(note)
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
    fn create_semester_round_trips_dates() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();

        let semester = create_semester(
            &conn,
            space.id.clone(),
            "WS 2026/27".into(),
            Some("2026-10-01".into()),
            Some("2027-02-15".into()),
        )
        .unwrap();

        assert_eq!(semester.start_date, Some("2026-10-01".into()));
        assert_eq!(semester.end_date, Some("2027-02-15".into()));

        let listed = list_semesters(&conn, &space.id).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].start_date, Some("2026-10-01".into()));
        assert_eq!(listed[0].end_date, Some("2027-02-15".into()));
    }

    #[test]
    fn update_semester_sets_only_given_fields() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let semester =
            create_semester(&conn, space.id.clone(), "WS 2026/27".into(), None, None).unwrap();

        update_semester(&conn, &semester.entity.id, Some("2026-10-01".into()), None).unwrap();
        let listed = list_semesters(&conn, &space.id).unwrap();
        assert_eq!(listed[0].start_date, Some("2026-10-01".into()));
        assert_eq!(listed[0].end_date, None);

        update_semester(&conn, &semester.entity.id, None, Some("2027-02-15".into())).unwrap();
        let listed = list_semesters(&conn, &space.id).unwrap();
        assert_eq!(listed[0].start_date, Some("2026-10-01".into()));
        assert_eq!(listed[0].end_date, Some("2027-02-15".into()));
    }

    #[test]
    fn course_notes_are_created_once_and_reused() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let course = create_course(&conn, space.id.clone(), "Algorithms".into()).unwrap();

        let notes = get_or_create_course_notes(&conn, &course.id).unwrap();
        assert_eq!(notes.entity_type, "course_notes");
        assert_eq!(notes.title, "Algorithms Notes");

        let again = get_or_create_course_notes(&conn, &course.id).unwrap();
        assert_eq!(again.id, notes.id);
    }

    #[test]
    fn course_notes_are_not_listed_as_a_real_note() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let course = create_course(&conn, space.id.clone(), "Algorithms".into()).unwrap();
        get_or_create_course_notes(&conn, &course.id).unwrap();

        let recent_notes = crate::db::notes::list_recent_notes(&conn, &space.id, 10).unwrap();
        assert!(recent_notes.is_empty());
    }
}
