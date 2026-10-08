use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::OnceLock;

// OneToPerFrom/OneFromPerTo aren't constructed by any core type yet — they exist
// for future structural relationship types (e.g. Session -> Course) registered by other modules.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum Cardinality {
    /// No restriction: any number of relationships of this type on either side.
    Unrestricted,
    /// Each `from` entity may have at most one relationship of this type
    /// (e.g. Session -> Course: a session has exactly one course).
    OneToPerFrom,
    /// Each `to` entity may have at most one relationship of this type
    /// pointing at it from a given `from`-side entity type.
    OneFromPerTo,
}

/// Which side of an edge follows the other when an entity moves to another Space,
/// so a structural child (a Sub-task, a Course's Sessions, its embedded notes page)
/// never gets stranded in the old Space.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MovesWith {
    /// Moving either side leaves the other where it is.
    Independent,
    /// The `from` entity is owned by the `to` entity (Sub-task -> Task): it moves along
    /// with its owner and can't be moved on its own.
    FromFollowsTo,
    /// The `to` entity is owned by the `from` entity (Course -> its notes page).
    ToFollowsFrom,
}

pub struct RelationshipTypeDef {
    pub name: &'static str,
    /// Plain name for pickers, read as "<this item> <label> <other item>".
    pub label: &'static str,
    /// One sentence on what the link means.
    pub description: &'static str,
    /// Entity types the `from` and `to` ends must be; `None` allows any.
    pub from_type: Option<&'static str>,
    pub to_type: Option<&'static str>,
    pub inverse_label: &'static str,
    pub cardinality: Cardinality,
    pub moves_with: MovesWith,
}

inventory::collect!(RelationshipTypeDef);

inventory::submit! {
    RelationshipTypeDef { name: "relates-to", label: "Related to", description: "A plain link between two items, in either direction.", from_type: None, to_type: None, inverse_label: "related from", cardinality: Cardinality::Unrestricted, moves_with: MovesWith::Independent }
}
inventory::submit! {
    RelationshipTypeDef { name: "blocks", label: "Blocks", description: "This item has to be done before the other one can move.", from_type: None, to_type: None, inverse_label: "blocked by", cardinality: Cardinality::Unrestricted, moves_with: MovesWith::Independent }
}
inventory::submit! {
    RelationshipTypeDef { name: "attached-file", label: "Attached file", description: "A file attached to this item.", from_type: None, to_type: None, inverse_label: "attached to", cardinality: Cardinality::Unrestricted, moves_with: MovesWith::Independent }
}

fn registry() -> &'static HashMap<&'static str, &'static RelationshipTypeDef> {
    static REGISTRY: OnceLock<HashMap<&'static str, &'static RelationshipTypeDef>> =
        OnceLock::new();
    REGISTRY.get_or_init(|| {
        inventory::iter::<RelationshipTypeDef>()
            .map(|def| (def.name, def))
            .collect()
    })
}

pub fn lookup_relationship_type(name: &str) -> Option<&'static RelationshipTypeDef> {
    registry().get(name).copied()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationshipTypeInfo {
    pub name: String,
    pub label: String,
    pub description: String,
    pub from_type: Option<String>,
    pub to_type: Option<String>,
    pub inverse_label: String,
}

