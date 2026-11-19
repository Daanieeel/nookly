//! `nookly cli sync status`: what sync is doing on this device, never its session.

use super::sync::command;

fn run(conn: &rusqlite::Connection, data: &std::path::Path) -> serde_json::Value {
    command(conn, data, &["status".to_string()]).unwrap()
}

#[test]
fn says_sync_is_off_on_a_device_that_never_signed_in() {
    let conn = crate::db::test_conn();
    let data = std::env::temp_dir().join(format!("nookly-cli-sync-{}", crate::db::new_id()));
    let status = run(&conn, &data);
    assert_eq!(status["on"], false);
    // Nothing stored: the server is Nookly's own, the default of the setting.
    assert_eq!(status["serverUrl"], "https://sync.nookly.work");
    assert_eq!(status["changesWaiting"], 0);
    assert_eq!(status["openClashes"], 0);
}

#[test]
fn counts_what_waits_and_what_clashes_and_shows_no_session() {
    let conn = crate::db::test_conn();
    let data = std::env::temp_dir().join(format!("nookly-cli-sync-{}", crate::db::new_id()));
    std::fs::create_dir_all(&data).unwrap();
    std::fs::write(
        data.join("settings.json"),
        r#"{"sync.serverUrl": "https://sync.example.com"}"#,
    )
    .unwrap();
    conn.execute_batch(
        "INSERT INTO sync_meta (key, value) VALUES ('enabled', '1'), ('device_id', 'dev-1');
         INSERT INTO sync_dirty (tbl, pk, changed_at) VALUES ('entities', 'a', 1), ('entities', 'b', 1);
         INSERT INTO sync_conflicts (id, tbl, pk, created_at) VALUES ('c1', 'entities', 'a', 'now');
         INSERT INTO sync_conflicts (id, tbl, pk, created_at, resolved_at) VALUES ('c2', 'entities', 'b', 'now', 'later');",
    )
    .unwrap();
    let status = run(&conn, &data);
    assert_eq!(status["on"], true);
    assert_eq!(status["serverUrl"], "https://sync.example.com");
    assert_eq!(status["deviceId"], "dev-1");
    assert_eq!(status["changesWaiting"], 2);
    assert_eq!(status["openClashes"], 1);
    let text = status.to_string().to_lowercase();
    assert!(!text.contains("token"));
    let _ = std::fs::remove_dir_all(&data);
}
