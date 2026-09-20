use crate::db::relationships::{Cardinality, RelationshipTypeDef};
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use serde::Serialize;

inventory::submit! {
    RelationshipTypeDef { name: "sub-task-of", inverse_label: "has sub-task", cardinality: Cardinality::OneToPerFrom }
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
}

fn task_row_to_task(
    entity: crate::db::entities::Entity,
    row: &rusqlite::Row,
) -> rusqlite::Result<Task> {
    Ok(Task {
        entity,
        status_id: row.get("status_id")?,
        start_date: row.get("start_date")?,
        due_date: row.get("due_date")?,
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
    })
}

pub fn list_subtasks(conn: &Connection, parent_entity_id: &str) -> AppResult<Vec<Task>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, t.status_id, t.start_date, t.due_date
         FROM relationships r
         JOIN entities e ON e.id = r.from_entity_id
         JOIN tasks t ON t.entity_id = e.id
         WHERE r.to_entity_id = ?1 AND r.relationship_type = 'sub-task-of'
         ORDER BY e.created_at ASC",
    )?;
    let rows = stmt.query_map(params![parent_entity_id], row_to_task_joined)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Average doneness % across sub-tasks, for progress rollup on the parent Task (§3.3).
pub fn subtask_progress(conn: &Connection, parent_entity_id: &str) -> AppResult<Option<f64>> {
    let subtasks = list_subtasks(conn, parent_entity_id)?;
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

pub fn list_tasks(conn: &Connection, space_id: &str) -> AppResult<Vec<Task>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, t.status_id, t.start_date, t.due_date
         FROM entities e JOIN tasks t ON t.entity_id = e.id
         WHERE e.space_id = ?1 AND e.type = 'task' AND e.deleted_at IS NULL
         ORDER BY e.created_at ASC",
    )?;
    let rows = stmt.query_map(params![space_id], row_to_task_joined)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn update_task_status(conn: &Connection, entity_id: &str, status_id: &str) -> AppResult<()> {
    let affected = conn.execute(
        "UPDATE tasks SET status_id = ?1 WHERE entity_id = ?2",
        params![status_id, entity_id],
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

pub fn update_task_dates(
    conn: &Connection,
    entity_id: &str,
    start_date: Option<String>,
    due_date: Option<String>,
) -> AppResult<()> {
    conn.execute(
        "UPDATE tasks SET start_date = ?1, due_date = ?2 WHERE entity_id = ?3",
        params![start_date, due_date, entity_id],
    )?;
    Ok(())
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
}
