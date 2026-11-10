//! The generic `list`, `get` and `download` verbs for remote types (Moodle), read from
//! the registry in `moodle::remote`. Like entity commands there is no code per type here.
//!
//! Remote types are read only and fetched live from the user's university through the
//! same `MoodleState` the app uses, with the token from the system keychain. Nothing is
//! written to the database.

use super::*;
use crate::moodle::remote::{self, RemoteTypeDef};
use crate::moodle::service::{Fetched, MoodleState};
use std::path::PathBuf;

/// `nookly cli <remote-type> [verb] ...`
pub(super) fn remote_command(def: &RemoteTypeDef, rest: &[String]) -> AppResult<Value> {
    let Some(verb) = rest.first() else {
        return Ok(remote::describe_json(def));
    };
    // A verb that does not exist is refused before anything touches the sign in.
    check_verb(def, verb)?;
    let dry_run = rest.iter().any(|a| a == "--dry-run");
    run_command(&rest[1..], |args| {
        let state = open_state()?;
        run_verb(&state, def, verb, args, dry_run)
    })
}

/// The Moodle service as the app has it: the same data folder, connection file and
/// keychain entry, so signing in once in the app is all it takes.
fn open_state() -> AppResult<MoodleState> {
    let dir = crate::db::standalone_app_data_dir().map_err(|e| AppError::Io(e.to_string()))?;
    Ok(MoodleState::load(&dir, &crate::moodle::login::scheme()))
}

fn run_verb(
    state: &MoodleState,
    def: &RemoteTypeDef,
    verb: &str,
    args: &Args,
    dry_run: bool,
) -> AppResult<Value> {
    check_verb(def, verb)?;
    match verb {
        "download" => download_remote(state, def, args, dry_run),
        "get" => get_remote(state, def, args),
        _ => list_remote(state, def, args),
    }
}

fn check_verb(def: &RemoteTypeDef, verb: &str) -> AppResult<()> {
    if matches!(verb, "list" | "get") || (verb == "download" && def.downloads) {
        return Ok(());
    }
    let mut verbs = vec!["list", "get"];
    if def.downloads {
        verbs.push("download");
    }
    Err(AppError::InvalidInput(format!(
        "unknown {} command '{verb}'. {} is read only, expected one of: {}",
        def.entity_type,
        def.entity_type,
        verbs.join(", ")
    )))
}

fn block_on<F: std::future::Future>(future: F) -> F::Output {
    tauri::async_runtime::block_on(future)
}

/// Tells the agent what to do when the sign in is missing or refused: it cannot sign in itself.
fn sign_in_hint(err: AppError) -> AppError {
    match err {
        AppError::Remote(message)
            if message == "Moodle isn't connected." || message.contains("Connect again") =>
        {
            AppError::Remote(format!(
                "{} Nookly is not signed in to Moodle. The CLI cannot sign in: ask the user to \
                 open the Nookly app and sign in from the Moodle module, then retry.",
                message.trim_end_matches("Connect again.").trim()
            ))
        }
        other => other,
    }
}

fn parent_id(def: &RemoteTypeDef, args: &Args) -> AppResult<Option<i64>> {
    let Some(parent) = &def.parent else {
        return Ok(None);
    };
    let raw = args.require_flag(parent.flag)?;
    raw.trim().parse::<i64>().map(Some).map_err(|_| {
        AppError::InvalidInput(format!(
            "--{} expects {} (a whole number), got '{raw}'",
            parent.flag,
            parent.description.to_lowercase()
        ))
    })
}

fn fetch(
    state: &MoodleState,
    def: &RemoteTypeDef,
    parent: Option<i64>,
) -> AppResult<Fetched<Vec<Value>>> {
    block_on(remote::list(state, def, parent)).map_err(sign_in_hint)
}

fn offline_note(fetched: &Fetched<Vec<Value>>) -> Value {
    if fetched.offline {
        json!("Moodle could not be reached, so this is the last answer it gave, at `fetchedAt`.")
    } else {
        Value::Null
    }
}

