//! Export and import of one Task as a Nookly JSON file (`nookly-task`, version 1).
//!
//! The file holds the Task's title, status, dates, effort, repeat rule and description
//! blocks, and its Sub-tasks nested under it (one level, as in the app). What belongs to
//! one instance stays behind: ids, timestamps (including when it was completed), Labels,
//! `relates-to` links (so its Course) and the Space. The status travels as its name and
//! doneness, since the statuses are the user's own: an import picks the status with that
//! name, else the first with the same doneness, else the first one.
//!
//! Import creates a new Task and never changes an existing one, lands whole or not at all,
//! and never starts the next occurrence of a repeating Task that arrives finished.

use crate::db::entities::Entity;
use crate::db::page_json::{export_blocks, import_blocks, preview_blocks, BlockJson};
use crate::db::portable::{
    check_date, first_line, parse_document, Importer, PortableDef, PortablePreview, PreviewItem,
};
use crate::db::tasks::{self, RepeatRule, Task, EFFORT_STEPS};
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

pub const FORMAT: &str = "nookly-task";
pub const VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TaskFile {
    format: String,
    version: u32,
    /// Always `task`.
    kind: String,
    title: String,
    status: StatusFile,
    #[serde(default)]
    start_date: Option<String>,
    #[serde(default)]
    due_date: Option<String>,
    #[serde(default)]
    effort: Option<i64>,
    #[serde(default)]
    repeat: Option<RepeatRule>,
    #[serde(default)]
    blocks: Vec<BlockJson>,
    #[serde(default)]
    subtasks: Vec<SubtaskFile>,
}

/// A Sub-task: a Task without a rule to repeat or Sub-tasks of its own.
#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SubtaskFile {
    title: String,
    status: StatusFile,
    #[serde(default)]
    start_date: Option<String>,
    #[serde(default)]
    due_date: Option<String>,
    #[serde(default)]
    effort: Option<i64>,
    #[serde(default)]
    blocks: Vec<BlockJson>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct StatusFile {
    name: String,
    /// 0 to 100, how done the status is.
    doneness: i64,
}

fn status_file(conn: &Connection, status_id: &str) -> AppResult<StatusFile> {
    let status = tasks::list_task_statuses(conn)?
        .into_iter()
        .find(|s| s.id == status_id)
        .ok_or_else(|| AppError::NotFound(format!("task status {status_id}")))?;
    Ok(StatusFile {
        name: status.name,
        doneness: status.doneness,
    })
}

/// The id of the status a file's status lands on: the one with its name (ignoring case),
/// else the first with its doneness, else the first status there is.
fn resolve_status(conn: &Connection, status: &StatusFile) -> AppResult<(String, i64)> {
    let statuses = tasks::list_task_statuses(conn)?;
    let wanted = status.name.trim().to_lowercase();
    let found = statuses
        .iter()
        .find(|s| s.name.trim().to_lowercase() == wanted)
        .or_else(|| statuses.iter().find(|s| s.doneness == status.doneness))
        .or_else(|| statuses.first())
        .ok_or_else(|| {
            AppError::InvalidInput("there are no task statuses to import into".into())
        })?;
    Ok((found.id.clone(), found.doneness))
}

fn export_subtask(conn: &Connection, task: &Task) -> AppResult<SubtaskFile> {
    Ok(SubtaskFile {
        title: task.entity.title.clone(),
        status: status_file(conn, &task.status_id)?,
        start_date: task.start_date.clone(),
        due_date: task.due_date.clone(),
        effort: task.effort,
        blocks: export_blocks(conn, &task.entity.id)?,
    })
}

