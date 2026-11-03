//! The report shown after Nookly closed unexpectedly. Nothing here leaves the device: the
//! panic hook (`lib.rs`) appends one record per panic to `crash.log`, and on the next launch
//! the newest record the person has not seen yet becomes a short report they can read, copy or
//! send themselves.
//!
//! A report holds the app version, the operating system and the panic message with its place
//! in the code. It never holds titles, note text or file names.

use crate::error::{AppError, AppResult};
use chrono::{DateTime, SecondsFormat, Utc};
use serde::Serialize;
use std::path::Path;

pub const CRASH_LOG: &str = "crash.log";

/// Holds when the newest crash the person has dealt with happened.
pub const SEEN_MARKER: &str = "crash-reported";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashReport {
    /// When it happened, as written in `crash.log`. Passed back to dismiss it.
    pub occurred_at: String,
    /// Unset for records written before versions were recorded.
    pub app_version: Option<String>,
    pub os: String,
    /// The panic message and where in the code it happened, on one line.
    pub message: String,
    /// The report as plain text, for copying.
    pub text: String,
}

/// One line for `crash.log`. A panic message can span lines; the record never does, so the
/// log stays one record per line.
pub fn record(at: DateTime<Utc>, version: &str, panic: &str) -> String {
    let flat = panic.split_whitespace().collect::<Vec<_>>().join(" ");
    format!(
        "[{}] v{version} panic: {flat}\n",
        at.to_rfc3339_opts(SecondsFormat::Millis, true)
    )
}

struct Record {
    at: DateTime<Utc>,
    at_text: String,
    version: Option<String>,
    message: String,
}

/// Reads the records of both formats: `[time] v1.2.3 panic: ...`, and the older
/// `[time] panic: ...` whose message may continue on the following lines.
fn parse(log: &str) -> Vec<Record> {
    let mut records: Vec<Record> = Vec::new();
    for line in log.lines() {
        let parsed = line.strip_prefix('[').and_then(|rest| {
            let (at_text, rest) = rest.split_once("] ")?;
            let at = DateTime::parse_from_rfc3339(at_text)
                .ok()?
                .with_timezone(&Utc);
            let (version, message) = match rest.strip_prefix('v') {
                Some(versioned) => {
                    let (version, message) = versioned.split_once(' ')?;
                    (Some(version.to_string()), message)
                }
                None => (None, rest),
            };
            let message = message.strip_prefix("panic: ")?;
            Some(Record {
                at,
                at_text: at_text.to_string(),
                version,
                message: message.to_string(),
            })
        });
        match parsed {
            Some(record) => records.push(record),
            // A continuation of the previous record's message.
            None => {
                if let Some(last) = records.last_mut() {
                    let extra = line.trim();
                    if !extra.is_empty() {
                        last.message.push(' ');
                        last.message.push_str(extra);
                    }
                }
            }
        }
    }
    records
}

fn seen_until(data_dir: &Path) -> Option<DateTime<Utc>> {
    let text = std::fs::read_to_string(data_dir.join(SEEN_MARKER)).ok()?;
    DateTime::parse_from_rfc3339(text.trim())
        .ok()
        .map(|at| at.with_timezone(&Utc))
}

fn build(record: Record) -> CrashReport {
    let version = record
        .version
        .clone()
        .unwrap_or_else(|| "unknown version".into());
    let os = std::env::consts::OS.to_string();
    let text = format!(
        "Nookly closed unexpectedly\nVersion: {version}\nSystem: {os}\nTime: {}\nDetails: {}",
        record.at_text, record.message
    );
    CrashReport {
        occurred_at: record.at_text,
        app_version: record.version,
        os,
        message: record.message,
        text,
    }
}

/// The newest crash in `crash.log` that has not been dismissed, if any.
pub fn latest_unseen(data_dir: &Path) -> Option<CrashReport> {
    let log = std::fs::read_to_string(data_dir.join(CRASH_LOG)).ok()?;
    let seen = seen_until(data_dir);
    parse(&log)
        .into_iter()
        .filter(|r| seen.is_none_or(|seen| r.at > seen))
        .max_by_key(|r| r.at)
        .map(build)
}