pub fn list_relationship_types() -> Vec<RelationshipTypeInfo> {
    registry()
        .values()
        .map(|def| RelationshipTypeInfo {
            name: def.name.to_string(),
            label: def.label.to_string(),
            description: def.description.to_string(),
            from_type: def.from_type.map(str::to_string),
            to_type: def.to_type.map(str::to_string),
            inverse_label: def.inverse_label.to_string(),
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Relationship {
    pub id: String,
    pub from_entity_id: String,
    pub to_entity_id: String,
    pub relationship_type: String,
    pub from_block_id: Option<String>,
    pub to_block_id: Option<String>,
    pub created_at: String,
}

fn row_to_relationship(row: &rusqlite::Row) -> rusqlite::Result<Relationship> {
    Ok(Relationship {
        id: row.get("id")?,
        from_entity_id: row.get("from_entity_id")?,
        to_entity_id: row.get("to_entity_id")?,
        relationship_type: row.get("relationship_type")?,
        from_block_id: row.get("from_block_id")?,
        to_block_id: row.get("to_block_id")?,
        created_at: row.get("created_at")?,
    })
}

pub enum Direction {
    From,
    To,
    Both,
}

/// No internal transaction: every command runs behind the single `DbState` mutex,
/// which already serializes all DB access, so there's no concurrent writer to race against.
/// Whether an entity of type `actual` may sit at an end declared as `required`.
/// A series template stands in for its occurrences, and a Course's notes page
/// is a note with its own page type.
fn end_accepts(required: &str, actual: &str) -> bool {
    actual == required
        || matches!(
            (required, actual),
            ("session", "session_template") | ("note", "course_notes")
        )
}

pub fn create_relationship(
    conn: &Connection,
    from_entity_id: String,
    to_entity_id: String,
    relationship_type: String,
    from_block_id: Option<String>,
    to_block_id: Option<String>,
) -> AppResult<Relationship> {
    let def = lookup_relationship_type(&relationship_type)
        .ok_or_else(|| AppError::UnknownRelationshipType(relationship_type.clone()))?;

    if !super::entities::entity_exists(conn, &from_entity_id)? {
        return Err(AppError::NotFound(format!("entity {from_entity_id}")));
    }
    if !super::entities::entity_exists(conn, &to_entity_id)? {
        return Err(AppError::NotFound(format!("entity {to_entity_id}")));
    }

    // An entity can't link to itself (two different blocks of one page still can).
    if from_entity_id == to_entity_id && from_block_id == to_block_id {
        return Err(AppError::InvalidInput(format!(
            "'{relationship_type}' cannot link {from_entity_id} to itself"
        )));
    }

    for (end_id, required) in [
        (&from_entity_id, def.from_type),
        (&to_entity_id, def.to_type),
    ] {
        let Some(required) = required else { continue };
        let actual = super::entities::get_entity(conn, end_id)?.entity_type;
        let accepted = end_accepts(required, &actual);
        if !accepted {
            return Err(AppError::InvalidInput(format!(
                "'{relationship_type}' needs a {required} at this end, but {end_id} is a {actual}"
            )));
        }
    }
    // Sub-tasks nest one level deep: a Task that already has Sub-tasks can't
    // become one itself.
    if relationship_type == "sub-task-of" {
        let has_subtasks: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM relationships WHERE to_entity_id = ?1 AND relationship_type = 'sub-task-of')",
            params![from_entity_id],
            |row| row.get(0),
        )?;
        if has_subtasks {
            return Err(AppError::CardinalityViolation(format!(
                "{from_entity_id} has sub-tasks, so it cannot be a sub-task"
            )));
        }
    }

    // The same edge is stored once: asking for it again returns the existing one.
    let existing = conn
        .query_row(
            "SELECT * FROM relationships WHERE from_entity_id = ?1 AND to_entity_id = ?2
             AND relationship_type = ?3 AND from_block_id IS ?4 AND to_block_id IS ?5",
            params![
                from_entity_id,
                to_entity_id,
                relationship_type,
                from_block_id,
                to_block_id
            ],
            row_to_relationship,
        )
        .optional()?;
    if let Some(existing) = existing {
        return Ok(existing);
    }

    match def.cardinality {
        Cardinality::Unrestricted => {}
        Cardinality::OneToPerFrom => {
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM relationships WHERE from_entity_id = ?1 AND relationship_type = ?2",
                params![from_entity_id, relationship_type],
                |row| row.get(0),
            )?;
            if count > 0 {
                return Err(AppError::CardinalityViolation(format!(
                    "{from_entity_id} already has a '{relationship_type}' relationship"
                )));
            }
        }
        Cardinality::OneFromPerTo => {
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM relationships WHERE to_entity_id = ?1 AND relationship_type = ?2",
                params![to_entity_id, relationship_type],
                |row| row.get(0),
            )?;
            if count > 0 {
                return Err(AppError::CardinalityViolation(format!(
                    "{to_entity_id} already has an incoming '{relationship_type}' relationship"
                )));
            }
        }
    }

    let id = super::new_id();
    let now = super::now();
    conn.execute(
        "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, from_block_id, to_block_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, from_entity_id, to_entity_id, relationship_type, from_block_id, to_block_id, now],
    )?;

    // A session's Jot or Note belongs to the session's Course too, so it shows up with
    // the Course's other notes and jots.
    let course_link = match relationship_type.as_str() {
        "session-note" => Some("course-notes"),
        "session-jot" => Some("course-jots"),
        _ => None,
    };
    if let Some(course_link) = course_link {
        let course_id: Option<String> = conn
            .query_row(
                "SELECT to_entity_id FROM relationships WHERE from_entity_id = ?1 AND relationship_type = 'session-course'",
                params![from_entity_id],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(course_id) = course_id {
            create_relationship(
                conn,
                course_id,
                to_entity_id.clone(),
                course_link.into(),
                None,
                None,
            )?;
        }
    }

    Ok(Relationship {
        id,
        from_entity_id,
        to_entity_id,
        relationship_type,
        from_block_id,
        to_block_id,
        created_at: now,
    })
}