/// The Task as a `nookly-task` JSON document.
pub fn export_task_json(conn: &Connection, entity_id: &str) -> AppResult<String> {
    let entity = crate::db::entities::get_entity(conn, entity_id)?;
    if entity.entity_type == "sub_task" {
        return Err(AppError::InvalidInput(
            "a sub-task is exported with its task: export the task".into(),
        ));
    }
    if entity.entity_type != "task" {
        return Err(AppError::InvalidInput(format!(
            "only a task can be exported this way, not a {}",
            entity.entity_type
        )));
    }
    let task = tasks::get_task(conn, entity_id)?;
    let mut subtasks = Vec::new();
    for sub in tasks::list_subtasks(conn, entity_id)? {
        if sub.entity.deleted_at.is_none() {
            subtasks.push(export_subtask(conn, &sub)?);
        }
    }
    let file = TaskFile {
        format: FORMAT.into(),
        version: VERSION,
        kind: "task".into(),
        title: task.entity.title.clone(),
        status: status_file(conn, &task.status_id)?,
        start_date: task.start_date,
        due_date: task.due_date,
        effort: task.effort,
        repeat: task.repeat,
        blocks: export_blocks(conn, entity_id)?,
        subtasks,
    };
    serde_json::to_string_pretty(&file).map_err(|e| AppError::Io(e.to_string()))
}

fn check_fields(
    what: &str,
    status: &StatusFile,
    start: &Option<String>,
    due: &Option<String>,
    effort: Option<i64>,
) -> AppResult<()> {
    if !(0..=100).contains(&status.doneness) {
        return Err(AppError::InvalidInput(format!(
            "{what}: status doneness must be 0 to 100, got {}",
            status.doneness
        )));
    }
    if let Some(day) = start {
        check_date(&format!("{what}: startDate"), day)?;
    }
    if let Some(day) = due {
        check_date(&format!("{what}: dueDate"), day)?;
    }
    if let Some(value) = effort {
        if !EFFORT_STEPS.contains(&value) {
            return Err(AppError::InvalidInput(format!(
                "{what}: effort must be one of 1, 2, 3, 5, 8 or 13, got {value}"
            )));
        }
    }
    Ok(())
}

/// Reads and checks a document without touching the database.
fn parse(text: &str) -> AppResult<TaskFile> {
    let file: TaskFile = parse_document(text, FORMAT, VERSION, "task")?;
    if file.kind != "task" {
        return Err(AppError::InvalidInput(format!(
            "this task file holds a \"{}\", not a task",
            file.kind
        )));
    }
    check_fields(
        "the task",
        &file.status,
        &file.start_date,
        &file.due_date,
        file.effort,
    )?;
    if let Some(rule) = &file.repeat {
        rule.validate()?;
    }
    for (index, sub) in file.subtasks.iter().enumerate() {
        let what = format!("sub-task {}", index + 1);
        check_fields(
            &what,
            &sub.status,
            &sub.start_date,
            &sub.due_date,
            sub.effort,
        )?;
    }
    Ok(file)
}

/// Sets what a fresh Task or Sub-task is missing: its status (written directly, so a
/// finished one never starts a next occurrence), dates, effort and description.
fn fill(
    conn: &Connection,
    entity_id: &str,
    status: &StatusFile,
    start: &Option<String>,
    due: &Option<String>,
    effort: Option<i64>,
    blocks: &[BlockJson],
) -> AppResult<()> {
    let (status_id, doneness) = resolve_status(conn, status)?;
    // Finished on arrival: the day it arrived, which is all that is known.
    let completed_at = (doneness >= 100).then(crate::db::now);
    conn.execute(
        "UPDATE tasks SET status_id = ?1, completed_at = ?2 WHERE entity_id = ?3",
        params![status_id, completed_at, entity_id],
    )?;
    tasks::update_task_dates(conn, entity_id, start.clone(), due.clone())?;
    tasks::update_task_effort(conn, entity_id, effort)?;
    import_blocks(conn, entity_id, blocks)
}

/// Creates a new Task, with its Sub-tasks, in `space_id` from a `nookly-task` document.
pub fn import_task_json(conn: &Connection, space_id: &str, text: &str) -> AppResult<Entity> {
    let file = parse(text)?;
    crate::db::atomically(conn, || {
        let task = tasks::create_task(conn, space_id.to_string(), file.title.clone(), None, None)?;
        let id = &task.entity.id;
        fill(
            conn,
            id,
            &file.status,
            &file.start_date,
            &file.due_date,
            file.effort,
            &file.blocks,
        )?;
        tasks::set_task_repeat(conn, id, file.repeat)?;
        for sub in &file.subtasks {
            let made = tasks::create_subtask(conn, id.clone(), sub.title.clone())?;
            fill(
                conn,
                &made.entity.id,
                &sub.status,
                &sub.start_date,
                &sub.due_date,
                sub.effort,
                &sub.blocks,
            )?;
        }
        crate::db::entities::get_entity(conn, id)
    })
}

