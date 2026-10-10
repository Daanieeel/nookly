//! Moving an entity between Nookly instances as a JSON file.
//!
//! Each portable type has its own file format (`nookly-page`, `nookly-task`,
//! `nookly-deck`, `nookly-assignment`), each with a version and a `kind`, registered here
//! with a `PortableDef`. The registry drives everything that exports or imports: the
//! Tauri commands, the CLI's generic `export` and `import` verbs and `describe`. A type
//! that registers one gets all of them with no further code.
//!
//! What belongs to one instance never travels: ids, timestamps, labels, relationships,
//! the Space, scheduling and review state. A reference to another entity becomes plain
//! text. Import creates new entities, never changes an existing one, and lands whole or
//! not at all.

use crate::db::entities::Entity;
use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use serde::{de::DeserializeOwned, Serialize};

/// The largest file an import reads.
pub const MAX_IMPORT_BYTES: u64 = 20 * 1024 * 1024;

/// What an import would create, read from the file without touching the database. The
/// import dialog shows it so the user can check the file first.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PortablePreview {
    pub format: String,
    pub kind: String,
    pub title: String,
    /// Short facts about the item itself: status, dates, grade.
    pub facts: Vec<String>,
    /// How many `count_label`s the file holds (blocks, subtasks, cards).
    pub count: usize,
    pub count_label: String,
    pub items: Vec<PreviewItem>,
    /// Items of a kind this version does not know, which arrive as plain text.
    pub converted: usize,
    /// The type of entity the file has to be filed under, when it has to be (an
    /// assignment needs a course). The import is refused without one.
    pub parent_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PreviewItem {
    /// What the item is (a block type, a status, "Card").
    pub label: String,
    /// Its first line, cut to fit a list row.
    pub text: String,
    pub converted: bool,
}

const PREVIEW_LINE_CHARS: usize = 80;

/// The first line of some text that has one, cut to a length that fits a list row.
pub fn first_line(content: &str) -> String {
    let line = content
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("");
    match line.char_indices().nth(PREVIEW_LINE_CHARS) {
        Some((cut, _)) => format!("{}...", &line[..cut]),
        None => line.to_string(),
    }
}

/// One portable entity type. Registered next to the type, like its schema.
pub struct PortableDef {
    /// The entity type this exports. Notes and jots share a format, so two types can name
    /// the same one.
    pub entity_type: &'static str,
    /// The file format name, `nookly-task`.
    pub format: &'static str,
    pub version: u32,
    /// The entity type an import has to be filed under (`course`), if any.
    pub parent_type: Option<&'static str>,
    /// What a person calls the file, for messages (`task`).
    pub noun: &'static str,
    pub export: fn(&Connection, &str) -> AppResult<String>,
    pub preview: fn(&str) -> AppResult<PortablePreview>,
    pub import: Importer,
}

/// How a type creates its entity from a file. `portable::import` has already checked the
/// parent, so `Filed` always gets one.
pub enum Importer {
    /// Space and the file's text.
    Plain(fn(&Connection, &str, &str) -> AppResult<Entity>),
    /// Space, the parent's id and the file's text.
    Filed(fn(&Connection, &str, &str, &str) -> AppResult<Entity>),
}

inventory::collect!(PortableDef);

pub fn all() -> Vec<&'static PortableDef> {
    let mut defs: Vec<_> = inventory::iter::<PortableDef>().collect();
    defs.sort_by_key(|d| (d.format, d.entity_type));
    defs
}

pub fn for_type(entity_type: &str) -> Option<&'static PortableDef> {
    inventory::iter::<PortableDef>().find(|d| d.entity_type == entity_type)
}

pub fn for_format(format: &str) -> Option<&'static PortableDef> {
    inventory::iter::<PortableDef>().find(|d| d.format == format)
}

fn too_large() -> AppError {
    AppError::InvalidInput("this file is too large to import (the limit is 20 MB)".into())
}

/// Refuses a file over the size limit before anything reads it.
pub fn check_size(text: &str) -> AppResult<()> {
    if text.len() as u64 > MAX_IMPORT_BYTES {
        return Err(too_large());
    }
    Ok(())
}

/// The `format` a file says it has, before any type reads the rest. The message says
/// what is wrong when it is not a Nookly file at all.
pub fn format_of(text: &str) -> AppResult<String> {
    check_size(text)?;
    let value: serde_json::Value = serde_json::from_str(text)
        .map_err(|e| AppError::InvalidInput(format!("this is not a Nookly file ({e})")))?;
    let format = value
        .get("format")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| {
            AppError::InvalidInput("this is not a Nookly file (it has no format)".into())
        })?;
    Ok(format.to_string())
}

fn def_for_text(text: &str) -> AppResult<&'static PortableDef> {
    let format = format_of(text)?;
    for_format(&format).ok_or_else(|| {
        let known: Vec<&str> = all().iter().map(|d| d.format).collect();
        AppError::InvalidInput(format!(
            "this is not a file Nookly can import (format \"{format}\"). It reads {}",
            known.join(", ")
        ))
    })
}

