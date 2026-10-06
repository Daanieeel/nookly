use crate::db::entities::Entity;
use crate::db::relationships::{Cardinality, MovesWith, RelationshipTypeDef};
use crate::db::schema::{CreateInput, EntitySchemaDef, FieldDef, FieldKind, JsonMap};
use crate::error::AppResult;

pub const ASSIGNMENT_STATUSES: &[&str] = &["not_started", "in_progress", "submitted", "graded"];
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

inventory::submit! {
    RelationshipTypeDef { name: "assignment-course", label: "Assignment for course", description: "Ties an assignment to its course.", from_type: Some("assignment"), to_type: Some("course"), inverse_label: "has assignment", cardinality: Cardinality::OneToPerFrom, moves_with: MovesWith::FromFollowsTo }
}

inventory::submit! {
    RelationshipTypeDef { name: "assignment-due-session", label: "Due before session", description: "Ties an assignment to the one session its due day follows.", from_type: Some("assignment"), to_type: Some("session"), inverse_label: "is the due session of", cardinality: Cardinality::OneToPerFrom, moves_with: MovesWith::Independent }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Assignment {
    pub entity: Entity,
    /// The day it is due. When `due_session_offset_days` is set this is worked out
    /// from the course's sessions each time it is read, never stored.
    pub due_date: Option<String>,
    /// Due this many days before the course's next session; `None` for a fixed date.
    pub due_session_offset_days: Option<i64>,
    /// The one session the due day follows, instead of the next one. Read from the
    /// `assignment-due-session` link; `None` while it follows the next session.
    pub due_session_id: Option<String>,
    /// Its share of the course's grade, like an exam's: a fraction, or a whole
    /// percentage. `None` splits what the weighted work leaves evenly.
    pub weight: Option<f64>,
    pub status: String,
    pub grade: Option<f64>,
}

fn row_to_assignment(row: &rusqlite::Row) -> rusqlite::Result<Assignment> {
    Ok(Assignment {
        entity: crate::db::entities::row_to_entity(row)?,
        due_date: row.get("due_date")?,
        due_session_offset_days: row.get("due_session_offset_days")?,
        due_session_id: None,
        weight: row.get("weight")?,
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
    crate::db::atomically(conn, || {
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
            due_session_offset_days: None,
            due_session_id: None,
            weight: None,
            status: "not_started".into(),
            grade: None,
        })
    })
}

/// Creates an assignment already due this many days before its course's next session
/// (or before `session_id`, when given), all or nothing, so a bad offset or session
/// leaves no assignment behind.
pub fn create_assignment_due_before_session(
    conn: &Connection,
    space_id: String,
    title: String,
    course_id: String,
    offset_days: i64,
    session_id: Option<String>,
) -> AppResult<Assignment> {
    crate::db::atomically(conn, || {
        let created = create_assignment(conn, space_id, title, course_id, None)?;
        update_assignment_due_before_session(
            conn,
            &created.entity.id,
            Some(offset_days),
            session_id,
        )?;
        get_assignment(conn, &created.entity.id)
    })
}

pub fn list_assignments(conn: &Connection, space_id: &str) -> AppResult<Vec<Assignment>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, a.due_date, a.due_session_offset_days, a.weight, a.status, a.grade FROM entities e
         JOIN assignments a ON a.entity_id = e.id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY a.due_date ASC",
    )?;
    let rows = stmt.query_map(params![space_id], row_to_assignment)?;
    resolve_all(conn, rows.collect::<Result<Vec<_>, _>>()?)
}

