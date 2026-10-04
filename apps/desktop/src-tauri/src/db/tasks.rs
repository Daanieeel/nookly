use crate::db::relationships::{Cardinality, MovesWith, RelationshipTypeDef};
use crate::db::schema::{CreateInput, EntitySchemaDef, FieldDef, FieldKind, JsonMap};
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use serde::Serialize;

inventory::submit! {
    RelationshipTypeDef { name: "sub-task-of", label: "Sub-task of", description: "Makes this task a sub-task of another task.", from_type: Some("sub_task"), to_type: Some("task"), inverse_label: "has sub-task", cardinality: Cardinality::OneToPerFrom, moves_with: MovesWith::FromFollowsTo }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskStatus {
    pub id: String,
    pub name: String,
    pub color: String,
    pub doneness: i64,
    pub position: i64,
}

fn row_to_status(row: &rusqlite::Row) -> rusqlite::Result<TaskStatus> {
    Ok(TaskStatus {
        id: row.get("id")?,
        name: row.get("name")?,
        color: row.get("color")?,
        doneness: row.get("doneness")?,
        position: row.get("position")?,
    })
}

pub fn list_task_statuses(conn: &Connection) -> AppResult<Vec<TaskStatus>> {
    let mut stmt = conn.prepare("SELECT * FROM task_statuses ORDER BY position ASC")?;
    let rows = stmt.query_map([], row_to_status)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub entity: crate::db::entities::Entity,
    pub status_id: String,
    pub start_date: Option<String>,
    pub due_date: Option<String>,
    /// When the status last moved into a finished one (done or cancelled). Cleared
    /// when the task is reopened; unrelated to any other edit.
    pub completed_at: Option<String>,
    /// The effort estimate as a step of the shared scale (see `EFFORT_STEPS`). T-shirt
    /// sizes and points are only two names for these same values.
    pub effort: Option<i64>,
    /// Ids of this Task's Labels, ordered by label name. Only `list_tasks` fills it;
    /// everywhere else it stays empty.
    pub label_ids: Vec<String>,
    /// Ids of the Courses this Task is linked to through `relates-to`, in either
    /// direction. Only `list_tasks` fills it.
    pub course_ids: Vec<String>,
    /// Ids of the Semesters of those Courses, plus any Semester the Task relates to
    /// directly. Only `list_tasks` fills it.
    pub semester_ids: Vec<String>,
}

/// The stored effort values: Fibonacci points. T-shirt sizes (XS to XXL) map onto
/// the same six steps, so switching the scale never changes the data.
pub const EFFORT_STEPS: [i64; 6] = [1, 2, 3, 5, 8, 13];

fn task_row_to_task(
    entity: crate::db::entities::Entity,
    row: &rusqlite::Row,
) -> rusqlite::Result<Task> {
    Ok(Task {
        entity,
        status_id: row.get("status_id")?,
        start_date: row.get("start_date")?,
        due_date: row.get("due_date")?,
        completed_at: row.get("completed_at")?,
        effort: row.get("effort")?,
        label_ids: Vec::new(),
        course_ids: Vec::new(),
        semester_ids: Vec::new(),
    })
}

pub fn create_task(
    conn: &Connection,
    space_id: String,
    title: String,
    start_date: Option<String>,
    due_date: Option<String>,
) -> AppResult<Task> {
    let entity = crate::db::entities::create_entity(conn, space_id, "task".into(), title, None)?;
    conn.execute(
        "INSERT INTO tasks (entity_id, status_id, start_date, due_date) VALUES (?1, 'backlog', ?2, ?3)",
        params![entity.id, start_date, due_date],
    )?;
    Ok(Task {
        entity,
        status_id: "backlog".into(),
        start_date,
        due_date,
        completed_at: None,
        effort: None,
        label_ids: Vec::new(),
        course_ids: Vec::new(),
        semester_ids: Vec::new(),
    })
}

/// Sub-tasks are capped at one level of nesting (§3.3) — a sub-task cannot itself be a parent.
pub fn create_subtask(
    conn: &Connection,
    parent_entity_id: String,
    title: String,
) -> AppResult<Task> {
    let parent = crate::db::entities::get_entity(conn, &parent_entity_id)?;
    if parent.entity_type != "task" {
        return Err(AppError::CardinalityViolation(
            "sub-tasks cannot have their own sub-tasks".into(),
        ));
    }
    let entity =
        crate::db::entities::create_entity(conn, parent.space_id, "sub_task".into(), title, None)?;
    conn.execute(
        "INSERT INTO tasks (entity_id, status_id, start_date, due_date) VALUES (?1, 'backlog', NULL, NULL)",
        params![entity.id],
    )?;
    crate::db::relationships::create_relationship(
        conn,
        entity.id.clone(),
        parent_entity_id,
        "sub-task-of".into(),
        None,
        None,
    )?;
    Ok(Task {
        entity,
        status_id: "backlog".into(),
        start_date: None,
        due_date: None,
        completed_at: None,
        effort: None,
        label_ids: Vec::new(),
        course_ids: Vec::new(),
        semester_ids: Vec::new(),
    })
}

/// Turns a top-level Task into a Sub-task of `parent_entity_id`, moving it into the
/// parent's Space first. Only a Task with no Sub-tasks of its own can become one,
/// keeping nesting at one level (§3.3).
pub fn convert_to_subtask(
    conn: &Connection,
    entity_id: &str,
    parent_entity_id: &str,
) -> AppResult<Task> {
    let entity = crate::db::entities::get_entity(conn, entity_id)?;
    let parent = crate::db::entities::get_entity(conn, parent_entity_id)?;
    if entity.entity_type != "task" {
        return Err(AppError::InvalidInput(format!(
            "{} is already a sub-task",
            entity.key
        )));
    }
    if parent.entity_type != "task" || parent.id == entity.id {
        return Err(AppError::CardinalityViolation(
            "a sub-task's parent must be another top-level task".into(),
        ));
    }
    if !list_subtasks(conn, entity_id)?.is_empty() {
        return Err(AppError::CardinalityViolation(format!(
            "{} has sub-tasks of its own, and sub-tasks can't have sub-tasks",
            entity.key
        )));
    }
    if parent.space_id != entity.space_id {
        crate::db::entities::update_entity(
            conn,
            entity_id,
            crate::db::entities::EntityPatch {
                space_id: Some(parent.space_id),
                ..Default::default()
            },
        )?;
    }
    conn.execute(
        "UPDATE entities SET type = 'sub_task', updated_at = ?1 WHERE id = ?2",
        params![crate::db::now(), entity_id],
    )?;
    crate::db::relationships::create_relationship(
        conn,
        entity_id.to_string(),
        parent_entity_id.to_string(),
        "sub-task-of".into(),
        None,
        None,
    )?;
    get_task(conn, entity_id)
}

pub fn list_subtasks(conn: &Connection, parent_entity_id: &str) -> AppResult<Vec<Task>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, t.status_id, t.start_date, t.due_date, t.completed_at, t.effort
         FROM relationships r
         JOIN entities e ON e.id = r.from_entity_id
         JOIN tasks t ON t.entity_id = e.id
         WHERE r.to_entity_id = ?1 AND r.relationship_type = 'sub-task-of'
         ORDER BY e.deleted_at IS NOT NULL, e.created_at ASC",
    )?;
    let rows = stmt.query_map(params![parent_entity_id], row_to_task_joined)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Average doneness % across sub-tasks, for progress rollup on the parent Task (§3.3).
