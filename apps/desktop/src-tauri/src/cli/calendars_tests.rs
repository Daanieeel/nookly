//! `nookly cli calendars`: the connected outside calendars and their cached events, read
//! only, and never a sign in secret.

use super::calendars::command;
use serde_json::Value;

fn folder() -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("nookly-cli-calendars-{}", crate::db::new_id()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn run(dir: &std::path::Path, argv: &[&str]) -> crate::error::AppResult<Value> {
    let argv: Vec<String> = argv.iter().map(|s| s.to_string()).collect();
    command(dir, &argv)
}

const STORE: &str = r##"{
  "connections": [
    {
      "provider": "google",
      "account": "me@example.com",
      "calendars": [
        { "id": "work", "name": "Work", "color": "#3b82f6", "selected": true },
        { "id": "birthdays", "name": "Birthdays", "color": null, "selected": false }
      ],
      "lastSyncedAt": "2026-11-15T08:00:00Z",
      "lastError": null
    },
    {
      "provider": "moodle",
      "account": "https://moodle.example.edu",
      "calendars": [{ "id": "course", "name": "Course dates", "color": null, "selected": true }],
      "lastSyncedAt": null,
      "lastError": "The site could not be reached"
    }
  ],
  "events": [
    { "id": "a", "provider": "google", "calendarId": "work", "calendarName": "Work", "color": "#3b82f6",
      "title": "Standup", "location": null, "allDay": false,
      "start": "2026-11-16T09:00:00Z", "end": "2026-11-16T09:15:00Z" },
    { "id": "b", "provider": "google", "calendarId": "birthdays", "calendarName": "Birthdays", "color": null,
      "title": "Hidden birthday", "location": null, "allDay": true,
      "start": "2026-11-16", "end": "2026-11-17" },
    { "id": "c", "provider": "moodle", "calendarId": "course", "calendarName": "Course dates", "color": null,
      "title": "Essay due", "location": null, "allDay": false,
      "start": "2026-11-20T23:59:00Z", "end": "2026-11-20T23:59:00Z" },
    { "id": "d", "provider": "google", "calendarId": "work", "calendarName": "Work", "color": "#3b82f6",
      "title": "Next month", "location": "Room 4", "allDay": false,
      "start": "2026-12-10T09:00:00Z", "end": "2026-12-10T10:00:00Z" }
  ]
}"##;

#[test]
fn lists_nothing_before_any_calendar_is_connected() {
    let dir = folder();
    let list = run(&dir, &["list"]).unwrap();
    assert_eq!(list["count"], 0);
    let events = run(
        &dir,
        &["events", "--from", "2026-11-01", "--to", "2026-11-30"],
    )
    .unwrap();
    assert_eq!(events["count"], 0);
    assert!(
        !dir.join("external-calendars.json").exists(),
        "reading writes nothing"
    );
}

#[test]
fn lists_each_connection_with_its_calendars_and_how_the_last_sync_went() {
    let dir = folder();
    std::fs::write(dir.join("external-calendars.json"), STORE).unwrap();
    let list = run(&dir, &["list"]).unwrap();
    assert_eq!(list["count"], 2);
    let google = &list["items"][0];
    assert_eq!(google["provider"], "google");
    assert_eq!(google["account"], "me@example.com");
    assert_eq!(google["calendars"][0]["selected"], true);
    assert_eq!(google["calendars"][1]["name"], "Birthdays");
    assert_eq!(
        list["items"][1]["lastError"],
        "The site could not be reached"
    );
}

#[test]
fn shows_the_events_of_shown_calendars_in_the_range_only() {
    let dir = folder();
    std::fs::write(dir.join("external-calendars.json"), STORE).unwrap();
    let before = std::fs::read_to_string(dir.join("external-calendars.json")).unwrap();
    let events = run(
        &dir,
        &["events", "--from", "2026-11-15", "--to", "2026-11-30"],
    )
    .unwrap();
    let titles: Vec<&str> = events["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["title"].as_str().unwrap())
        .collect();
    assert_eq!(
        titles,
        ["Standup", "Essay due"],
        "sorted by start, the hidden calendar left out"
    );
    let moodle = run(
        &dir,
        &[
            "events",
            "--from",
            "2026-11-15",
            "--to",
            "2026-11-30",
            "--provider",
            "moodle",
        ],
    )
    .unwrap();
    assert_eq!(moodle["count"], 1);
    assert_eq!(
        std::fs::read_to_string(dir.join("external-calendars.json")).unwrap(),
        before,
        "the cache is left as it was"
    );
}

#[test]
fn refuses_a_range_that_is_not_a_date_or_runs_backwards() {
    let dir = folder();
    assert!(run(&dir, &["events", "--from", "soon", "--to", "2026-11-30"]).is_err());
    assert!(run(
        &dir,
        &["events", "--from", "2026-11-30", "--to", "2026-11-01"]
    )
    .is_err());
    assert!(run(&dir, &["events", "--from", "2026-11-01"]).is_err());
    assert!(run(
        &dir,
        &[
            "events",
            "--from",
            "2026-11-01",
            "--to",
            "2026-11-02",
            "--provider",
            "outlook"
        ]
    )
    .is_err());
}

#[test]
fn has_no_way_to_connect_change_or_sync() {
    let dir = folder();
    for verb in ["connect", "disconnect", "select", "refresh"] {
        let error = run(&dir, &[verb]).unwrap_err().to_string();
        assert!(error.contains("in the app"), "{verb}: {error}");
    }
}