/// Cross-Space, for the Dashboard briefing's Exam/Assignment clause.
pub fn list_assignments_all_spaces(conn: &Connection) -> AppResult<Vec<Assignment>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, a.due_date, a.due_session_offset_days, a.weight, a.status, a.grade FROM entities e
         JOIN assignments a ON a.entity_id = e.id
         WHERE e.deleted_at IS NULL ORDER BY a.due_date ASC",
    )?;
    let rows = stmt.query_map([], row_to_assignment)?;
    resolve_all(conn, rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn update_assignment_status(
    conn: &Connection,
    entity_id: &str,
    status: String,
    grade: Option<f64>,
) -> AppResult<()> {
    crate::db::require_one_of("status", &status, ASSIGNMENT_STATUSES)?;
    let affected = conn.execute(
        "UPDATE assignments SET status = ?1, grade = ?2 WHERE entity_id = ?3",
        params![status, grade, entity_id],
    )?;
    crate::db::require_row(affected, "assignment", entity_id)?;
    Ok(())
}

pub fn update_assignment_due_date(
    conn: &Connection,
    entity_id: &str,
    due_date: Option<String>,
) -> AppResult<()> {
    let affected = conn.execute(
        "UPDATE assignments SET due_date = ?1, due_session_offset_days = NULL WHERE entity_id = ?2",
        params![due_date, entity_id],
    )?;
    crate::db::require_row(affected, "assignment", entity_id)?;
    clear_due_session(conn, entity_id)?;
    Ok(())
}

/// `None` clears the weight.
pub fn update_assignment_weight(
    conn: &Connection,
    entity_id: &str,
    weight: Option<f64>,
) -> AppResult<()> {
    if weight.is_some_and(|w| !w.is_finite() || w < 0.0) {
        return Err(crate::error::AppError::InvalidInput(
            "weight must be a number of 0 or more".into(),
        ));
    }
    let affected = conn.execute(
        "UPDATE assignments SET weight = ?1 WHERE entity_id = ?2",
        params![weight, entity_id],
    )?;
    crate::db::require_row(affected, "assignment", entity_id)?;
    Ok(())
}

/// Makes the assignment due this many days before its course's next session, or, with
/// `session_id`, before that one session of its course, or, with `None` as the offset,
/// back to its fixed due date. The due day itself is worked out when read, so it follows
/// sessions that move, get cancelled or trashed.
pub fn update_assignment_due_before_session(
    conn: &Connection,
    entity_id: &str,
    offset_days: Option<i64>,
    session_id: Option<String>,
) -> AppResult<()> {
    if offset_days.is_some_and(|days| !(0..=365).contains(&days)) {
        return Err(crate::error::AppError::InvalidInput(
            "dueSessionOffsetDays must be between 0 and 365".into(),
        ));
    }
    if offset_days.is_none() && session_id.is_some() {
        return Err(crate::error::AppError::InvalidInput(
            "dueSessionId needs dueSessionOffsetDays".into(),
        ));
    }
    crate::db::atomically(conn, || {
        let affected = conn.execute(
            "UPDATE assignments SET due_session_offset_days = ?1 WHERE entity_id = ?2",
            params![offset_days, entity_id],
        )?;
        crate::db::require_row(affected, "assignment", entity_id)?;
        clear_due_session(conn, entity_id)?;
        let Some(session_id) = session_id else {
            return Ok(());
        };
        let course_id = course_of(conn, "assignment-course", entity_id)?;
        if course_id.is_none() || course_id != course_of(conn, "session-course", &session_id)? {
            return Err(crate::error::AppError::InvalidInput(
                "dueSessionId must be a session of the assignment's course".into(),
            ));
        }
        crate::db::relationships::create_relationship(
            conn,
            entity_id.to_string(),
            session_id,
            "assignment-due-session".into(),
            None,
            None,
        )?;
        Ok(())
    })
}

fn clear_due_session(conn: &Connection, entity_id: &str) -> AppResult<()> {
    conn.execute(
        "DELETE FROM relationships WHERE from_entity_id = ?1 AND relationship_type = 'assignment-due-session'",
        params![entity_id],
    )?;
    Ok(())
}

/// The one entity `from_id` points at with `relationship_type` (its Course).
fn course_of(
    conn: &Connection,
    relationship_type: &str,
    from_id: &str,
) -> AppResult<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT to_entity_id FROM relationships WHERE from_entity_id = ?1 AND relationship_type = ?2",
            params![from_id, relationship_type],
            |row| row.get(0),
        )
        .optional()?)
}

fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// Local `HH:MM`, the shape of a session's `start_time`.
fn clock_now() -> String {
    chrono::Local::now().format("%H:%M").to_string()
}

