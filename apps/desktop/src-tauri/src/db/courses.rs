use crate::db::entities::Entity;
use crate::db::relationships::{Cardinality, MovesWith, RelationshipTypeDef};
use crate::db::schema::{CreateInput, EntitySchemaDef, FieldDef, FieldKind, JsonMap};
use crate::error::AppResult;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

inventory::submit! {
    RelationshipTypeDef { name: "sequel-of", inverse_label: "prequel-of", cardinality: Cardinality::Unrestricted, moves_with: MovesWith::Independent }
}
inventory::submit! {
    // A Course belongs to at most one Semester (`OneToPerFrom` = the `from`
    // side, Course, capped at one); a Semester has unrestricted Courses.
    RelationshipTypeDef { name: "course-semester", inverse_label: "has course", cardinality: Cardinality::OneToPerFrom, moves_with: MovesWith::Independent }
}
inventory::submit! {
    RelationshipTypeDef { name: "course-notes", inverse_label: "notes for course", cardinality: Cardinality::OneToPerFrom, moves_with: MovesWith::ToFollowsFrom }
}
inventory::submit! {
    RelationshipTypeDef { name: "semester-notes", inverse_label: "notes for semester", cardinality: Cardinality::OneToPerFrom, moves_with: MovesWith::ToFollowsFrom }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Semester {
    pub entity: Entity,
    /// Approximate, cosmetic only (PLAN §1) — never used for sorting or
    /// 'current' detection. `term_type`/`year` are the source of truth.
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    /// e.g. "winter" / "summer" / "fall" / "spring" — fixed keys the
    /// frontend's academic-system config knows about, not a DB-level enum.
    pub term_type: Option<String>,
    pub year: Option<i64>,
    /// User's manual "this is the current semester" override. At most one
    /// per Space should be true — enforced in `set_current_semester`, not at
    /// the data layer.
    pub is_current: bool,
    /// Drag-reorder override. `None` = fall back to chronological
    /// `term_type`/`year` ordering.
    pub manual_position: Option<i64>,
}

fn row_to_semester(row: &rusqlite::Row) -> rusqlite::Result<Semester> {
    Ok(Semester {
        entity: crate::db::entities::row_to_entity(row)?,
        start_date: row.get("start_date")?,
        end_date: row.get("end_date")?,
        term_type: row.get("term_type")?,
        year: row.get("year")?,
        is_current: row.get::<_, i64>("is_current")? != 0,
        manual_position: row.get("manual_position")?,
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

pub fn get_semester(conn: &Connection, entity_id: &str) -> AppResult<Semester> {
    conn.query_row(
        "SELECT e.*, s.start_date, s.end_date, s.term_type, s.year, s.is_current, s.manual_position
         FROM entities e JOIN semesters s ON s.entity_id = e.id WHERE e.id = ?1",
        params![entity_id],
        row_to_semester,
    )
    .optional()?
    .ok_or_else(|| crate::error::AppError::NotFound(format!("semester {entity_id}")))
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
    term_type: Option<String>,
    year: Option<i64>,
) -> AppResult<Semester> {
    let entity =
        crate::db::entities::create_entity(conn, space_id, "semester".into(), title, None)?;
    conn.execute(
        "INSERT INTO semesters (entity_id, start_date, end_date, term_type, year) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![entity.id, start_date, end_date, term_type, year],
    )?;
    Ok(Semester {
        entity,
        start_date,
        end_date,
        term_type,
        year,
        is_current: false,
        manual_position: None,
    })
}

pub fn list_semesters(conn: &Connection, space_id: &str) -> AppResult<Vec<Semester>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, s.start_date, s.end_date, s.term_type, s.year, s.is_current, s.manual_position
         FROM entities e JOIN semesters s ON s.entity_id = e.id
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
    term_type: Option<String>,
    year: Option<i64>,
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
    if let Some(term_type) = term_type {
        conn.execute(
            "UPDATE semesters SET term_type = ?1 WHERE entity_id = ?2",
            params![term_type, entity_id],
        )?;
    }
    if let Some(year) = year {
        conn.execute(
            "UPDATE semesters SET year = ?1 WHERE entity_id = ?2",
            params![year, entity_id],
        )?;
    }
    Ok(())
}

/// Manual "flag as current" override (PLAN §2) — clears the flag on every
/// other Semester in the Space first so at most one stays current.
pub fn set_current_semester(conn: &Connection, space_id: &str, entity_id: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE semesters SET is_current = 0
         WHERE entity_id IN (SELECT id FROM entities WHERE space_id = ?1)",
        params![space_id],
    )?;
    conn.execute(
        "UPDATE semesters SET is_current = 1 WHERE entity_id = ?1",
        params![entity_id],
    )?;
    Ok(())
}

/// Drag-reorder override (PLAN §2) — `ordered_ids` is the full new display
/// order; each gets its list index as `manual_position`.
pub fn reorder_semesters(conn: &Connection, ordered_ids: Vec<String>) -> AppResult<()> {
    for (position, entity_id) in ordered_ids.into_iter().enumerate() {
        conn.execute(
            "UPDATE semesters SET manual_position = ?1 WHERE entity_id = ?2",
            params![position as i64, entity_id],
        )?;
    }
    Ok(())
}

/// Links a Course to the Semester it runs in. A Course has at most one
/// Semester at a time (`course-semester` is `OneToPerFrom`) — a Semester can
/// have any number of Courses. To move a Course to a different Semester, use
/// `set_course_semester` instead (this fn errors on a second link).
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

/// Reassigns a Course's Semester — since `course-semester` is capped at one
/// per Course, moving a Course to a different Semester means dropping its
/// existing link first, not just adding a new one (which `create_relationship`
/// would reject as a cardinality violation).
pub fn set_course_semester(
    conn: &Connection,
    course_id: &str,
    semester_id: String,
) -> AppResult<()> {
    conn.execute(
        "DELETE FROM relationships WHERE from_entity_id = ?1 AND relationship_type = 'course-semester'",
        params![course_id],
    )?;
    link_course_to_semester(conn, course_id.to_string(), semester_id)
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

/// Every Semester gets exactly one Semester Notes page, rendered inline on the
/// Semester page (PLAN §2) — found via the `semester-notes` structural
/// relationship, or created lazily on first request.
///
/// Unlike Course Notes, this is a real `note` entity, not a dedicated hidden
/// type: it's meant to be exportable/searchable/listed like any other Note,
/// just auto-created and structurally linked from the Semester side. No
/// special-case hiding needed anywhere (contrast `course_notes` in
/// `entities.rs`/`search.rs`).
pub fn get_or_create_semester_notes(conn: &Connection, semester_id: &str) -> AppResult<Entity> {
    let existing: Option<String> = conn
        .query_row(
            "SELECT to_entity_id FROM relationships
             WHERE from_entity_id = ?1 AND relationship_type = 'semester-notes'",
            params![semester_id],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(note_id) = existing {
        return crate::db::entities::get_entity(conn, &note_id);
    }

    let semester = crate::db::entities::get_entity(conn, semester_id)?;
    let title = if semester.title.trim().is_empty() {
        "Semester Notes".to_string()
    } else {
        format!("{} Notes", semester.title)
    };
    let note = crate::db::notes::create_page(conn, semester.space_id, "note", title)?;
    crate::db::relationships::create_relationship(
        conn,
        semester_id.to_string(),
        note.id.clone(),
        "semester-notes".into(),
        None,
        None,
    )?;
    Ok(note)
}

/// A Course's grade rolled up from its Exams and Assignments.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CourseGrades {
    /// Weighted mean of the graded items, on whatever scale the grades use.
    /// `None` until something with weight is graded.
    pub grade: Option<f64>,
    /// Share of the course's total weight that is graded, from 0 to 1.
    pub graded_weight: f64,
    pub graded_count: usize,
    pub item_count: usize,
}

/// Exams with a weight count for exactly that share. Assignments and Exams
/// without one split whatever weight is left evenly, so a course with no
/// weights at all is a plain mean. Weights above 1 are read as percentages.
fn roll_up_grades(items: &[(Option<f64>, Option<f64>)]) -> CourseGrades {
    let weights: Vec<Option<f64>> = items
        .iter()
        .map(|(weight, _)| {
            weight
                .filter(|w| *w >= 0.0)
                .map(|w| if w > 1.0 { w / 100.0 } else { w })
        })
        .collect();
    let fixed: f64 = weights.iter().flatten().sum();
    let unweighted = weights.iter().filter(|w| w.is_none()).count();
    let share = if unweighted > 0 {
        (1.0 - fixed).max(0.0) / unweighted as f64
    } else {
        0.0
    };

    let (mut total, mut graded, mut sum, mut graded_count) = (0.0, 0.0, 0.0, 0);
    for ((_, grade), weight) in items.iter().zip(&weights) {
        let weight = weight.unwrap_or(share);
        total += weight;
        if let Some(grade) = grade {
            graded += weight;
            sum += weight * grade;
            graded_count += 1;
        }
    }
    CourseGrades {
        grade: (graded > 0.0).then(|| sum / graded),
        graded_weight: if total > 0.0 { graded / total } else { 0.0 },
        graded_count,
        item_count: items.len(),
    }
}

pub fn get_course_grades(conn: &Connection, course_id: &str) -> AppResult<CourseGrades> {
    let mut stmt = conn.prepare(
        "SELECT x.weight, x.grade FROM exams x
         JOIN entities e ON e.id = x.entity_id
         JOIN relationships r ON r.from_entity_id = x.entity_id AND r.relationship_type = 'exam-course'
         WHERE r.to_entity_id = ?1 AND e.deleted_at IS NULL
         UNION ALL
         SELECT NULL, a.grade FROM assignments a
         JOIN entities e ON e.id = a.entity_id
         JOIN relationships r ON r.from_entity_id = a.entity_id AND r.relationship_type = 'assignment-course'
         WHERE r.to_entity_id = ?1 AND e.deleted_at IS NULL",
    )?;
    let items = stmt
        .query_map(params![course_id], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(roll_up_grades(&items))
}

// --- CLI schema registration (PLAN.md §1/§3) -------------------------------

fn cli_create_course(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    let entity = create_course(conn, input.space_id, input.title)?;
    course_payload(conn, entity)
}

fn cli_get_course(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    course_payload(conn, crate::db::entities::get_entity(conn, id)?)
}

/// The Course entity plus its `grades` computed field.
fn course_payload(conn: &Connection, entity: Entity) -> AppResult<serde_json::Value> {
    let grades = get_course_grades(conn, &entity.id)?;
    let mut value = serde_json::to_value(entity).expect("Entity always serializes");
    value["grades"] = serde_json::to_value(grades).expect("CourseGrades always serializes");
    Ok(value)
}

inventory::submit! {
    crate::db::schema::ComputedFieldDef {
        entity_type: "course",
        name: "grades",
        kind: FieldKind::Object,
        description: "Read only rollup of the course's Exam and Assignment grades: \
                      { grade, gradedWeight, gradedCount, itemCount }. `grade` is the weighted mean of graded items \
                      (null until one is graded). Exams with a weight count for that share, Assignments and \
                      unweighted Exams split the remaining weight evenly. `gradedWeight` is the graded share of \
                      total weight, 0 to 1.",
    }
}

fn cli_update_course(
    conn: &Connection,
    id: &str,
    _fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    // No subtype fields — a Course's Semester is a generic (non-structural)
    // relationship, set via `nookly cli relate <course> course-semester <semester>`.
    cli_get_course(conn, id)
}

fn cli_list_courses(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id.ok_or_else(|| {
        crate::error::AppError::InvalidInput("course list requires --space <space-id>".into())
    })?;
    list_courses(conn, space_id)?
        .into_iter()
        .map(|e| course_payload(conn, e))
        .collect()
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "course",
        supports_blocks: false,
        description: "A course within a Space, optionally linked to a Semester.",
        fields: &[],
        relationship_types: &["sequel-of", "course-semester", "course-notes", "relates-to"],
        create: cli_create_course,
        update: cli_update_course,
        get: cli_get_course,
        list: cli_list_courses,
    }
}

const SEMESTER_FIELDS: &[FieldDef] = &[
    FieldDef {
        name: "startDate",
        kind: FieldKind::Date,
        required_on_create: false,
        writable_on_update: true,
        description:
            "Cosmetic only — never used for sorting or 'current' detection (see termType/year).",
    },
    FieldDef {
        name: "endDate",
        kind: FieldKind::Date,
        required_on_create: false,
        writable_on_update: true,
        description: "Cosmetic only.",
    },
    FieldDef {
        name: "termType",
        kind: FieldKind::Text,
        required_on_create: false,
        writable_on_update: true,
        description:
            "Typically one of: winter, spring, summer, fall. Source of truth for ordering.",
    },
    FieldDef {
        name: "year",
        kind: FieldKind::Integer,
        required_on_create: false,
        writable_on_update: true,
        description: "Source of truth for ordering, alongside termType.",
    },
];

fn cli_create_semester(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    let start_date = crate::db::schema::field_str(&input.fields, "startDate");
    let end_date = crate::db::schema::field_str(&input.fields, "endDate");
    let term_type = crate::db::schema::field_str(&input.fields, "termType");
    let year = crate::db::schema::field_i64(&input.fields, "year");
    let semester = create_semester(
        conn,
        input.space_id,
        input.title,
        start_date,
        end_date,
        term_type,
        year,
    )?;
    Ok(serde_json::to_value(semester).expect("Semester always serializes"))
}

fn cli_update_semester(
    conn: &Connection,
    id: &str,
    fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    let start_date = crate::db::schema::field_str(fields, "startDate");
    let end_date = crate::db::schema::field_str(fields, "endDate");
    let term_type = crate::db::schema::field_str(fields, "termType");
    let year = crate::db::schema::field_i64(fields, "year");
    update_semester(conn, id, start_date, end_date, term_type, year)?;
    cli_get_semester(conn, id)
}

fn cli_get_semester(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    Ok(serde_json::to_value(get_semester(conn, id)?).expect("Semester always serializes"))
}

fn cli_list_semesters(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id.ok_or_else(|| {
        crate::error::AppError::InvalidInput("semester list requires --space <space-id>".into())
    })?;
    Ok(list_semesters(conn, space_id)?
        .into_iter()
        .map(|s| serde_json::to_value(s).expect("Semester always serializes"))
        .collect())
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "semester",
        supports_blocks: false,
        description: "A Semester groups Courses within a Space.",
        fields: SEMESTER_FIELDS,
        relationship_types: &["course-semester", "semester-notes", "relates-to"],
        create: cli_create_semester,
        update: cli_update_semester,
        get: cli_get_semester,
        list: cli_list_semesters,
    }
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
            Some("winter".into()),
            Some(2026),
        )
        .unwrap();

        assert_eq!(semester.start_date, Some("2026-10-01".into()));
        assert_eq!(semester.end_date, Some("2027-02-15".into()));
        assert_eq!(semester.term_type, Some("winter".into()));
        assert_eq!(semester.year, Some(2026));

        let listed = list_semesters(&conn, &space.id).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].start_date, Some("2026-10-01".into()));
        assert_eq!(listed[0].end_date, Some("2027-02-15".into()));
        assert_eq!(listed[0].term_type, Some("winter".into()));
        assert_eq!(listed[0].year, Some(2026));
    }

    #[test]
    fn update_semester_sets_only_given_fields() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let semester = create_semester(
            &conn,
            space.id.clone(),
            "WS 2026/27".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();

        update_semester(
            &conn,
            &semester.entity.id,
            Some("2026-10-01".into()),
            None,
            None,
            None,
        )
        .unwrap();
        let listed = list_semesters(&conn, &space.id).unwrap();
        assert_eq!(listed[0].start_date, Some("2026-10-01".into()));
        assert_eq!(listed[0].end_date, None);

        update_semester(
            &conn,
            &semester.entity.id,
            None,
            Some("2027-02-15".into()),
            Some("winter".into()),
            Some(2026),
        )
        .unwrap();
        let listed = list_semesters(&conn, &space.id).unwrap();
        assert_eq!(listed[0].start_date, Some("2026-10-01".into()));
        assert_eq!(listed[0].end_date, Some("2027-02-15".into()));
        assert_eq!(listed[0].term_type, Some("winter".into()));
        assert_eq!(listed[0].year, Some(2026));
    }

    #[test]
    fn set_current_semester_clears_other_semesters_in_space() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let a = create_semester(
            &conn,
            space.id.clone(),
            "WS 2025/26".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        let b = create_semester(
            &conn,
            space.id.clone(),
            "WS 2026/27".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();

        set_current_semester(&conn, &space.id, &a.entity.id).unwrap();
        set_current_semester(&conn, &space.id, &b.entity.id).unwrap();

        let listed = list_semesters(&conn, &space.id).unwrap();
        let a_listed = listed.iter().find(|s| s.entity.id == a.entity.id).unwrap();
        let b_listed = listed.iter().find(|s| s.entity.id == b.entity.id).unwrap();
        assert!(!a_listed.is_current);
        assert!(b_listed.is_current);
    }

    #[test]
    fn reorder_semesters_sets_manual_position_by_index() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let a =
            create_semester(&conn, space.id.clone(), "A".into(), None, None, None, None).unwrap();
        let b =
            create_semester(&conn, space.id.clone(), "B".into(), None, None, None, None).unwrap();

        reorder_semesters(&conn, vec![b.entity.id.clone(), a.entity.id.clone()]).unwrap();

        let listed = list_semesters(&conn, &space.id).unwrap();
        let a_listed = listed.iter().find(|s| s.entity.id == a.entity.id).unwrap();
        let b_listed = listed.iter().find(|s| s.entity.id == b.entity.id).unwrap();
        assert_eq!(b_listed.manual_position, Some(0));
        assert_eq!(a_listed.manual_position, Some(1));
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

    #[test]
    fn semester_notes_are_created_once_and_reused() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let semester = create_semester(
            &conn,
            space.id.clone(),
            "WS 2026/27".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();

        let notes = get_or_create_semester_notes(&conn, &semester.entity.id).unwrap();
        assert_eq!(notes.entity_type, "note");
        assert_eq!(notes.title, "WS 2026/27 Notes");

        let again = get_or_create_semester_notes(&conn, &semester.entity.id).unwrap();
        assert_eq!(again.id, notes.id);
    }

    #[test]
    fn semester_notes_are_listed_as_a_real_note() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let semester = create_semester(
            &conn,
            space.id.clone(),
            "WS 2026/27".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        get_or_create_semester_notes(&conn, &semester.entity.id).unwrap();

        let recent_notes = crate::db::notes::list_recent_notes(&conn, &space.id, 10).unwrap();
        assert_eq!(recent_notes.len(), 1);
    }

    #[test]
    fn course_can_only_belong_to_one_semester_at_a_time() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let course = create_course(&conn, space.id.clone(), "Algorithms".into()).unwrap();
        let fall = create_semester(
            &conn,
            space.id.clone(),
            "Fall".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        let spring = create_semester(
            &conn,
            space.id.clone(),
            "Spring".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();

        link_course_to_semester(&conn, course.id.clone(), fall.entity.id.clone()).unwrap();
        let second_link =
            link_course_to_semester(&conn, course.id.clone(), spring.entity.id.clone());
        assert!(second_link.is_err());
    }

    #[test]
    fn semester_can_have_many_courses() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let semester = create_semester(
            &conn,
            space.id.clone(),
            "Fall".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        let a = create_course(&conn, space.id.clone(), "Algorithms".into()).unwrap();
        let b = create_course(&conn, space.id.clone(), "Databases".into()).unwrap();

        link_course_to_semester(&conn, a.id, semester.entity.id.clone()).unwrap();
        link_course_to_semester(&conn, b.id, semester.entity.id.clone()).unwrap();
    }

    #[test]
    fn set_course_semester_reassigns_instead_of_erroring() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let course = create_course(&conn, space.id.clone(), "Algorithms".into()).unwrap();
        let fall = create_semester(
            &conn,
            space.id.clone(),
            "Fall".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        let spring = create_semester(
            &conn,
            space.id.clone(),
            "Spring".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();

        link_course_to_semester(&conn, course.id.clone(), fall.entity.id.clone()).unwrap();
        set_course_semester(&conn, &course.id, spring.entity.id.clone()).unwrap();

        let links = crate::db::relationships::list_relationships(
            &conn,
            &course.id,
            crate::db::relationships::Direction::From,
        )
        .unwrap();
        let semester_links: Vec<_> = links
            .iter()
            .filter(|r| r.relationship_type == "course-semester")
            .collect();
        assert_eq!(semester_links.len(), 1);
        assert_eq!(semester_links[0].to_entity_id, spring.entity.id);
    }

    #[test]
    fn grades_without_weights_are_a_plain_mean() {
        let grades = roll_up_grades(&[(None, Some(1.0)), (None, Some(2.0)), (None, None)]);
        assert_eq!(grades.grade, Some(1.5));
        assert!((grades.graded_weight - 2.0 / 3.0).abs() < 1e-9);
        assert_eq!((grades.graded_count, grades.item_count), (2, 3));
    }

    #[test]
    fn weighted_exams_leave_the_rest_to_unweighted_items() {
        // Exam 60% graded 2.0, two assignments share 40%, one graded 1.0.
        let grades = roll_up_grades(&[(Some(0.6), Some(2.0)), (None, Some(1.0)), (None, None)]);
        assert!((grades.grade.unwrap() - (0.6 * 2.0 + 0.2) / 0.8).abs() < 1e-9);
        assert!((grades.graded_weight - 0.8).abs() < 1e-9);
    }

    #[test]
    fn percentage_weights_and_empty_courses() {
        let grades = roll_up_grades(&[(Some(100.0), Some(1.7)), (None, Some(4.0))]);
        assert_eq!(grades.grade, Some(1.7));
        let empty = roll_up_grades(&[]);
        assert_eq!((empty.grade, empty.graded_weight), (None, 0.0));
    }

    #[test]
    fn course_grades_read_linked_exams_and_assignments() {
        let conn = setup();
        let space = create_space(&conn, "Uni".into(), None, "#000".into()).unwrap();
        let course = create_course(&conn, space.id.clone(), "Algorithms".into()).unwrap();
        let other = create_course(&conn, space.id.clone(), "Other".into()).unwrap();
        let exam = crate::db::exams::create_exam(
            &conn,
            space.id.clone(),
            "Final".into(),
            course.id.clone(),
            None,
            Some(0.5),
        )
        .unwrap();
        crate::db::exams::update_exam_grade(&conn, &exam.entity.id, Some(2.0)).unwrap();
        let assignment = crate::db::assignments::create_assignment(
            &conn,
            space.id.clone(),
            "Sheet 1".into(),
            course.id.clone(),
            None,
        )
        .unwrap();
        crate::db::assignments::update_assignment_status(
            &conn,
            &assignment.entity.id,
            "graded".into(),
            Some(1.0),
        )
        .unwrap();
        crate::db::exams::create_exam(
            &conn,
            space.id.clone(),
            "Elsewhere".into(),
            other.id,
            None,
            None,
        )
        .unwrap();

        let grades = get_course_grades(&conn, &course.id).unwrap();
        assert_eq!(grades.grade, Some(1.5));
        assert_eq!(grades.item_count, 2);
        assert_eq!(grades.graded_weight, 1.0);
    }
}
