//! `nookly cli calendars`: the outside calendars connected in the app (Google Calendar,
//! iCloud, Moodle) and the events the app has cached from them, read only. Connecting,
//! choosing which calendars show and syncing stay in the app, and the sign in secrets stay
//! in the keychain; nothing here reads or writes either.

use std::path::Path;

use chrono::NaiveDate;
use serde_json::{json, Value};

use super::Args;
use crate::error::{AppError, AppResult};
use crate::external_calendars::{self, Provider};

pub fn command(dir: &Path, argv: &[String]) -> AppResult<Value> {
    let Some(verb) = argv.first() else {
        return Ok(usage());
    };
    super::run_command(&argv[1..], |args| match verb.as_str() {
        "list" => list(dir),
        "events" => events(dir, args),
        other => Err(AppError::InvalidInput(format!(
            "unknown calendars command '{other}', expected list or events. Connecting a calendar, \
             choosing which ones show and syncing are done in the app, Settings, Calendar"
        ))),
    })
}

pub fn usage() -> Value {
    json!({
        "list": "nookly cli calendars list  (each connected account: provider, account, its calendars and which show, when it last synced and why that failed)",
        "events": "nookly cli calendars events --from <YYYY-MM-DD> --to <YYYY-MM-DD> [--provider <google|icloud|moodle>]  (cached events of the calendars that show, sorted by start)",
        "note": "Read only. Connecting, choosing calendars and syncing are done in the app; the sign in stays in the keychain and is never shown.",
    })
}

fn list(dir: &Path) -> AppResult<Value> {
    let items = external_calendars::cached_connections(dir);
    Ok(json!({ "count": items.len(), "items": items }))
}

fn date(args: &Args, name: &str) -> AppResult<String> {
    let raw = args.require_flag(name)?;
    NaiveDate::parse_from_str(&raw, "%Y-%m-%d")
        .map(|d| d.format("%Y-%m-%d").to_string())
        .map_err(|_| AppError::InvalidInput(format!("--{name} takes a date like 2026-11-15")))
}

fn events(dir: &Path, args: &Args) -> AppResult<Value> {
    let from = date(args, "from")?;
    let to = date(args, "to")?;
    if to < from {
        return Err(AppError::InvalidInput("--to comes before --from".into()));
    }
    let provider = args
        .flag("provider")
        .map(|p| {
            serde_json::from_value::<Provider>(Value::String(p.clone())).map_err(|_| {
                AppError::InvalidInput(format!(
                    "no provider '{p}', expected google, icloud or moodle"
                ))
            })
        })
        .transpose()?;
    let mut items: Vec<_> = external_calendars::cached_events_between(dir, &from, &to)
        .into_iter()
        .filter(|e| provider.is_none_or(|p| e.provider == p))
        .collect();
    items.sort_by(|a, b| a.start.cmp(&b.start).then_with(|| a.title.cmp(&b.title)));
    Ok(json!({ "from": from, "to": to, "count": items.len(), "items": items }))
}