/// Trashed sub-tasks still list under their parent but no longer count.
pub fn subtask_progress(conn: &Connection, parent_entity_id: &str) -> AppResult<Option<f64>> {
    let mut subtasks = list_subtasks(conn, parent_entity_id)?;
    subtasks.retain(|t| t.entity.deleted_at.is_none());
    if subtasks.is_empty() {
        return Ok(None);
    }
    let statuses = list_task_statuses(conn)?;
    let total: f64 = subtasks
        .iter()
        .map(|t| {
            statuses
                .iter()
                .find(|s| s.id == t.status_id)
                .map(|s| s.doneness as f64)
                .unwrap_or(0.0)
        })
        .sum();
    Ok(Some(total / subtasks.len() as f64))
}

fn row_to_task_joined(row: &rusqlite::Row) -> rusqlite::Result<Task> {
    let entity = crate::db::entities::row_to_entity(row)?;
    task_row_to_task(entity, row)
}

pub fn get_task(conn: &Connection, entity_id: &str) -> AppResult<Task> {
    let mut stmt = conn.prepare(
        "SELECT e.*, t.status_id, t.start_date, t.due_date, t.completed_at, t.effort
         FROM entities e JOIN tasks t ON t.entity_id = e.id
         WHERE e.id = ?1",
    )?;
    stmt.query_row(params![entity_id], row_to_task_joined)
        .map_err(|_| AppError::NotFound(format!("task {entity_id}")))
}

