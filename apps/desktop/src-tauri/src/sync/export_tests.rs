//! The desktop's schema, as the server and the mobile app read it
//! (`packages/shared/src/generated/desktop-schema.json`): every synced table with
//! its columns and SQL, sync's own tables and triggers, and the registered entity
//! and relationship types. Registering a type, a field or a table here is all it
//! takes for every client to know it. After an intended change, rewrite the file
//! and read the diff:
//!
//!     NOOKLY_UPDATE_SNAPSHOTS=1 cargo test --lib sync::export_tests

use super::registry::{columns, SYNCED_TABLES};
use crate::db::test_conn;
use rusqlite::Connection;
use serde_json::{json, Value};
use std::path::PathBuf;

fn export_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/shared/src/generated/desktop-schema.json")
}

fn sql_of(conn: &Connection, kind: &str, filter: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT sql FROM sqlite_master WHERE type = ?1 AND sql IS NOT NULL AND {filter} ORDER BY name"
        ))
        .unwrap();
    stmt.query_map([kind], |row| row.get::<_, String>(0))
        .unwrap()
        .map(Result::unwrap)
        .collect()
}

fn export(conn: &Connection) -> Value {
    let tables: Vec<Value> = SYNCED_TABLES
        .iter()
        .map(|table| {
            let name = table.name;
            json!({
                "name": name,
                "pk": table.pk,
                "scope": table.scope,
                "merge": table.merge,
                "localColumns": table.local_columns,
                "columns": columns(conn, name).unwrap(),
                "sql": sql_of(conn, "table", &format!("name = '{name}'")).first(),
                "indexes": sql_of(conn, "index", &format!("tbl_name = '{name}'")),
            })
        })
        .collect();
    // Sync's own tables, and the device's bookkeeping of which file holds what.
    let sync_tables =
        "name IN ('sync_meta', 'sync_dirty', 'sync_rows', 'sync_conflicts', 'blob_files')";
    let entity_types: Vec<Value> = crate::db::schema::all()
        .iter()
        .map(|def| {
            json!({
                "entityType": def.entity_type,
                "description": def.description,
                "keyPrefix": crate::db::entities::key_prefix(def.entity_type),
                "moduleKeys": crate::db::space_modules::module_keys_for_entity_type(def.entity_type),
                "supportsBlocks": def.supports_blocks,
                "fields": crate::db::schema::describe_json(def)["fields"],
                "relationshipTypes": def.relationship_types,
            })
        })
        .collect();
    // Rows the migrations seed (the default task statuses), so a new device starts
    // with the same ones and the same ids.
    let seeds: Vec<Value> = SYNCED_TABLES
        .iter()
        .filter_map(|table| {
            let pk = table.pk.join(", ");
            let rows = crate::sync::batch::run_query(
                conn,
                &format!("SELECT * FROM {} ORDER BY {pk}", table.name),
                &[],
            )
            .unwrap();
            (!rows.is_empty()).then(|| json!({ "table": table.name, "rows": rows }))
        })
        .collect();
    let mut relationship_types = crate::db::relationships::list_relationship_types();
    relationship_types.sort_by(|a, b| a.name.cmp(&b.name));
    json!({
        "schemaVersion": crate::db::latest_schema_version(),
        "tables": tables,
        "syncTables": sql_of(conn, "table", sync_tables),
        "syncIndexes": sql_of(conn, "index", "tbl_name LIKE 'sync_%'"),
        "syncTriggers": sql_of(conn, "trigger", "name LIKE 'sync_%'"),
        "seeds": seeds,
        "entityTypes": entity_types,
        "relationshipTypes": relationship_types,
    })
}

#[test]
fn the_shared_schema_matches_the_desktop() {
    let actual = format!(
        "{}\n",
        serde_json::to_string_pretty(&export(&test_conn())).unwrap()
    );
    let path = export_path();
    if std::env::var_os("NOOKLY_UPDATE_SNAPSHOTS").is_some() {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, &actual).unwrap();
        return;
    }
    let expected = std::fs::read_to_string(&path)
        .unwrap_or_default()
        .replace("\r\n", "\n");
    assert!(
        expected == actual,
        "the desktop schema changed. If that is intended, run\n  NOOKLY_UPDATE_SNAPSHOTS=1 cargo test --lib sync::export_tests\nand commit the diff of packages/shared/src/generated/desktop-schema.json."
    );
}