/// Reads a document of one format: size, JSON, then `format`, `version`, then every field
/// strictly (an unknown or missing one is an error, so a typo never imports half a file).
pub fn parse_document<T: DeserializeOwned>(
    text: &str,
    format: &str,
    version: u32,
    noun: &str,
) -> AppResult<T> {
    check_size(text)?;
    let value: serde_json::Value = serde_json::from_str(text)
        .map_err(|e| AppError::InvalidInput(format!("this is not a Nookly {noun} file ({e})")))?;
    let found = value.get("format").and_then(serde_json::Value::as_str);
    if found != Some(format) {
        return Err(AppError::InvalidInput(format!(
            "this is not a Nookly {noun} file (format \"{}\")",
            found.unwrap_or("none")
        )));
    }
    let file_version = value.get("version").and_then(serde_json::Value::as_u64);
    if file_version != Some(u64::from(version)) {
        return Err(AppError::InvalidInput(format!(
            "this {noun} file is version {}, and this version of Nookly reads version {version}",
            file_version.map_or_else(|| "unknown".into(), |v| v.to_string())
        )));
    }
    serde_json::from_value(value)
        .map_err(|e| AppError::InvalidInput(format!("this {noun} file is not valid ({e})")))
}

/// A day written `YYYY-MM-DD`, as every date field of a file must be.
pub fn check_date(field: &str, value: &str) -> AppResult<()> {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map(|_| ())
        .map_err(|_| {
            AppError::InvalidInput(format!(
                "{field} must be a date like 2026-03-10, got \"{value}\""
            ))
        })
}

/// The entity as a file of its type's format.
pub fn export_entity(conn: &Connection, entity_id: &str) -> AppResult<String> {
    let entity = crate::db::entities::get_entity(conn, entity_id)?;
    let def = for_type(&entity.entity_type).ok_or_else(|| {
        let known: Vec<&str> = all().iter().map(|d| d.entity_type).collect();
        AppError::InvalidInput(format!(
            "a {} cannot be exported as a file. Types that can: {}",
            entity.entity_type,
            known.join(", ")
        ))
    })?;
    (def.export)(conn, entity_id)
}

/// What importing the file would create, read without touching the database.
pub fn preview(text: &str) -> AppResult<PortablePreview> {
    (def_for_text(text)?.preview)(text)
}

/// Creates a new entity in `space_id` from a file. A type that has to be filed under a
/// parent (an assignment under a course) refuses the file without one, and a parent of
/// the wrong type or in another Space is refused too. All or nothing.
pub fn import(
    conn: &Connection,
    space_id: &str,
    parent_id: Option<&str>,
    text: &str,
) -> AppResult<Entity> {
    let def = def_for_text(text)?;
    crate::db::atomically(conn, || {
        if let Some(parent_type) = def.parent_type {
            let parent_id = parent_id.ok_or_else(|| {
                AppError::InvalidInput(format!(
                    "a {} file has to be filed under a {parent_type}: pass one",
                    def.noun
                ))
            })?;
            let parent = crate::db::entities::get_entity(conn, parent_id)?;
            if parent.entity_type != parent_type {
                return Err(AppError::InvalidInput(format!(
                    "a {} has to be filed under a {parent_type}, not a {}",
                    def.noun, parent.entity_type
                )));
            }
            if parent.space_id != space_id {
                return Err(AppError::InvalidInput(format!(
                    "the {parent_type} is in another Space than the one the {} goes into",
                    def.noun
                )));
            }
        }
        match (&def.import, parent_id) {
            (Importer::Plain(import), _) => import(conn, space_id, text),
            (Importer::Filed(import), Some(parent)) => import(conn, space_id, parent, text),
            (Importer::Filed(_), None) => Err(AppError::InvalidInput(format!(
                "a {} file has to be filed under a parent: pass one",
                def.noun
            ))),
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_line_skips_blank_lines_and_cuts_a_long_one() {
        assert_eq!(first_line("\n  hello \nworld"), "hello");
        assert_eq!(first_line(""), "");
        let long = "x".repeat(200);
        assert_eq!(first_line(&long).chars().count(), PREVIEW_LINE_CHARS + 3);
    }

    #[test]
    fn a_file_names_its_format_and_anything_else_is_refused_clearly() {
        assert_eq!(
            format_of(r#"{"format":"nookly-task"}"#).unwrap(),
            "nookly-task"
        );
        for bad in ["{ nope", "[]", r#"{"title":"x"}"#, r#"{"format":3}"#] {
            let err = format_of(bad).unwrap_err();
            assert!(matches!(err, AppError::InvalidInput(_)), "{bad}");
        }
        let err = preview(r#"{"format":"something-else"}"#).unwrap_err();
        assert!(err.to_string().contains("something-else"));
    }

    #[test]
    fn a_file_over_the_limit_is_refused_before_it_is_read() {
        let huge = format!(
            r#"{{"format":"nookly-task","pad":"{}"}}"#,
            "x".repeat(21 * 1024 * 1024)
        );
        assert!(matches!(format_of(&huge), Err(AppError::InvalidInput(_))));
        assert!(check_size(&huge).is_err());
    }

    #[test]
    fn dates_must_be_whole_days() {
        assert!(check_date("dueDate", "2026-03-10").is_ok());
        for bad in [
            "",
            "10-03-2026",
            "2026-13-01",
            "2026-03-10T09:00",
            "tomorrow",
        ] {
            assert!(check_date("dueDate", bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn the_registry_lists_each_format_once_per_type() {
        let defs = all();
        let formats: Vec<&str> = defs.iter().map(|d| d.format).collect();
        for expected in [
            "nookly-assignment",
            "nookly-deck",
            "nookly-page",
            "nookly-task",
        ] {
            assert!(formats.contains(&expected), "{expected} is not registered");
        }
        let mut types: Vec<&str> = defs.iter().map(|d| d.entity_type).collect();
        types.sort_unstable();
        let before = types.len();
        types.dedup();
        assert_eq!(types.len(), before, "a type is registered twice");
        assert!(for_type("note").is_some() && for_type("file").is_none());
    }
}
