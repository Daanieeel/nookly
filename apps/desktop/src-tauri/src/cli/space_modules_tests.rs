//! A Space's modules from the CLI, as the sidebar's "+" and a module's menu change them.

use super::*;

fn run(conn: &Connection, line: &str) -> AppResult<Value> {
    dispatch(conn, line.split_whitespace().map(str::to_string).collect())
}

fn modules(conn: &Connection, space: &str) -> Vec<String> {
    serde_json::from_value(run(conn, &format!("space modules {space}")).unwrap()["items"].clone())
        .unwrap()
}

#[test]
fn adds_reorders_and_removes_a_spaces_modules() {
    let conn = crate::db::test_conn();
    let space = crate::db::test_space(&conn, "Uni").id;
    run(&conn, &format!("space add-module {space} tasks")).unwrap();
    run(&conn, &format!("space add-module {space} notes")).unwrap();
    assert_eq!(modules(&conn, &space), ["tasks", "notes"]);
    run(&conn, &format!("space reorder-modules {space} notes tasks")).unwrap();
    assert_eq!(modules(&conn, &space), ["notes", "tasks"]);
    // Taking one away asks for --yes; what was in it goes to Trash or waits hidden.
    assert!(run(&conn, &format!("space remove-module {space} notes")).is_err());
    run(&conn, &format!("space remove-module {space} notes --yes")).unwrap();
    assert_eq!(modules(&conn, &space), ["tasks"]);
}

#[test]
fn keeps_a_removed_modules_items_to_come_back_unless_told_to_trash_them() {
    let conn = crate::db::test_conn();
    let space = crate::db::test_space(&conn, "Uni").id;
    let task = run(
        &conn,
        &format!("task create --space {space} --title Report"),
    )
    .unwrap();
    let id = task["data"]["entity"]["id"].as_str().unwrap().to_string();
    run(&conn, &format!("space remove-module {space} tasks --yes")).unwrap();
    run(&conn, &format!("space add-module {space} tasks")).unwrap();
    assert!(run(&conn, &format!("task get {id}")).is_ok());
    run(
        &conn,
        &format!("space remove-module {space} tasks --yes --trash-content"),
    )
    .unwrap();
    let trashed = run(
        &conn,
        &format!("task list --space {space} --include-deleted"),
    )
    .unwrap();
    assert_eq!(trashed["count"], 1);
}
