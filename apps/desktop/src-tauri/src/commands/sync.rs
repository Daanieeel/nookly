//! The commands the shared sync engine runs on the desktop (see `crate::sync`).

use crate::db::DbState;
use crate::error::AppResult;
use crate::sync::batch::{self, BatchOutcome, Statement};
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub fn sync_query(state: State<DbState>, sql: String, params: Vec<Value>) -> AppResult<Vec<Value>> {
    let conn = state.conn()?;
    batch::run_query(&conn, &sql, &params)
}

#[tauri::command]
pub fn sync_batch(state: State<DbState>, statements: Vec<Statement>) -> AppResult<BatchOutcome> {
    let mut conn = state.conn()?;
    batch::run_batch(&mut conn, &statements)
}

#[tauri::command]
pub fn sync_reindex(state: State<DbState>, entity_ids: Vec<String>) -> AppResult<()> {
    let conn = state.conn()?;
    crate::sync::reindex(&conn, &entity_ids)
}

#[tauri::command]
pub async fn sync_refresh_token() -> AppResult<Option<String>> {
    crate::sync::secrets::get()
}

#[tauri::command]
pub async fn sync_set_refresh_token(token: Option<String>) -> AppResult<()> {
    match token {
        Some(token) => crate::sync::secrets::set(&token),
        None => crate::sync::secrets::delete(),
    }
}

/// What the person calls this computer ("Daniel's MacBook Pro"), shown in the account's
/// device list and in conflicts. Trimmed, without the network suffix, at most 60 characters.
fn clean_computer_name(raw: &str) -> Option<String> {
    let name = raw.trim();
    let name = [".local", ".lan", ".home", ".fritz.box"]
        .iter()
        .find_map(|suffix| name.strip_suffix(suffix))
        .unwrap_or(name)
        .trim();
    let name: String = name.chars().filter(|c| !c.is_control()).take(60).collect();
    (!name.trim().is_empty()).then(|| name.trim().to_string())
}

fn computer_name() -> Option<String> {
    let run = |program: &str, args: &[&str]| {
        std::process::Command::new(program)
            .args(args)
            .output()
            .ok()
            .filter(|out| out.status.success())
            .and_then(|out| String::from_utf8(out.stdout).ok())
            .and_then(|text| clean_computer_name(&text))
    };
    #[cfg(target_os = "macos")]
    if let Some(name) = run("scutil", &["--get", "ComputerName"]) {
        return Some(name);
    }
    run("hostname", &[]).or_else(|| {
        std::env::var("COMPUTERNAME")
            .ok()
            .and_then(|name| clean_computer_name(&name))
    })
}

#[tauri::command]
pub async fn sync_computer_name() -> Option<String> {
    tauri::async_runtime::spawn_blocking(computer_name)
        .await
        .ok()
        .flatten()
}

#[cfg(test)]
mod computer_name_tests {
    use super::clean_computer_name;

    #[test]
    fn keeps_what_the_person_named_it() {
        assert_eq!(
            clean_computer_name("Daniel's MacBook Pro\n").as_deref(),
            Some("Daniel's MacBook Pro")
        );
    }

    #[test]
    fn drops_the_network_suffix() {
        assert_eq!(
            clean_computer_name("daniels-macbook.local").as_deref(),
            Some("daniels-macbook")
        );
    }

    #[test]
    fn has_no_name_when_there_is_nothing() {
        assert_eq!(clean_computer_name("  \n"), None);
        assert_eq!(clean_computer_name(".local"), None);
    }

    #[test]
    fn is_cut_to_a_readable_length() {
        assert_eq!(clean_computer_name(&"x".repeat(200)).unwrap().len(), 60);
    }
}