/// The day an assignment due `offset_days` before the course's next session is due: that
/// session is the first one, not cancelled or trashed, that has not started at `today`
/// and `now` (`HH:MM`); one today that has started or finished is skipped. The day itself
/// may already be past (a week before a session three days away), which makes it overdue.
/// With none left, it stays on the course's last session that still exists, cancelled or
/// past, so cancelling the only session doesn't wipe the due date. `None` only for a
/// course without sessions.
pub fn next_session_due(
    conn: &Connection,
    course_id: &str,
    offset_days: i64,
    today: &str,
    now: &str,
) -> AppResult<Option<String>> {
    let shift = format!("-{offset_days} days");
    let from_course = "FROM sessions s
         JOIN entities e ON e.id = s.entity_id
         JOIN relationships r ON r.from_entity_id = s.entity_id
           AND r.relationship_type = 'session-course' AND r.to_entity_id = ?1
         WHERE e.deleted_at IS NULL";
    let upcoming: Option<String> = conn
        .query_row(
            &format!(
                "SELECT date(s.date, ?2) {from_course} AND s.cancelled = 0
                 AND (s.date > ?3 OR (s.date = ?3 AND s.start_time > ?4))
                 ORDER BY s.date ASC, s.start_time ASC LIMIT 1"
            ),
            params![course_id, shift, today, now],
            |row| row.get(0),
        )
        .optional()?;
    if upcoming.is_some() {
        return Ok(upcoming);
    }
    Ok(conn
        .query_row(
            &format!("SELECT date(s.date, ?2) {from_course} ORDER BY s.date DESC LIMIT 1"),
            params![course_id, shift],
            |row| row.get(0),
        )
        .optional()?)
}