fn repeat_words(rule: &RepeatRule) -> String {
    let unit = serde_json::to_value(rule.unit)
        .ok()
        .and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_default();
    format!(
        "Repeats every {} {unit}{}",
        rule.every,
        if rule.every == 1 { "" } else { "s" }
    )
}

fn preview(text: &str) -> AppResult<PortablePreview> {
    let file = parse(text)?;
    let mut facts = vec![format!("Status: {}", file.status.name)];
    if let Some(day) = &file.due_date {
        facts.push(format!("Due {day}"));
    }
    if let Some(day) = &file.start_date {
        facts.push(format!("Starts {day}"));
    }
    if let Some(effort) = file.effort {
        facts.push(format!("Effort {effort}"));
    }
    if let Some(rule) = &file.repeat {
        facts.push(repeat_words(rule));
    }
    let (blocks, converted) = preview_blocks(&file.blocks);
    if !blocks.is_empty() {
        facts.push(format!(
            "{} description block{}",
            blocks.len(),
            if blocks.len() == 1 { "" } else { "s" }
        ));
    }
    let items: Vec<PreviewItem> = file
        .subtasks
        .iter()
        .map(|s| PreviewItem {
            label: s.status.name.clone(),
            text: first_line(&s.title),
            converted: false,
        })
        .collect();
    Ok(PortablePreview {
        format: FORMAT.into(),
        kind: "task".into(),
        title: file.title,
        facts,
        count: items.len(),
        count_label: "subtask".into(),
        items,
        converted,
        parent_type: None,
    })
}