/// One Task for its detail page, with its label ids filled in (ordered by name).
pub fn get_task_with_labels(conn: &Connection, entity_id: &str) -> AppResult<Task> {
    let mut task = get_task(conn, entity_id)?;
    let mut stmt = conn.prepare(
        "SELECT el.label_id FROM entity_labels el
         JOIN labels l ON l.id = el.label_id
         WHERE el.entity_id = ?1
         ORDER BY l.name ASC",
    )?;
    let rows = stmt.query_map(params![entity_id], |row| row.get(0))?;
    task.label_ids = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(task)
}

pub fn list_tasks(conn: &Connection, space_id: &str) -> AppResult<Vec<Task>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, t.status_id, t.start_date, t.due_date, t.completed_at, t.effort
         FROM entities e JOIN tasks t ON t.entity_id = e.id
         WHERE e.space_id = ?1 AND e.type = 'task' AND e.deleted_at IS NULL
         ORDER BY e.created_at ASC",
    )?;
    let rows = stmt.query_map(params![space_id], row_to_task_joined)?;
    let mut tasks = rows.collect::<Result<Vec<_>, _>>()?;

    let index: std::collections::HashMap<String, usize> = tasks
        .iter()
        .enumerate()
        .map(|(i, t)| (t.entity.id.clone(), i))
        .collect();
    let mut stmt = conn.prepare(
        "SELECT el.entity_id, el.label_id FROM entity_labels el
         JOIN entities e ON e.id = el.entity_id
         JOIN labels l ON l.id = el.label_id
         WHERE e.space_id = ?1 AND e.type = 'task' AND e.deleted_at IS NULL
         ORDER BY l.name ASC",
    )?;
    let mut rows = stmt.query(params![space_id])?;
    while let Some(row) = rows.next()? {
        let entity_id: String = row.get(0)?;
        if let Some(&i) = index.get(&entity_id) {
            tasks[i].label_ids.push(row.get(1)?);
        }
    }
    fill_courses_and_semesters(conn, space_id, &mut tasks, &index)?;
    Ok(tasks)
}

/// Every Space's Tasks, for the cross-Space Tasks overview: each Space's own
/// `list_tasks`, one after the other in Space order.
pub fn list_tasks_all(conn: &Connection) -> AppResult<Vec<Task>> {
    let mut tasks = Vec::new();
    for space in crate::db::spaces::list_spaces(conn)? {
        tasks.extend(list_tasks(conn, &space.id)?);
    }
    Ok(tasks)
}