pub fn list_relationships(
    conn: &Connection,
    entity_id: &str,
    direction: Direction,
) -> AppResult<Vec<Relationship>> {
    let sql = match direction {
        Direction::From => "SELECT * FROM relationships WHERE from_entity_id = ?1 ORDER BY created_at ASC",
        Direction::To => "SELECT * FROM relationships WHERE to_entity_id = ?1 ORDER BY created_at ASC",
        Direction::Both => {
            "SELECT * FROM relationships WHERE from_entity_id = ?1 OR to_entity_id = ?1 ORDER BY created_at ASC"
        }
    };
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params![entity_id], row_to_relationship)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn delete_relationship(conn: &Connection, id: &str) -> AppResult<()> {
    let affected = conn.execute("DELETE FROM relationships WHERE id = ?1", params![id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("relationship {id}")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::entities::create_entity;
    use crate::db::spaces::create_space;

    inventory::submit! {
        RelationshipTypeDef { name: "test-one-to-per-from", label: "Test", description: "Test type.", from_type: None, to_type: None, inverse_label: "test inverse", cardinality: Cardinality::OneToPerFrom, moves_with: MovesWith::Independent }
    }

    fn setup() -> Connection {
        crate::db::test_conn()
    }

    fn make_entity(conn: &Connection, space_id: &str) -> super::super::entities::Entity {
        create_entity(
            conn,
            space_id.to_string(),
            "note".into(),
            "Test".into(),
            None,
        )
        .unwrap()
    }

    #[test]
    fn unknown_relationship_type_is_rejected() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let a = make_entity(&conn, &space.id);
        let b = make_entity(&conn, &space.id);

        let result = create_relationship(&conn, a.id, b.id, "not-a-real-type".into(), None, None);
        assert!(matches!(result, Err(AppError::UnknownRelationshipType(_))));
    }

    #[test]
    fn cardinality_violation_is_rejected() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let a = make_entity(&conn, &space.id);
        let b = make_entity(&conn, &space.id);
        let c = make_entity(&conn, &space.id);

        create_relationship(
            &conn,
            a.id.clone(),
            b.id,
            "test-one-to-per-from".into(),
            None,
            None,
        )
        .unwrap();
        let result =
            create_relationship(&conn, a.id, c.id, "test-one-to-per-from".into(), None, None);

        assert!(matches!(result, Err(AppError::CardinalityViolation(_))));
    }

    #[test]
    fn block_ids_round_trip() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let a = make_entity(&conn, &space.id);
        let b = make_entity(&conn, &space.id);

        let rel = create_relationship(
            &conn,
            a.id.clone(),
            b.id,
            "relates-to".into(),
            Some("block-1".into()),
            Some("block-2".into()),
        )
        .unwrap();

        assert_eq!(rel.from_block_id.as_deref(), Some("block-1"));
        assert_eq!(rel.to_block_id.as_deref(), Some("block-2"));

        let listed = list_relationships(&conn, &a.id, Direction::From).unwrap();
        assert_eq!(listed[0].from_block_id.as_deref(), Some("block-1"));
    }
}
