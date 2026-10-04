//! The CLI's data model, pinned. `nookly cli schema` and `nookly cli --help` are
//! what agents read to learn what they can do, so a change to either is a change
//! to a public contract. These tests make such a change a reviewable diff instead
//! of a side effect of some other work.
//!
//! After an intended change, rewrite the files and read the diff:
//!
//!     NOOKLY_UPDATE_SNAPSHOTS=1 cargo test --lib cli::snapshot_tests

use super::*;
use std::path::PathBuf;

fn snapshot_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("src/cli/snapshots")
        .join(name)
}

/// Sorts every JSON object's keys and every array of named objects, so a snapshot
/// never changes just because registration order did.
fn canonical(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            Value::Object(
                keys.into_iter()
                    .map(|k| (k.clone(), canonical(&map[k])))
                    .collect(),
            )
        }
        Value::Array(items) => {
            let mut items: Vec<Value> = items.iter().map(canonical).collect();
            items.sort_by_key(|i| {
                ["entityType", "name", "id"]
                    .iter()
                    .find_map(|k| i.get(k).and_then(Value::as_str).map(str::to_string))
                    .unwrap_or_else(|| i.to_string())
            });
            Value::Array(items)
        }
        other => other.clone(),
    }
}

fn check(name: &str, value: &Value) {
    let actual = format!(
        "{}\n",
        serde_json::to_string_pretty(&canonical(value)).unwrap()
    );
    let path = snapshot_path(name);
    if std::env::var_os("NOOKLY_UPDATE_SNAPSHOTS").is_some() {
        std::fs::write(&path, &actual).unwrap();
        return;
    }
    // Git on Windows may check the file out with CRLF line endings.
    let expected = std::fs::read_to_string(&path)
        .unwrap_or_default()
        .replace("\r\n", "\n");
    assert!(
        expected == actual,
        "{name} changed. If that is intended, run\n  NOOKLY_UPDATE_SNAPSHOTS=1 cargo test --lib cli::snapshot_tests\nand commit the diff of src/cli/snapshots/{name}."
    );
}

#[test]
fn the_schema_is_pinned() {
    let conn = crate::db::test_conn();
    let schema = dispatch(&conn, vec!["schema".into()]).unwrap();
    check("schema.json", &schema);
}

#[test]
fn every_entity_type_describe_is_pinned() {
    let conn = crate::db::test_conn();
    let described: Vec<Value> = schema::all()
        .iter()
        .map(|d| dispatch(&conn, vec!["describe".into(), d.entity_type.into()]).unwrap())
        .collect();
    check("describe.json", &Value::Array(described));
}

#[test]
fn the_help_text_is_pinned() {
    let conn = crate::db::test_conn();
    let help = dispatch(&conn, vec!["--help".into()]).unwrap();
    check("help.json", &help);
}

#[test]
fn registration_order_never_changes_a_snapshot() {
    // Canonical form is the same for any order of the same data.
    let a = json!({ "items": [{ "name": "b" }, { "name": "a" }], "z": 1, "a": 2 });
    let b = json!({ "a": 2, "z": 1, "items": [{ "name": "a" }, { "name": "b" }] });
    assert_eq!(canonical(&a), canonical(&b));
}