/// Remembers that every crash up to and including `occurred_at` was dealt with, so the report
/// does not come back. `crash.log` itself is left as it is.
pub fn dismiss(data_dir: &Path, occurred_at: &str) -> AppResult<()> {
    DateTime::parse_from_rfc3339(occurred_at)
        .map_err(|_| AppError::InvalidInput("not a crash time".into()))?;
    std::fs::create_dir_all(data_dir).map_err(|e| AppError::Io(e.to_string()))?;
    std::fs::write(data_dir.join(SEEN_MARKER), occurred_at).map_err(|e| AppError::Io(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("nookly-crash-{}", crate::db::new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn at(minute: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 11, 4, 10, minute, 0).unwrap()
    }

    #[test]
    fn a_record_is_one_line_even_when_the_panic_spans_several() {
        let line = record(
            at(5),
            "0.58.0",
            "panicked at src/db/x.rs:1:2:\nthe reason\n  more",
        );
        assert_eq!(line.matches('\n').count(), 1);
        assert!(line.starts_with("[2026-11-04T10:05:00.000Z] v0.58.0 panic: panicked at"));
        assert!(line.contains("the reason more"));
    }

    #[test]
    fn nothing_to_show_without_a_crash_log() {
        assert_eq!(latest_unseen(&dir()), None);
    }

    #[test]
    fn the_newest_crash_becomes_a_report_with_version_system_and_details() {
        let d = dir();
        let log =
            record(at(1), "0.57.0", "old") + &record(at(9), "0.58.0", "panicked at a.rs:3:4: boom");
        std::fs::write(d.join(CRASH_LOG), log).unwrap();
        let report = latest_unseen(&d).unwrap();
        assert_eq!(report.app_version.as_deref(), Some("0.58.0"));
        assert_eq!(report.message, "panicked at a.rs:3:4: boom");
        assert_eq!(report.os, std::env::consts::OS);
        assert!(report.text.contains("Version: 0.58.0"));
        assert!(report.text.contains("Details: panicked at a.rs:3:4: boom"));
    }

    #[test]
    fn the_report_holds_no_content_beyond_the_panic_itself() {
        let d = dir();
        std::fs::write(d.join(CRASH_LOG), record(at(1), "0.58.0", "x")).unwrap();
        let text = latest_unseen(&d).unwrap().text;
        assert_eq!(text.lines().count(), 5, "{text}");
    }

    #[test]
    fn records_from_before_versions_were_recorded_still_read_across_lines() {
        let d = dir();
        std::fs::write(
            d.join(CRASH_LOG),
            "[2026-10-01T08:00:00.123456789+00:00] panic: panicked at src/x.rs:1:1:\nold style\n",
        )
        .unwrap();
        let report = latest_unseen(&d).unwrap();
        assert_eq!(report.app_version, None);
        assert_eq!(report.message, "panicked at src/x.rs:1:1: old style");
        assert!(report.text.contains("unknown version"));
    }

    #[test]
    fn a_dismissed_crash_does_not_come_back_but_a_newer_one_does() {
        let d = dir();
        std::fs::write(d.join(CRASH_LOG), record(at(1), "0.58.0", "first")).unwrap();
        let first = latest_unseen(&d).unwrap();
        dismiss(&d, &first.occurred_at).unwrap();
        assert_eq!(latest_unseen(&d), None);
        let log = std::fs::read_to_string(d.join(CRASH_LOG)).unwrap();
        assert!(log.contains("first"), "dismissing never edits crash.log");
        std::fs::write(d.join(CRASH_LOG), log + &record(at(30), "0.58.0", "second")).unwrap();
        assert_eq!(latest_unseen(&d).unwrap().message, "second");
    }

    #[test]
    fn dismissing_refuses_anything_that_is_not_a_time() {
        let d = dir();
        assert!(dismiss(&d, "../../etc").is_err());
        assert!(!d.join(SEEN_MARKER).exists());
    }

    #[test]
    fn an_unreadable_marker_shows_the_report_instead_of_hiding_it() {
        let d = dir();
        std::fs::write(d.join(CRASH_LOG), record(at(1), "0.58.0", "x")).unwrap();
        std::fs::write(d.join(SEEN_MARKER), "garbage").unwrap();
        assert!(latest_unseen(&d).is_some());
    }
}
