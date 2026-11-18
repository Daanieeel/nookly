//! `nookly cli settings`, run against a settings file in a temporary folder.

use super::settings::command;
use serde_json::{json, Value};
use std::path::Path;

/// A temporary folder, removed on drop.
struct TempDir(std::path::PathBuf);

impl TempDir {
    fn new() -> Self {
        let dir = std::env::temp_dir().join(format!("nookly-cli-settings-{}", crate::db::new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn run(dir: &Path, args: &[&str]) -> Result<Value, crate::error::AppError> {
    command(dir, &args.iter().map(|a| a.to_string()).collect::<Vec<_>>())
}

fn file(dir: &Path) -> Value {
    serde_json::from_str(&std::fs::read_to_string(dir.join("settings.json")).unwrap()).unwrap()
}

#[test]
fn lists_every_setting_with_its_value_and_default() {
    let dir = TempDir::new();
    let all = run(dir.path(), &["list"]).unwrap();
    assert!(all["count"].as_u64().unwrap() > 20);
    let theme = all["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["id"] == "appearance.theme")
        .unwrap()
        .clone();
    assert_eq!(theme["value"], theme["default"]);
    assert_eq!(theme["isDefault"], true);
    let calendar = run(dir.path(), &["list", "--category", "calendar"]).unwrap();
    assert!(calendar["items"]
        .as_array()
        .unwrap()
        .iter()
        .all(|s| s["category"] == "calendar"));
    // Nothing is written by reading.
    assert!(!dir.path().join("settings.json").exists());
}

#[test]
fn sets_a_value_keeping_every_other_key_of_the_file() {
    let dir = TempDir::new();
    std::fs::write(
        dir.path().join("settings.json"),
        r#"{"notes.vimMode": true, "someday.unknown": {"kept": 1}}"#,
    )
    .unwrap();
    let changed = run(dir.path(), &["set", "calendar.weekStart", "monday"]).unwrap();
    assert_eq!(changed["after"], "monday");
    let number = run(dir.path(), &["set", "calendar.sessionLengthMinutes", "45"]).unwrap();
    assert_eq!(number["after"], 45);
    let saved = file(dir.path());
    assert_eq!(saved["calendar.weekStart"], "monday");
    assert_eq!(saved["notes.vimMode"], true);
    assert_eq!(saved["someday.unknown"], json!({ "kept": 1 }));
    assert_eq!(
        run(dir.path(), &["get", "calendar.weekStart"]).unwrap()["isDefault"],
        false
    );
}

#[test]
fn refuses_a_value_the_setting_does_not_take() {
    let dir = TempDir::new();
    for (id, value) in [
        ("appearance.theme", "purple"),
        ("calendar.sessionLengthMinutes", "47"),
        ("calendar.dayStartHour", "30"),
        ("notes.vimMode", "yes"),
        ("sync.serverUrl", "not a url"),
    ] {
        let err = run(dir.path(), &["set", id, value]).unwrap_err();
        assert!(
            err.to_string().contains("doesn't take"),
            "{id} took {value}"
        );
    }
    assert!(run(dir.path(), &["set", "no.such", "1"]).is_err());
    assert!(!dir.path().join("settings.json").exists());
}

#[test]
fn resets_to_the_default() {
    let dir = TempDir::new();
    run(dir.path(), &["set", "notes.editorFontSize", "18"]).unwrap();
    let reset = run(dir.path(), &["reset", "notes.editorFontSize"]).unwrap();
    assert_eq!(reset["items"][0]["before"], 18);
    assert!(file(dir.path()).get("notes.editorFontSize").is_none());
}

#[test]
fn never_writes_over_a_file_it_cannot_read() {
    let dir = TempDir::new();
    std::fs::write(dir.path().join("settings.json"), "{ broken").unwrap();
    assert!(run(dir.path(), &["set", "notes.vimMode", "true"]).is_err());
    assert_eq!(
        std::fs::read_to_string(dir.path().join("settings.json")).unwrap(),
        "{ broken"
    );
}

#[test]
fn shows_a_stored_value_the_app_would_not_take_as_the_default() {
    let dir = TempDir::new();
    std::fs::write(
        dir.path().join("settings.json"),
        r#"{"appearance.theme": 7}"#,
    )
    .unwrap();
    let theme = run(dir.path(), &["get", "appearance.theme"]).unwrap();
    assert_eq!(theme["isDefault"], true);
    assert_eq!(theme["value"], theme["default"]);
}