/// Links a Space's Tasks to the Courses and Semesters they relate to. A Task counts
/// as part of a Course through a `relates-to` link in either direction, and as part
/// of that Course's Semester too, so a finished Semester can be filtered out at once.
fn fill_courses_and_semesters(
    conn: &Connection,
    space_id: &str,
    tasks: &mut [Task],
    index: &std::collections::HashMap<String, usize>,
) -> AppResult<()> {
    let mut stmt = conn.prepare(
        "SELECT t.entity_id, o.id, o.type
         FROM tasks t
         JOIN entities te ON te.id = t.entity_id
         JOIN relationships r ON r.relationship_type = 'relates-to'
              AND (r.from_entity_id = t.entity_id OR r.to_entity_id = t.entity_id)
         JOIN entities o ON o.id = CASE WHEN r.from_entity_id = t.entity_id
                                        THEN r.to_entity_id ELSE r.from_entity_id END
         WHERE te.space_id = ?1 AND te.type = 'task' AND te.deleted_at IS NULL
           AND o.deleted_at IS NULL AND o.type IN ('course', 'semester')
         ORDER BY o.id ASC",
    )?;
    let mut rows = stmt.query(params![space_id])?;
    while let Some(row) = rows.next()? {
        let entity_id: String = row.get(0)?;
        let other_id: String = row.get(1)?;
        let other_type: String = row.get(2)?;
        let Some(&i) = index.get(&entity_id) else {
            continue;
        };
        let (list, other_id) = if other_type == "course" {
            (&mut tasks[i].course_ids, other_id)
        } else {
            (&mut tasks[i].semester_ids, other_id)
        };
        if !list.contains(&other_id) {
            list.push(other_id);
        }
    }

    let mut stmt = conn.prepare(
        "SELECT r.from_entity_id, r.to_entity_id FROM relationships r
         JOIN entities s ON s.id = r.to_entity_id
         WHERE r.relationship_type = 'course-semester' AND s.deleted_at IS NULL",
    )?;
    let semester_of: std::collections::HashMap<String, String> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;
    for task in tasks.iter_mut() {
        for course_id in task.course_ids.clone() {
            if let Some(semester_id) = semester_of.get(&course_id) {
                if !task.semester_ids.contains(semester_id) {
                    task.semester_ids.push(semester_id.clone());
                }
            }
        }
    }
    Ok(())
}

/// Moves a Task to a status. `completed_at` is stamped when the status changes into a
/// finished one (doneness 100, so Done or Cancelled), kept while it stays in the same
/// one, and cleared when the task is reopened. No other edit touches it.
pub fn update_task_status(conn: &Connection, entity_id: &str, status_id: &str) -> AppResult<()> {
    let doneness: i64 = conn
        .query_row(
            "SELECT doneness FROM task_statuses WHERE id = ?1",
            params![status_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound(format!("task status {status_id}")))?;
    let affected = if doneness >= 100 {
        conn.execute(
            "UPDATE tasks SET
                completed_at = CASE
                    WHEN status_id = ?1 AND completed_at IS NOT NULL THEN completed_at
                    ELSE ?3 END,
                status_id = ?1
             WHERE entity_id = ?2",
            params![status_id, entity_id, crate::db::now()],
        )?
    } else {
        conn.execute(
            "UPDATE tasks SET status_id = ?1, completed_at = NULL WHERE entity_id = ?2",
            params![status_id, entity_id],
        )?
    };
    if affected == 0 {
        return Err(AppError::NotFound(format!("task {entity_id}")));
    }
    Ok(())
}

/// Sets or clears the effort estimate. Only the six steps of `EFFORT_STEPS` are valid.
pub fn update_task_effort(
    conn: &Connection,
    entity_id: &str,
    effort: Option<i64>,
) -> AppResult<()> {
    if let Some(value) = effort {
        if !EFFORT_STEPS.contains(&value) {
            return Err(AppError::InvalidInput(format!(
                "effort must be one of 1, 2, 3, 5, 8 or 13, got {value}"
            )));
        }
    }
    let affected = conn.execute(
        "UPDATE tasks SET effort = ?1 WHERE entity_id = ?2",
        params![effort, entity_id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("task {entity_id}")));
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDueTodaySummary {
    pub done: i64,
    pub total: i64,
}

/// Cross-Space daily completion glance for the sidebar footer mascot — the only
/// aggregate in this file that isn't scoped to a single Space.
pub fn count_tasks_due_today(conn: &Connection) -> AppResult<TaskDueTodaySummary> {
    let (done, total) = conn.query_row(
        "SELECT
            COUNT(*) FILTER (WHERE s.doneness >= 100) AS done,
            COUNT(*) AS total
         FROM tasks t
         JOIN entities e ON e.id = t.entity_id
         JOIN task_statuses s ON s.id = t.status_id
         WHERE e.deleted_at IS NULL AND t.due_date IS NOT NULL AND date(t.due_date) = date('now')",
        [],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
    )?;
    Ok(TaskDueTodaySummary { done, total })
}

/// Cross-Space count of open (not-done) Tasks due today or earlier — the Dashboard
/// briefing's Tasks clause. Unlike `count_tasks_due_today`, this includes overdue
/// tasks and doesn't need a done/total split (an "open" count is already filtered
/// to not-done).
pub fn count_open_tasks_due_or_overdue(conn: &Connection) -> AppResult<i64> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM tasks t
         JOIN entities e ON e.id = t.entity_id
         JOIN task_statuses s ON s.id = t.status_id
         WHERE e.deleted_at IS NULL AND t.due_date IS NOT NULL
           AND date(t.due_date) <= date('now') AND s.doneness < 100",
        [],
        |row| row.get(0),
    )?;
    Ok(count)
}