inventory::submit! {
    PortableDef { entity_type: "task", format: FORMAT, version: VERSION, parent_type: None, noun: "task", export: export_task_json, preview, import: Importer::Plain(import_task_json) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::notes::list_blocks;
    use crate::db::tasks::RepeatUnit;

    struct Fixture {
        conn: Connection,
        space: String,
        other_space: String,
    }

    fn fixture() -> Fixture {
        let conn = crate::db::test_conn();
        let space =
            crate::db::spaces::create_space(&conn, "A".into(), None, "#000".into()).unwrap();
        let other =
            crate::db::spaces::create_space(&conn, "B".into(), None, "#111".into()).unwrap();
        Fixture {
            conn,
            space: space.id,
            other_space: other.id,
        }
    }

    fn entity_count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM entities", [], |r| r.get(0))
            .unwrap()
    }

    /// A Task with everything a file can carry, and what must stay behind.
    fn full_task(fx: &Fixture) -> Entity {
        let task = tasks::create_task(
            &fx.conn,
            fx.space.clone(),
            "Write the report".into(),
            Some("2026-03-01".into()),
            Some("2026-03-10".into()),
        )
        .unwrap();
        let id = &task.entity.id;
        tasks::update_task_status(&fx.conn, id, "in_progress").unwrap();
        tasks::update_task_effort(&fx.conn, id, Some(5)).unwrap();
        tasks::set_task_repeat(
            &fx.conn,
            id,
            Some(RepeatRule {
                every: 2,
                unit: RepeatUnit::Week,
            }),
        )
        .unwrap();
        crate::db::notes::create_block(
            &fx.conn,
            id,
            "paragraph".into(),
            "Cover **three** topics.".into(),
            None,
            None,
            None,
        )
        .unwrap();
        let sub = tasks::create_subtask(&fx.conn, id.clone(), "Outline".into()).unwrap();
        tasks::update_task_status(&fx.conn, &sub.entity.id, "done").unwrap();
        tasks::update_task_dates(&fx.conn, &sub.entity.id, None, Some("2026-03-05".into()))
            .unwrap();
        tasks::create_subtask(&fx.conn, id.clone(), "Draft".into()).unwrap();
        let label = crate::db::labels::create_label(
            &fx.conn,
            fx.space.clone(),
            "urgent".into(),
            "#f00".into(),
        )
        .unwrap();
        crate::db::labels::attach_label(&fx.conn, id, &label.id).unwrap();
        task.entity
    }

    #[test]
    fn a_task_round_trips_with_its_subtasks_into_another_space() {
        let fx = fixture();
        let task = full_task(&fx);
        let json = export_task_json(&fx.conn, &task.id).unwrap();
        // Nothing that belongs to this instance travels.
        for private in [
            task.id.as_str(),
            fx.space.as_str(),
            "urgent",
            "createdAt",
            "completedAt",
            "labels",
        ] {
            assert!(!json.contains(private), "{private} leaked into {json}");
        }

        let imported = import_task_json(&fx.conn, &fx.other_space, &json).unwrap();
        assert_ne!(imported.id, task.id);
        assert_eq!(imported.entity_type, "task");
        assert_eq!(imported.title, "Write the report");
        assert_eq!(imported.space_id, fx.other_space);

        let got = tasks::get_task(&fx.conn, &imported.id).unwrap();
        assert_eq!(got.status_id, "in_progress");
        assert_eq!(got.start_date.as_deref(), Some("2026-03-01"));
        assert_eq!(got.due_date.as_deref(), Some("2026-03-10"));
        assert_eq!(got.effort, Some(5));
        assert_eq!(
            got.repeat,
            Some(RepeatRule {
                every: 2,
                unit: RepeatUnit::Week
            })
        );
        assert!(got.label_ids.is_empty());
        let blocks = list_blocks(&fx.conn, &imported.id).unwrap();
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].content, "Cover **three** topics.");

        let subs = tasks::list_subtasks(&fx.conn, &imported.id).unwrap();
        let shape: Vec<(String, String, Option<String>)> = subs
            .iter()
            .map(|s| {
                (
                    s.entity.title.clone(),
                    s.status_id.clone(),
                    s.due_date.clone(),
                )
            })
            .collect();
        assert_eq!(
            shape,
            vec![
                (
                    "Outline".to_string(),
                    "done".to_string(),
                    Some("2026-03-05".to_string())
                ),
                ("Draft".to_string(), "backlog".to_string(), None),
            ]
        );
        assert!(subs.iter().all(|s| s.entity.entity_type == "sub_task"));
        // Exporting what came in gives the same file.
        assert_eq!(export_task_json(&fx.conn, &imported.id).unwrap(), json);
    }

    #[test]
    fn importing_leaves_the_original_alone_and_makes_a_new_task_every_time() {
        let fx = fixture();
        let task = full_task(&fx);
        let before = tasks::get_task(&fx.conn, &task.id).unwrap();
        let json = export_task_json(&fx.conn, &task.id).unwrap();
        let first = import_task_json(&fx.conn, &fx.space, &json).unwrap();
        let second = import_task_json(&fx.conn, &fx.space, &json).unwrap();
        assert_ne!(first.id, second.id);
        let after = tasks::get_task(&fx.conn, &task.id).unwrap();
        assert_eq!(after.entity.updated_at, before.entity.updated_at);
        assert_eq!(after.status_id, before.status_id);
        assert_eq!(tasks::list_subtasks(&fx.conn, &task.id).unwrap().len(), 2);
    }

    #[test]
    fn a_status_is_found_by_name_then_by_doneness_then_the_first() {
        let fx = fixture();
        let status = |name: &str, doneness: i64| StatusFile {
            name: name.into(),
            doneness,
        };
        assert_eq!(
            resolve_status(&fx.conn, &status("  DONE ", 0)).unwrap().0,
            "done"
        );
        // A name this instance does not have: the first status of the same doneness.
        assert_eq!(
            resolve_status(&fx.conn, &status("Shipped", 100)).unwrap().0,
            "done"
        );
        // A doneness no status has: the first status.
        let first = tasks::list_task_statuses(&fx.conn).unwrap()[0].id.clone();
        assert_eq!(
            resolve_status(&fx.conn, &status("Odd", 37)).unwrap().0,
            first
        );
        // The user renamed a status: the file finds it by the new name.
        fx.conn
            .execute(
                "UPDATE task_statuses SET name = 'Doing' WHERE id = 'in_progress'",
                [],
            )
            .unwrap();
        assert_eq!(
            resolve_status(&fx.conn, &status("doing", 50)).unwrap().0,
            "in_progress"
        );
    }

    #[test]
    fn a_finished_repeating_task_arrives_finished_and_starts_no_next_one() {
        let fx = fixture();
        let task = tasks::create_task(
            &fx.conn,
            fx.space.clone(),
            "Water plants".into(),
            None,
            Some("2026-03-01".into()),
        )
        .unwrap();
        tasks::set_task_repeat(
            &fx.conn,
            &task.entity.id,
            Some(RepeatRule {
                every: 1,
                unit: RepeatUnit::Week,
            }),
        )
        .unwrap();
        // Written straight, the way a finished one reads in a file.
        let json = export_task_json(&fx.conn, &task.entity.id)
            .unwrap()
            .replace("\"name\": \"Backlog\"", "\"name\": \"Done\"");
        let json = json.replace("\"doneness\": 0", "\"doneness\": 100");
        let before = entity_count(&fx.conn);
        let imported = import_task_json(&fx.conn, &fx.space, &json).unwrap();
        assert_eq!(entity_count(&fx.conn), before + 1, "no next occurrence");
        let got = tasks::get_task(&fx.conn, &imported.id).unwrap();
        assert_eq!(got.status_id, "done");
        assert!(got.completed_at.is_some());
        // Saving Done again does not start one either.
        tasks::update_task_status(&fx.conn, &imported.id, "done").unwrap();
        assert_eq!(entity_count(&fx.conn), before + 1);
    }

    #[test]
    fn a_sub_task_and_a_trashed_sub_task_are_handled() {
        let fx = fixture();
        let task = full_task(&fx);
        let subs = tasks::list_subtasks(&fx.conn, &task.id).unwrap();
        assert!(matches!(
            export_task_json(&fx.conn, &subs[0].entity.id),
            Err(AppError::InvalidInput(_))
        ));
        crate::db::entities::soft_delete_entity(&fx.conn, &subs[1].entity.id).unwrap();
        let json = export_task_json(&fx.conn, &task.id).unwrap();
        assert!(json.contains("Outline"));
        assert!(
            !json.contains("Draft"),
            "a trashed sub-task is not exported"
        );
    }

    #[test]
    fn something_that_is_not_a_task_is_refused() {
        let fx = fixture();
        let note =
            crate::db::notes::create_page(&fx.conn, fx.space.clone(), "note", "N".into()).unwrap();
        assert!(matches!(
            export_task_json(&fx.conn, &note.id),
            Err(AppError::InvalidInput(_))
        ));
        assert!(matches!(
            export_task_json(&fx.conn, "missing"),
            Err(AppError::NotFound(_))
        ));
    }

    fn base() -> serde_json::Value {
        serde_json::json!({
            "format": "nookly-task", "version": 1, "kind": "task", "title": "T",
            "status": { "name": "Backlog", "doneness": 0 }
        })
    }

    fn with(patch: serde_json::Value) -> String {
        let mut value = base();
        for (key, v) in patch.as_object().unwrap() {
            value[key] = v.clone();
        }
        value.to_string()
    }

    #[test]
    fn a_bad_file_is_refused_clearly_and_creates_nothing() {
        let fx = fixture();
        let before = entity_count(&fx.conn);
        let sub = |extra: serde_json::Value| {
            let mut s =
                serde_json::json!({ "title": "S", "status": { "name": "Backlog", "doneness": 0 } });
            for (k, v) in extra.as_object().unwrap() {
                s[k] = v.clone();
            }
            s
        };
        let cases: Vec<(String, &str)> = vec![
            ("{ nope".into(), "not a Nookly task file"),
            (
                r#"{"format":"nookly-page","version":1}"#.into(),
                "not a Nookly task file",
            ),
            (with(serde_json::json!({ "version": 2 })), "version 2"),
            (with(serde_json::json!({ "kind": "deck" })), "not a task"),
            (with(serde_json::json!({ "colour": "red" })), "colour"),
            (
                with(serde_json::json!({ "dueDate": "tomorrow" })),
                "dueDate",
            ),
            (
                with(serde_json::json!({ "startDate": "2026-13-40" })),
                "startDate",
            ),
            (with(serde_json::json!({ "effort": 4 })), "effort"),
            (
                with(serde_json::json!({ "status": { "name": "x", "doneness": 101 } })),
                "doneness",
            ),
            (
                with(serde_json::json!({ "status": { "name": "x" } })),
                "not valid",
            ),
            (
                with(serde_json::json!({ "repeat": { "every": 0, "unit": "day" } })),
                "repeat",
            ),
            (
                with(serde_json::json!({ "repeat": { "every": 1, "unit": "year" } })),
                "not valid",
            ),
            (
                with(
                    serde_json::json!({ "subtasks": [sub(serde_json::json!({ "subtasks": [] }))] }),
                ),
                "subtasks",
            ),
            (
                with(serde_json::json!({ "subtasks": [sub(serde_json::json!({ "effort": 4 }))] })),
                "sub-task 1",
            ),
            (
                with(
                    serde_json::json!({ "subtasks": [sub(serde_json::json!({ "dueDate": "x" }))] }),
                ),
                "sub-task 1",
            ),
            (
                with(
                    serde_json::json!({ "blocks": [{ "type": "callout", "content": "", "attrs": { "variant": "nope" } }] }),
                ),
                "block 1",
            ),
        ];
        for (text, expected) in cases {
            let err = import_task_json(&fx.conn, &fx.space, &text).unwrap_err();
            assert!(matches!(err, AppError::InvalidInput(_)), "{text}");
            assert!(err.to_string().contains(expected), "{text}: {err}");
            assert_eq!(
                entity_count(&fx.conn),
                before,
                "{text} left something behind"
            );
        }
    }

    #[test]
    fn a_bad_block_in_the_last_subtask_leaves_no_task_behind() {
        let fx = fixture();
        let before = entity_count(&fx.conn);
        let text = with(serde_json::json!({
            "subtasks": [
                { "title": "ok", "status": { "name": "Backlog", "doneness": 0 } },
                { "title": "bad", "status": { "name": "Backlog", "doneness": 0 },
                  "blocks": [{ "type": "callout", "content": "", "attrs": { "variant": "nope" } }] }
            ]
        }));
        assert!(import_task_json(&fx.conn, &fx.space, &text).is_err());
        assert_eq!(entity_count(&fx.conn), before);
    }

    #[test]
    fn the_preview_lists_what_would_be_created_and_changes_nothing() {
        let fx = fixture();
        let task = full_task(&fx);
        let json = export_task_json(&fx.conn, &task.id).unwrap();
        let before = entity_count(&fx.conn);
        let p = preview(&json).unwrap();
        assert_eq!(p.kind, "task");
        assert_eq!(p.title, "Write the report");
        assert_eq!(p.count, 2);
        assert_eq!(p.count_label, "subtask");
        assert_eq!(p.items[0].text, "Outline");
        assert_eq!(p.items[0].label, "Done");
        for fact in [
            "Status: In Progress",
            "Due 2026-03-10",
            "Effort 5",
            "Repeats every 2 weeks",
            "1 description block",
        ] {
            assert!(p.facts.iter().any(|f| f == fact), "{fact} in {:?}", p.facts);
        }
        assert_eq!(p.parent_type, None);
        assert_eq!(entity_count(&fx.conn), before);
        assert!(preview("{}").is_err());
    }

    #[test]
    fn it_is_registered_for_tasks_only() {
        let def = crate::db::portable::for_type("task").unwrap();
        assert_eq!(def.format, FORMAT);
        assert!(crate::db::portable::for_type("sub_task").is_none());
    }
}
