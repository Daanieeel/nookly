use crate::db::entities::Entity;
use crate::db::relationships::{Cardinality, RelationshipTypeDef};
use crate::error::AppResult;
use rusqlite::{params, Connection};

inventory::submit! {
    RelationshipTypeDef { name: "sequel-of", inverse_label: "prequel-of", cardinality: Cardinality::Unrestricted }
}
inventory::submit! {
    RelationshipTypeDef { name: "course-semester", inverse_label: "has course", cardinality: Cardinality::Unrestricted }
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

pub fn create_semester(conn: &Connection, space_id: String, title: String) -> AppResult<Entity> {
    let entity =
        crate::db::entities::create_entity(conn, space_id, "semester".into(), title, None)?;
    conn.execute(
        "INSERT INTO semesters (entity_id) VALUES (?1)",
        params![entity.id],
    )?;
    Ok(entity)
}

pub fn list_semesters(conn: &Connection, space_id: &str) -> AppResult<Vec<Entity>> {
    let mut stmt = conn.prepare(
        "SELECT e.* FROM entities e JOIN semesters s ON s.entity_id = e.id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY e.created_at ASC",
    )?;
    let rows = stmt.query_map(params![space_id], crate::db::entities::row_to_entity)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
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