/// The Tasks behind `count_open_tasks_due_or_overdue`, earliest due date first, for
/// the Dashboard's briefing sentence and its Today widget.
pub fn list_open_tasks_due_or_overdue(conn: &Connection) -> AppResult<Vec<Task>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, t.status_id, t.start_date, t.due_date, t.completed_at, t.effort
         FROM entities e JOIN tasks t ON t.entity_id = e.id
         JOIN task_statuses s ON s.id = t.status_id
         WHERE e.deleted_at IS NULL AND t.due_date IS NOT NULL
           AND date(t.due_date) <= date('now') AND s.doneness < 100
         ORDER BY t.due_date ASC, e.created_at ASC",
    )?;
    let rows = stmt.query_map([], row_to_task_joined)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn update_task_dates(
    conn: &Connection,
    entity_id: &str,
    start_date: Option<String>,
    due_date: Option<String>,
) -> AppResult<()> {
    let affected = conn.execute(
        "UPDATE tasks SET start_date = ?1, due_date = ?2 WHERE entity_id = ?3",
        params![start_date, due_date, entity_id],
    )?;
    crate::db::require_row(affected, "task", entity_id)?;
    Ok(())
}

// --- CLI schema registration (PLAN.md §1/§3) -------------------------------
//
// `task` and `sub_task` share the same subtype fields; a sub-task additionally
// requires `parentId` at creation, which is how the CLI expresses the
// structural sub-task-of relationship instead of a separate `relate` call —
// matching how `create_subtask` already atomically creates that relationship.

const FIELD_STATUS_ID: FieldDef = FieldDef {
    name: "statusId",
    kind: FieldKind::Text,
    required_on_create: false,
    writable_on_update: true,
    description: "Task status id — see `task_statuses` (default: backlog, todo, in_progress, done, cancelled)",
};

const FIELD_START_DATE: FieldDef = FieldDef {
    name: "startDate",
    kind: FieldKind::Date,
    required_on_create: false,
    writable_on_update: true,
    description: "ISO date",
};

const FIELD_DUE_DATE: FieldDef = FieldDef {
    name: "dueDate",
    kind: FieldKind::Date,
    required_on_create: false,
    writable_on_update: true,
    description: "ISO date",
};

const FIELD_EFFORT: FieldDef = FieldDef {
    name: "effort",
    kind: FieldKind::Integer,
    required_on_create: false,
    writable_on_update: true,
    description: "Effort estimate as Fibonacci points: 1, 2, 3, 5, 8 or 13 (the app shows them as XS, S, M, L, XL, XXL when set to T-shirt sizes)",
};

const FIELD_COMPLETED_AT: FieldDef = FieldDef {
    name: "completedAt",
    kind: FieldKind::DateTime,
    required_on_create: false,
    writable_on_update: false,
    description: "Read only. When the status last changed to a finished one (done or cancelled); empty while the task is open",
};

const TASK_UPDATE_FIELDS: &[FieldDef] = &[
    FieldDef {
        name: "parentId",
        kind: FieldKind::EntityRef("task"),
        required_on_create: false,
        writable_on_update: true,
        description: "Setting it turns this task into a sub-task of that task. Only a task without sub-tasks of its own can be converted, and it can't be undone through this field.",
    },
    FIELD_STATUS_ID,
    FIELD_START_DATE,
    FIELD_DUE_DATE,
    FIELD_EFFORT,
    FIELD_COMPLETED_AT,
];