fn resolve_due_date(
    conn: &Connection,
    assignment: &mut Assignment,
    today: &str,
    now: &str,
) -> AppResult<()> {
    let Some(offset) = assignment.due_session_offset_days else {
        return Ok(());
    };
    // A picked session wins over the next one. Cancelled or trashed, the day moves on
    // to the first live session after it; with none, it stays on the pick's own day,
    // so cancelling the last session doesn't wipe the due date. The link stays on the
    // pick, so un-cancelling or restoring it brings its day back.
    if let Some(session_id) = course_of(conn, "assignment-due-session", &assignment.entity.id)? {
        let shift = format!("-{offset} days");
        let picked: Option<(String, String, bool)> = conn
            .query_row(
                "SELECT s.date, s.start_time, s.cancelled = 0 AND e.deleted_at IS NULL
                 FROM sessions s JOIN entities e ON e.id = s.entity_id WHERE s.entity_id = ?1",
                params![session_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;
        if let Some((date, start_time, live)) = picked {
            let day: Option<String> = if live {
                conn.query_row("SELECT date(?1, ?2)", params![date, shift], |row| {
                    row.get(0)
                })?
            } else {
                conn.query_row(
                    "SELECT date(s.date, ?5) FROM sessions s
                     JOIN entities e ON e.id = s.entity_id
                     JOIN relationships r ON r.from_entity_id = s.entity_id
                       AND r.relationship_type = 'session-course'
                       AND r.to_entity_id = (SELECT to_entity_id FROM relationships
                         WHERE from_entity_id = ?1 AND relationship_type = 'session-course')
                     WHERE e.deleted_at IS NULL AND s.cancelled = 0
                       AND (s.date > ?2 OR (s.date = ?2 AND s.start_time > ?3))
                     ORDER BY s.date ASC, s.start_time ASC LIMIT 1",
                    params![session_id, date, start_time, "", shift],
                    |row| row.get(0),
                )
                .optional()?
                .or(conn.query_row(
                    "SELECT date(?1, ?2)",
                    params![date, shift],
                    |row| row.get(0),
                )?)
            };
            assignment.due_date = day;
            assignment.due_session_id = Some(session_id);
            return Ok(());
        }
    }
    let course_id = course_of(conn, "assignment-course", &assignment.entity.id)?;
    assignment.due_date = match course_id {
        Some(course_id) => next_session_due(conn, &course_id, offset, today, now)?,
        None => None,
    };
    Ok(())
}

/// Resolves every session relative due day, then puts the list back in due order
/// (undated first, like the stored column sorts).
fn resolve_all(conn: &Connection, mut assignments: Vec<Assignment>) -> AppResult<Vec<Assignment>> {
    let (today, now) = (today(), clock_now());
    for assignment in &mut assignments {
        resolve_due_date(conn, assignment, &today, &now)?;
    }
    assignments.sort_by(|a, b| a.due_date.cmp(&b.due_date));
    Ok(assignments)
}

/// Moves an assignment to another Course, replacing its one `assignment-course`
/// link rather than erroring on the cardinality rule.
pub fn set_assignment_course(
    conn: &Connection,
    entity_id: &str,
    course_id: String,
) -> AppResult<()> {
    crate::db::atomically(conn, || {
        conn.execute(
            "DELETE FROM relationships WHERE from_entity_id = ?1 AND relationship_type = 'assignment-course'",
            params![entity_id],
        )?;
        crate::db::relationships::create_relationship(
            conn,
            entity_id.to_string(),
            course_id,
            "assignment-course".into(),
            None,
            None,
        )?;
        Ok(())
    })
}

pub fn get_assignment(conn: &Connection, entity_id: &str) -> AppResult<Assignment> {
    let mut assignment = conn
        .query_row(
            "SELECT e.*, a.due_date, a.due_session_offset_days, a.weight, a.status, a.grade FROM entities e
         JOIN assignments a ON a.entity_id = e.id WHERE e.id = ?1",
            params![entity_id],
            row_to_assignment,
        )
        .optional()?
        .ok_or_else(|| crate::error::AppError::NotFound(format!("assignment {entity_id}")))?;
    resolve_due_date(conn, &mut assignment, &today(), &clock_now())?;
    Ok(assignment)
}

// --- CLI schema registration (PLAN.md §1/§3) -------------------------------

const ASSIGNMENT_FIELDS: &[FieldDef] = &[
    FieldDef {
        name: "courseId",
        kind: FieldKind::EntityRef("course"),
        required_on_create: true,
        writable_on_update: true,
        description: "The Course this assignment belongs to (structural: exactly one). Updating it moves the assignment.",
    },
    FieldDef {
        name: "dueDate",
        kind: FieldKind::Date,
        required_on_create: false,
        writable_on_update: true,
        description: "ISO date. Pass null to clear it.",
    },
    FieldDef {
        name: "dueSessionOffsetDays",
        kind: FieldKind::Integer,
        required_on_create: false,
        writable_on_update: true,
        description: "Due this many days before the Course's next session (0 to 365; 0 is the day of it), instead of a fixed dueDate. dueDate then reads the resolved day, which follows moved, cancelled and trashed sessions. Pass null to go back to the fixed date; setting dueDate does too.",
    },
    FieldDef {
        name: "dueSessionId",
        kind: FieldKind::EntityRef("session"),
        required_on_create: false,
        writable_on_update: true,
        description: "A session of the Course the due day follows, instead of its next session, shifted by dueSessionOffsetDays (0 when not given). dueDate reads the resolved day, which follows that session when it moves. Pass null to follow the next session again; setting dueDate drops it too.",
    },
    FieldDef {
        name: "weight",
        kind: FieldKind::Float,
        required_on_create: false,
        writable_on_update: true,
        description: "Its share of the Course's grade, as a fraction (0.25) or a whole percentage (25). Without one it splits what the weighted work leaves evenly. Pass null to clear it.",
    },
    FieldDef {
        name: "status",
        kind: FieldKind::Enum(ASSIGNMENT_STATUSES),
        required_on_create: false,
        writable_on_update: true,
        description: "Defaults to 'not_started' on creation.",
    },
    FieldDef {
        name: "grade",
        kind: FieldKind::Float,
        required_on_create: false,
        writable_on_update: true,
        description: "Grade received.",
    },
];

fn cli_create_assignment(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    let course_id = crate::db::schema::require_str(&input.fields, "courseId")?;
    let due_date = crate::db::schema::field_str(&input.fields, "dueDate");
    let assignment = create_assignment(conn, input.space_id, input.title, course_id, due_date)?;
    if input.fields.contains_key("weight") {
        let weight = crate::db::schema::field_f64(&input.fields, "weight");
        update_assignment_weight(conn, &assignment.entity.id, weight)?;
    }
    let session_id = crate::db::schema::field_str(&input.fields, "dueSessionId");
    let days = crate::db::schema::field_i64(&input.fields, "dueSessionOffsetDays")
        .or(session_id.as_ref().map(|_| 0));
    if days.is_some() {
        update_assignment_due_before_session(conn, &assignment.entity.id, days, session_id)?;
        return cli_get_assignment(conn, &assignment.entity.id);
    }
    Ok(serde_json::to_value(assignment).expect("Assignment always serializes"))
}

fn cli_update_assignment(
    conn: &Connection,
    id: &str,
    fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    let current = get_assignment(conn, id)?;
    let status = crate::db::schema::field_str(fields, "status").unwrap_or(current.status);
    let grade = crate::db::schema::field_f64(fields, "grade").or(current.grade);
    update_assignment_status(conn, id, status, grade)?;
    if let Some(course_id) = crate::db::schema::field_str(fields, "courseId") {
        set_assignment_course(conn, id, course_id)?;
    }
    if fields.contains_key("dueDate") {
        let due_date = crate::db::schema::field_str(fields, "dueDate");
        update_assignment_due_date(conn, id, due_date)?;
    }
    if fields.contains_key("weight") {
        update_assignment_weight(conn, id, crate::db::schema::field_f64(fields, "weight"))?;
    }
    if fields.contains_key("dueSessionOffsetDays") || fields.contains_key("dueSessionId") {
        let session_id = if fields.contains_key("dueSessionId") {
            crate::db::schema::field_str(fields, "dueSessionId")
        } else if fields.contains_key("dueSessionOffsetDays") {
            None
        } else {
            current.due_session_id
        };
        let days = if fields.contains_key("dueSessionOffsetDays") {
            crate::db::schema::field_i64(fields, "dueSessionOffsetDays")
        } else {
            current.due_session_offset_days
        }
        .or(session_id.as_ref().map(|_| 0));
        update_assignment_due_before_session(conn, id, days, session_id)?;
    }
    cli_get_assignment(conn, id)
}

fn cli_get_assignment(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    Ok(serde_json::to_value(get_assignment(conn, id)?).expect("Assignment always serializes"))
}

fn cli_list_assignments(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id.ok_or_else(|| {
        crate::error::AppError::InvalidInput("assignment list requires --space <space-id>".into())
    })?;
    Ok(list_assignments(conn, space_id)?
        .into_iter()
        .map(|a| serde_json::to_value(a).expect("Assignment always serializes"))
        .collect())
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "assignment",
        supports_blocks: true,
        description: "A gradeable assignment belonging to exactly one Course.",
        fields: ASSIGNMENT_FIELDS,
        relationship_types: &["assignment-course", "assignment-due-session", "relates-to"],
        create: cli_create_assignment,
        update: cli_update_assignment,
        get: cli_get_assignment,
        list: cli_list_assignments,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::courses::create_course;

    fn setup() -> Connection {
        crate::db::test_conn()
    }

    fn course_of(conn: &Connection, id: &str) -> String {
        conn.query_row(
            "SELECT to_entity_id FROM relationships
             WHERE from_entity_id = ?1 AND relationship_type = 'assignment-course'",
            params![id],
            |row| row.get(0),
        )
        .unwrap()
    }

    #[test]
    fn set_assignment_course_moves_it() {
        let conn = setup();
        let (space, algo) = crate::db::test_space_with_course(&conn, "Uni", "Algorithms");
        let math = create_course(&conn, space.id.clone(), "Math".into()).unwrap();
        let a = create_assignment(&conn, space.id, "Sheet 1".into(), algo.id, None).unwrap();

        set_assignment_course(&conn, &a.entity.id, math.id.clone()).unwrap();
        assert_eq!(course_of(&conn, &a.entity.id), math.id);
    }

    #[test]
    fn set_assignment_course_keeps_the_old_link_on_failure() {
        let conn = setup();
        let (space, algo) = crate::db::test_space_with_course(&conn, "Uni", "Algorithms");
        let a =
            create_assignment(&conn, space.id, "Sheet 1".into(), algo.id.clone(), None).unwrap();

        assert!(set_assignment_course(&conn, &a.entity.id, "missing".into()).is_err());
        assert_eq!(course_of(&conn, &a.entity.id), algo.id);
    }
}
