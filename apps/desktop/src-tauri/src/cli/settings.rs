//! `nookly cli settings`: the app's settings (theme, date format, calendar lengths,
//! shortcuts, ...), read from and written to `settings.json` in the data folder, the file
//! the app's settings store keeps. What each setting is and the values it takes come from
//! `settings-catalog.json`, generated from the app's own registry
//! (`packages/frontend/src/lib/settings/catalog.ts`, a test keeps the two the same).
//!
//! A write keeps every other key of the file as it was (also ones this build does not
//! know), goes through a temporary file and a rename, and never touches a file that can't
//! be read. The running app reads the file again before it saves and every few seconds,
//! so a change made here shows up there and is not saved over.

use std::path::Path;

use serde_json::{json, Map, Value};

use super::Args;
use crate::error::{AppError, AppResult};

const CATALOG: &str = include_str!("settings-catalog.json");
const FILE: &str = "settings.json";

fn catalog() -> AppResult<Vec<Value>> {
    serde_json::from_str(CATALOG).map_err(|e| AppError::Io(format!("settings catalog: {e}")))
}

fn entry<'a>(catalog: &'a [Value], id: &str) -> AppResult<&'a Value> {
    catalog.iter().find(|e| e["id"] == id).ok_or_else(|| {
        AppError::NotFound(format!(
            "no setting '{id}'. `nookly cli settings list` shows every setting id"
        ))
    })
}

/// The file's keys, or none when it does not exist yet. A file that can't be read or isn't
/// a JSON object is an error, so it is never written over.
fn read_file(dir: &Path) -> AppResult<Map<String, Value>> {
    let path = dir.join(FILE);
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Map::new()),
        Err(e) => return Err(AppError::Io(format!("{}: {e}", path.display()))),
    };
    if text.trim().is_empty() {
        return Ok(Map::new());
    }
    match serde_json::from_str::<Value>(&text) {
        Ok(Value::Object(map)) => Ok(map),
        _ => Err(AppError::Io(format!(
            "{} can't be read as settings; it is left as it is. Open it from Settings in the app to fix it",
            path.display()
        ))),
    }
}

/// Writes the file whole: to a temporary file beside it, then renamed over it.
fn write_file(dir: &Path, map: &Map<String, Value>) -> AppResult<()> {
    std::fs::create_dir_all(dir).map_err(|e| AppError::Io(e.to_string()))?;
    let path = dir.join(FILE);
    let temp = dir.join(format!("{FILE}.cli-{}", std::process::id()));
    let text = serde_json::to_string_pretty(&Value::Object(map.clone()))
        .map_err(|e| AppError::Io(e.to_string()))?;
    let written = (|| {
        use std::io::Write;
        let mut file = std::fs::File::create(&temp)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        std::fs::rename(&temp, &path)
    })();
    if let Err(e) = written {
        let _ = std::fs::remove_file(&temp);
        return Err(AppError::Io(format!("{}: {e}", path.display())));
    }
    Ok(())
}

/// A setting as the CLI shows it: what it is, its value (the default when the file has none
/// or holds one the app would not take), and the values it takes.
fn shown(entry: &Value, file: &Map<String, Value>) -> Value {
    let id = entry["id"].as_str().unwrap_or_default();
    let default = entry["default"].clone();
    let stored = file.get(id).filter(|v| check(&entry["schema"], v).is_ok());
    json!({
        "id": id,
        "category": entry["category"],
        "title": entry["title"],
        "description": entry["description"],
        "value": stored.cloned().unwrap_or_else(|| default.clone()),
        "default": default,
        "isDefault": stored.is_none(),
        "synced": entry["synced"],
        "schema": entry["schema"],
    })
}

pub fn command(dir: &Path, argv: &[String]) -> AppResult<Value> {
    let Some(verb) = argv.first() else {
        return Ok(usage());
    };
    super::run_command(&argv[1..], |args| run(dir, verb, args))
}

pub fn usage() -> Value {
    json!({
        "list": "nookly cli settings list [--category <general|appearance|calendar|notes|backup|agent|sync|shortcuts>]",
        "get": "nookly cli settings get <id> [<id> ...]",
        "set": "nookly cli settings set <id> <value>  (JSON when it reads as JSON: true, 30, null, [\"en\",\"de\"]; text otherwise. Checked against the setting's `schema`)",
        "reset": "nookly cli settings reset <id> [<id> ...]  (back to the default)",
        "note": "The running app picks a change up within a few seconds. Settings marked `synced` follow the account to the person's other devices. Signing in to sync is done in the app; the session never leaves the keychain.",
    })
}