const SUB_TASK_FIELDS: &[FieldDef] = &[
    FieldDef {
        name: "parentId",
        kind: FieldKind::EntityRef("task"),
        required_on_create: true,
        writable_on_update: false,
        description: "Parent task id. Sub-tasks cannot themselves have sub-tasks (one level max).",
    },
    FIELD_STATUS_ID,
    FIELD_START_DATE,
    FIELD_DUE_DATE,
    FIELD_EFFORT,
    FIELD_COMPLETED_AT,
];

fn apply_task_fields(conn: &Connection, entity_id: &str, fields: &JsonMap) -> AppResult<()> {
    let is_task = crate::db::entities::get_entity(conn, entity_id)?.entity_type == "task";
    if let Some(parent_id) = crate::db::schema::field_str(fields, "parentId").filter(|_| is_task) {
        convert_to_subtask(conn, entity_id, &parent_id)?;
    }
    if let Some(status_id) = crate::db::schema::field_str(fields, "statusId") {
        update_task_status(conn, entity_id, &status_id)?;
    }
    if fields.contains_key("effort") {
        let effort = crate::db::schema::field_i64(fields, "effort");
        update_task_effort(conn, entity_id, effort)?;
    }
    if fields.contains_key("startDate") || fields.contains_key("dueDate") {
        let current = get_task(conn, entity_id)?;
        let start_date = crate::db::schema::field_str(fields, "startDate").or(current.start_date);
        let due_date = crate::db::schema::field_str(fields, "dueDate").or(current.due_date);
        update_task_dates(conn, entity_id, start_date, due_date)?;
    }
    Ok(())
}

fn cli_create_task(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    let start_date = crate::db::schema::field_str(&input.fields, "startDate");
    let due_date = crate::db::schema::field_str(&input.fields, "dueDate");
    let task = create_task(conn, input.space_id, input.title, start_date, due_date)?;
    apply_task_fields(conn, &task.entity.id, &input.fields)?;
    cli_get_task(conn, &task.entity.id)
}

fn cli_update_task(conn: &Connection, id: &str, fields: &JsonMap) -> AppResult<serde_json::Value> {
    apply_task_fields(conn, id, fields)?;
    cli_get_task(conn, id)
}

fn cli_get_task(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    Ok(serde_json::to_value(get_task(conn, id)?).expect("Task always serializes"))
}

fn cli_list_tasks(
    conn: &Connection,
    space_id: Option<&str>,
    include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let _ = include_deleted; // list_tasks is already soft-delete-filtered; see note on `entity` list for Trash browsing.
    let space_id = space_id
        .ok_or_else(|| AppError::InvalidInput("task list requires --space <space-id>".into()))?;
    Ok(list_tasks(conn, space_id)?
        .into_iter()
        .map(|t| serde_json::to_value(t).expect("Task always serializes"))
        .collect())
}

fn cli_create_sub_task(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    let parent_id = crate::db::schema::require_str(&input.fields, "parentId")?;
    let task = create_subtask(conn, parent_id, input.title)?;
    apply_task_fields(conn, &task.entity.id, &input.fields)?;
    cli_get_task(conn, &task.entity.id)
}