fn list_remote(state: &MoodleState, def: &RemoteTypeDef, args: &Args) -> AppResult<Value> {
    let parent = parent_id(def, args)?;
    let fields = args.field_list();
    if let Some(fields) = &fields {
        for name in fields {
            if !def.fields.iter().any(|f| f.name == name) {
                let known: Vec<&str> = def.fields.iter().map(|f| f.name).collect();
                return Err(AppError::InvalidInput(format!(
                    "unknown field '{name}' for '{}'. Known fields: {}.",
                    def.entity_type,
                    known.join(", ")
                )));
            }
        }
    }
    let limit = args.usize_flag("limit")?;
    let fetched = fetch(state, def, parent)?;
    let total = fetched.data.len();
    let mut items: Vec<Value> = fetched
        .data
        .iter()
        .take(limit.unwrap_or(total))
        .cloned()
        .collect();
    if let Some(fields) = &fields {
        for item in &mut items {
            *item = pick(item, fields, def.id_field);
        }
    }
    Ok(json!({
        "entityType": def.entity_type,
        "remote": true,
        "count": total,
        "returned": items.len(),
        "items": items,
        "fetchedAt": fetched.fetched_at,
        "offline": fetched.offline,
        "note": offline_note(&fetched),
    }))
}

/// The id field always comes along, like `id` and `key` on entities.
fn pick(item: &Value, fields: &[String], id_field: &str) -> Value {
    let Some(map) = item.as_object() else {
        return item.clone();
    };
    map.iter()
        .filter(|(name, _)| name.as_str() == id_field || fields.iter().any(|f| f == *name))
        .map(|(name, value)| (name.clone(), value.clone()))
        .collect()
}

fn get_remote(state: &MoodleState, def: &RemoteTypeDef, args: &Args) -> AppResult<Value> {
    let wanted = args.require_positional(0, def.id_field)?;
    let parent = parent_id(def, args)?;
    let fetched = fetch(state, def, parent)?;
    let wanted_number = wanted.parse::<i64>().ok();
    let found = fetched.data.iter().find(|item| match &item[def.id_field] {
        Value::String(text) => *text == wanted,
        number => number.as_i64().is_some() && number.as_i64() == wanted_number,
    });
    let Some(item) = found else {
        return Err(AppError::NotFound(format!(
            "{} {wanted} (Moodle does not list it{})",
            def.entity_type,
            def.parent
                .as_ref()
                .map(|p| format!(" for that {}", p.flag))
                .unwrap_or_default()
        )));
    };
    let mut item = item.clone();
    if def.entity_type == "moodle_assignment" {
        let id = item["id"].as_i64().unwrap_or_default();
        let status = block_on(remote::assignment_status(state, id)).map_err(sign_in_hint)?;
        item["status"] = status;
    }
    Ok(json!({
        "entityType": def.entity_type,
        "remote": true,
        "data": item,
        "fetchedAt": fetched.fetched_at,
        "offline": fetched.offline,
        "note": offline_note(&fetched),
    }))
}

fn download_remote(
    state: &MoodleState,
    def: &RemoteTypeDef,
    args: &Args,
    dry_run: bool,
) -> AppResult<Value> {
    let url = args.require_flag("url")?;
    let out = PathBuf::from(args.require_flag("out")?);
    let file_name = args.flag("file-name");
    let dest = if out.is_dir() {
        let name = file_name.ok_or_else(|| {
            AppError::InvalidInput(
                "--out is a folder, so --file-name <name> is required to say what to call the file"
                    .into(),
            )
        })?;
        out.join(crate::moodle::service::safe_file_name(&name))
    } else {
        out
    };
    // Never replace something the user already has, and never trample the temp file the
    // download goes through.
    for taken in [dest.clone(), dest.with_extension("partial")] {
        if taken.exists() {
            return Err(AppError::InvalidInput(format!(
                "{} already exists. Pick a path that does not, {} never overwrites a file.",
                taken.display(),
                def.entity_type
            )));
        }
    }
    if dry_run {
        return Ok(json!({ "wouldSaveTo": dest, "note": "nothing was downloaded" }));
    }
    let bytes = block_on(state.save_file(&url, &dest)).map_err(sign_in_hint)?;
    Ok(json!({
        "saved": dest,
        "bytes": bytes,
        "note": "A copy of the file from Moodle. To keep it in Nookly, run `nookly cli file create --space <id> --title <title> --field localPath=<path>`.",
    }))
}

#[cfg(test)]
#[path = "remote_tests.rs"]
mod tests;