fn run(dir: &Path, verb: &str, args: &Args) -> AppResult<Value> {
    let catalog = catalog()?;
    match verb {
        "list" => {
            let file = read_file(dir)?;
            let category = args.flag("category");
            let items: Vec<Value> = catalog
                .iter()
                .filter(|e| category.as_deref().is_none_or(|c| e["category"] == c))
                .map(|e| shown(e, &file))
                .collect();
            Ok(json!({ "count": items.len(), "items": items }))
        }
        "get" => {
            let ids = args.positional.clone();
            if ids.is_empty() {
                return Err(AppError::InvalidInput(
                    "settings get takes a setting id".into(),
                ));
            }
            let file = read_file(dir)?;
            let items = ids
                .iter()
                .map(|id| entry(&catalog, id).map(|e| shown(e, &file)))
                .collect::<AppResult<Vec<_>>>()?;
            Ok(if items.len() == 1 {
                items.into_iter().next().unwrap_or_default()
            } else {
                json!({ "count": items.len(), "items": items })
            })
        }
        "set" => {
            let id = args.require_positional(0, "id")?;
            let raw = args.require_positional(1, "value")?;
            let entry = entry(&catalog, &id)?;
            // JSON when it reads as JSON (`true`, `30`, `null`, `["en"]`), plain text otherwise.
            let value = super::parse_field_value(&raw);
            check(&entry["schema"], &value).map_err(|why| {
                AppError::InvalidInput(format!(
                    "{id} doesn't take {value}: {why}. It takes {}",
                    entry["schema"]
                ))
            })?;
            let mut file = read_file(dir)?;
            let before = shown(entry, &file)["value"].clone();
            file.insert(id.clone(), value);
            write_file(dir, &file)?;
            Ok(json!({ "id": id, "before": before, "after": shown(entry, &file)["value"] }))
        }
        "reset" => {
            let ids = args.positional.clone();
            if ids.is_empty() {
                return Err(AppError::InvalidInput(
                    "settings reset takes a setting id".into(),
                ));
            }
            let mut file = read_file(dir)?;
            let mut changes = Vec::new();
            for id in &ids {
                let entry = entry(&catalog, id)?;
                let before = shown(entry, &file)["value"].clone();
                file.remove(id.as_str());
                changes.push(json!({ "id": id, "before": before, "after": entry["default"] }));
            }
            write_file(dir, &file)?;
            Ok(json!({ "count": changes.len(), "items": changes }))
        }
        other => Err(AppError::InvalidInput(format!(
            "unknown settings command '{other}', expected list, get, set or reset"
        ))),
    }
}

/// Whether `value` matches `schema`: the part of JSON Schema the catalog uses (type, enum,
/// const, anyOf, number bounds and steps, string and array lengths, items, uri format).
fn check(schema: &Value, value: &Value) -> Result<(), String> {
    let Some(schema) = schema.as_object() else {
        return Ok(());
    };
    if let Some(options) = schema.get("anyOf").and_then(Value::as_array) {
        if !options.iter().any(|s| check(s, value).is_ok()) {
            return Err("it matches none of the allowed forms".into());
        }
    }
    if let Some(types) = schema.get("type") {
        let names: Vec<&str> = match types {
            Value::Array(list) => list.iter().filter_map(Value::as_str).collect(),
            Value::String(one) => vec![one.as_str()],
            _ => vec![],
        };
        if !names.is_empty() && !names.iter().any(|t| is_type(t, value)) {
            return Err(format!("expected {}", names.join(" or ")));
        }
    }
    if let Some(allowed) = schema.get("const") {
        if !same(allowed, value) {
            return Err(format!("expected {allowed}"));
        }
    }
    if let Some(allowed) = schema.get("enum").and_then(Value::as_array) {
        if !allowed.iter().any(|a| same(a, value)) {
            return Err(format!("expected one of {}", Value::Array(allowed.clone())));
        }
    }
    if let Some(n) = value.as_f64() {
        if schema
            .get("minimum")
            .and_then(Value::as_f64)
            .is_some_and(|min| n < min)
        {
            return Err(format!("below the minimum {}", schema["minimum"]));
        }
        if schema
            .get("maximum")
            .and_then(Value::as_f64)
            .is_some_and(|max| n > max)
        {
            return Err(format!("above the maximum {}", schema["maximum"]));
        }
        if let Some(step) = schema.get("multipleOf").and_then(Value::as_f64) {
            if step > 0.0 && (n / step).fract().abs() > 1e-9 {
                return Err(format!("not a multiple of {step}"));
            }
        }
    }
    if let Some(text) = value.as_str() {
        let length = text.chars().count() as u64;
        if schema
            .get("minLength")
            .and_then(Value::as_u64)
            .is_some_and(|min| length < min)
        {
            return Err(format!("shorter than {} characters", schema["minLength"]));
        }
        if schema
            .get("maxLength")
            .and_then(Value::as_u64)
            .is_some_and(|max| length > max)
        {
            return Err(format!("longer than {} characters", schema["maxLength"]));
        }
        if schema.get("format").and_then(Value::as_str) == Some("uri") && !text.contains("://") {
            return Err("expected an address like https://example.com".into());
        }
    }
    if let Some(list) = value.as_array() {
        if schema
            .get("maxItems")
            .and_then(Value::as_u64)
            .is_some_and(|max| list.len() as u64 > max)
        {
            return Err(format!("more than {} items", schema["maxItems"]));
        }
        if let Some(items) = schema.get("items") {
            for item in list {
                check(items, item)?;
            }
        }
    }
    Ok(())
}

fn is_type(name: &str, value: &Value) -> bool {
    match name {
        "string" => value.is_string(),
        "boolean" => value.is_boolean(),
        "null" => value.is_null(),
        "array" => value.is_array(),
        "object" => value.is_object(),
        "number" => value.is_number(),
        "integer" => value.as_f64().is_some_and(|n| n.fract() == 0.0),
        _ => true,
    }
}

/// JSON equality that reads `5` and `5.0` as the same number.
fn same(a: &Value, b: &Value) -> bool {
    match (a.as_f64(), b.as_f64()) {
        (Some(x), Some(y)) => x == y,
        _ => a == b,
    }
}