fn cli_list_sub_tasks(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id.ok_or_else(|| {
        AppError::InvalidInput("sub_task list requires --space <space-id>".into())
    })?;
    let mut stmt = conn.prepare(
        "SELECT id FROM entities WHERE type = 'sub_task' AND space_id = ?1 AND deleted_at IS NULL
         ORDER BY created_at ASC",
    )?;
    let ids = stmt
        .query_map(params![space_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    ids.iter().map(|id| cli_get_task(conn, id)).collect()
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "task",
        supports_blocks: true,
        description: "A to-do item. Progress rolls up from sub-tasks when any exist.",
        fields: TASK_UPDATE_FIELDS,
        relationship_types: &["sub-task-of", "relates-to", "blocks"],
        create: cli_create_task,
        update: cli_update_task,
        get: cli_get_task,
        list: cli_list_tasks,
    }
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "sub_task",
        supports_blocks: true,
        description: "A one-level-deep child of a Task. Cannot itself have sub-tasks.",
        fields: SUB_TASK_FIELDS,
        relationship_types: &["sub-task-of", "relates-to", "blocks"],
        create: cli_create_sub_task,
        update: cli_update_task,
        get: cli_get_task,
        list: cli_list_sub_tasks,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::spaces::create_space;

    fn setup() -> Connection {
        crate::db::test_conn()
    }

    #[test]
    fn list_tasks_all_spans_every_space() {
        let conn = setup();
        let work = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let home = create_space(&conn, "Home".into(), None, "#111".into()).unwrap();
        create_task(&conn, work.id.clone(), "Report".into(), None, None).unwrap();
        create_task(&conn, home.id.clone(), "Laundry".into(), None, None).unwrap();

        let all = list_tasks_all(&conn).unwrap();
        let mut spaces: Vec<&str> = all.iter().map(|t| t.entity.space_id.as_str()).collect();
        spaces.sort();
        let mut expected = vec![work.id.as_str(), home.id.as_str()];
        expected.sort();
        assert_eq!(spaces, expected);
    }

    #[test]
    fn subtask_nesting_capped_at_one_level() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let task = create_task(&conn, space.id.clone(), "Parent".into(), None, None).unwrap();
        let subtask = create_subtask(&conn, task.entity.id.clone(), "Child".into()).unwrap();

        let result = create_subtask(&conn, subtask.entity.id.clone(), "Grandchild".into());
        assert!(result.is_err());

        let listed = list_subtasks(&conn, &task.entity.id).unwrap();
        assert_eq!(listed.len(), 1);
    }

    #[test]
    fn subtask_progress_rolls_up_from_statuses() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let task = create_task(&conn, space.id.clone(), "Parent".into(), None, None).unwrap();
        let sub1 = create_subtask(&conn, task.entity.id.clone(), "A".into()).unwrap();
        let sub2 = create_subtask(&conn, task.entity.id.clone(), "B".into()).unwrap();

        update_task_status(&conn, &sub1.entity.id, "done").unwrap();
        update_task_status(&conn, &sub2.entity.id, "backlog").unwrap();

        let progress = subtask_progress(&conn, &task.entity.id).unwrap().unwrap();
        assert_eq!(progress, 50.0);
    }

    #[test]
    fn list_tasks_carries_label_ids_sorted_by_name() {
        let conn = setup();
        let space = create_space(&conn, "Home".into(), None, "#000".into()).unwrap();
        let task = create_task(&conn, space.id.clone(), "Laundry".into(), None, None).unwrap();
        let bare = create_task(&conn, space.id.clone(), "Dishes".into(), None, None).unwrap();
        let zeta =
            crate::db::labels::create_label(&conn, space.id.clone(), "Zeta".into(), "#f00".into())
                .unwrap();
        let alpha =
            crate::db::labels::create_label(&conn, space.id.clone(), "Alpha".into(), "#0f0".into())
                .unwrap();
        crate::db::labels::attach_label(&conn, &task.entity.id, &zeta.id).unwrap();
        crate::db::labels::attach_label(&conn, &task.entity.id, &alpha.id).unwrap();

        let tasks = list_tasks(&conn, &space.id).unwrap();
        let labeled = tasks
            .iter()
            .find(|t| t.entity.id == task.entity.id)
            .unwrap();
        assert_eq!(labeled.label_ids, vec![alpha.id, zeta.id]);
        let unlabeled = tasks
            .iter()
            .find(|t| t.entity.id == bare.entity.id)
            .unwrap();
        assert!(unlabeled.label_ids.is_empty());
    }

    #[test]
    fn trashed_subtasks_list_last_and_leave_progress() {
        let conn = setup();
        let space = create_space(&conn, "Home".into(), None, "#000".into()).unwrap();
        let task = create_task(&conn, space.id.clone(), "Parent".into(), None, None).unwrap();
        let trashed = create_subtask(&conn, task.entity.id.clone(), "Old".into()).unwrap();
        let live = create_subtask(&conn, task.entity.id.clone(), "New".into()).unwrap();
        update_task_status(&conn, &trashed.entity.id, "done").unwrap();
        crate::db::entities::soft_delete_entity(&conn, &trashed.entity.id).unwrap();

        let subtasks = list_subtasks(&conn, &task.entity.id).unwrap();
        let ids: Vec<_> = subtasks.iter().map(|t| t.entity.id.as_str()).collect();
        assert_eq!(
            ids,
            vec![live.entity.id.as_str(), trashed.entity.id.as_str()]
        );
        assert_eq!(subtask_progress(&conn, &task.entity.id).unwrap(), Some(0.0));
    }

    #[test]
    fn completed_at_follows_the_status_only() {
        let conn = setup();
        let space = create_space(&conn, "Home".into(), None, "#000".into()).unwrap();
        let task = create_task(&conn, space.id.clone(), "Taxes".into(), None, None).unwrap();
        let id = &task.entity.id;
        assert!(get_task(&conn, id).unwrap().completed_at.is_none());

        update_task_status(&conn, id, "done").unwrap();
        let first = get_task(&conn, id).unwrap().completed_at.unwrap();

        // Re-selecting the same status and unrelated edits keep the stamp.
        update_task_status(&conn, id, "done").unwrap();
        update_task_dates(&conn, id, None, Some("2030-01-01".into())).unwrap();
        update_task_effort(&conn, id, Some(3)).unwrap();
        assert_eq!(get_task(&conn, id).unwrap().completed_at.unwrap(), first);

        update_task_status(&conn, id, "in_progress").unwrap();
        assert!(get_task(&conn, id).unwrap().completed_at.is_none());
        update_task_status(&conn, id, "cancelled").unwrap();
        assert!(get_task(&conn, id).unwrap().completed_at.is_some());
    }

    #[test]
    fn effort_accepts_only_the_scale_steps() {
        let conn = setup();
        let space = create_space(&conn, "Home".into(), None, "#000".into()).unwrap();
        let task = create_task(&conn, space.id.clone(), "Taxes".into(), None, None).unwrap();
        let id = &task.entity.id;
        update_task_effort(&conn, id, Some(8)).unwrap();
        assert_eq!(get_task(&conn, id).unwrap().effort, Some(8));
        assert!(update_task_effort(&conn, id, Some(4)).is_err());
        update_task_effort(&conn, id, None).unwrap();
        assert_eq!(get_task(&conn, id).unwrap().effort, None);
    }

    #[test]
    fn list_tasks_carries_courses_and_their_semesters() {
        let conn = setup();
        let space = create_space(&conn, "Uni".into(), None, "#000".into()).unwrap();
        let make = |kind: &str, title: &str| {
            crate::db::entities::create_entity(
                &conn,
                space.id.clone(),
                kind.into(),
                title.into(),
                None,
            )
            .unwrap()
        };
        let course = make("course", "Maths");
        let semester = make("semester", "Fall");
        let task = create_task(&conn, space.id.clone(), "Read".into(), None, None).unwrap();
        let bare = create_task(&conn, space.id.clone(), "Other".into(), None, None).unwrap();
        for (from, to, kind) in [
            (&task.entity.id, &course.id, "relates-to"),
            (&course.id, &semester.id, "course-semester"),
        ] {
            crate::db::relationships::create_relationship(
                &conn,
                from.clone(),
                to.clone(),
                kind.into(),
                None,
                None,
            )
            .unwrap();
        }
        let tasks = list_tasks(&conn, &space.id).unwrap();
        let linked = tasks
            .iter()
            .find(|t| t.entity.id == task.entity.id)
            .unwrap();
        assert_eq!(linked.course_ids, vec![course.id]);
        assert_eq!(linked.semester_ids, vec![semester.id]);
        let other = tasks
            .iter()
            .find(|t| t.entity.id == bare.entity.id)
            .unwrap();
        assert!(other.course_ids.is_empty() && other.semester_ids.is_empty());
    }
}
