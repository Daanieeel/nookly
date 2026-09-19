use crate::db::entities::Entity;
use crate::error::AppResult;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntity {
    pub entity: Entity,
    pub local_path: Option<String>,
    pub provider: Option<String>,
    pub url: Option<String>,
    pub original_filename: Option<String>,
}

fn row_to_file(row: &rusqlite::Row) -> rusqlite::Result<FileEntity> {
    Ok(FileEntity {
        entity: crate::db::entities::row_to_entity(row)?,
        local_path: row.get("local_path")?,
        provider: row.get("provider")?,
        url: row.get("url")?,
        original_filename: row.get("original_filename")?,
    })
}

/// Copies the source file into `<files_dir>/<uuid>-<original-filename>`, fully decoupled
/// from wherever the original lived on disk (§5.9) — portable and resilient to the
/// user later moving or deleting the source.
pub fn import_file(
    conn: &Connection,
    files_dir: &Path,
    space_id: String,
    source_path: &Path,
) -> AppResult<FileEntity> {
    let original_filename = source_path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "untitled".to_string());

    std::fs::create_dir_all(files_dir).map_err(|e| crate::error::AppError::Db(e.to_string()))?;
    let stored_name = format!("{}-{}", super::new_id(), original_filename);
    let dest_path = files_dir.join(&stored_name);
    std::fs::copy(source_path, &dest_path)
        .map_err(|e| crate::error::AppError::Db(e.to_string()))?;

    let entity = crate::db::entities::create_entity(
        conn,
        space_id,
        "file".into(),
        original_filename.clone(),
        None,
    )?;
    let local_path = dest_path.to_string_lossy().to_string();
    conn.execute(
        "INSERT INTO files (entity_id, local_path, provider, url, original_filename) VALUES (?1, ?2, NULL, NULL, ?3)",
        params![entity.id, local_path, original_filename],
    )?;
    Ok(FileEntity {
        entity,
        local_path: Some(local_path),
        provider: None,
        url: None,
        original_filename: Some(original_filename),
    })
}

/// Recognizes Google Drive / Dropbox / iCloud specifically, falling back to a
/// generic URL for anything else (§5.9).
pub fn detect_provider(url: &str) -> Option<&'static str> {
    if url.contains("drive.google.com") || url.contains("docs.google.com") {
        Some("google_drive")
    } else if url.contains("dropbox.com") {
        Some("dropbox")
    } else if url.contains("icloud.com") {
        Some("icloud")
    } else {
        None
    }
}

pub fn create_file_link(
    conn: &Connection,
    space_id: String,
    title: String,
    url: String,
) -> AppResult<FileEntity> {
    let provider = detect_provider(&url).map(|p| p.to_string());
    let entity = crate::db::entities::create_entity(conn, space_id, "file".into(), title, None)?;
    conn.execute(
        "INSERT INTO files (entity_id, local_path, provider, url, original_filename) VALUES (?1, NULL, ?2, ?3, NULL)",
        params![entity.id, provider, url],
    )?;
    Ok(FileEntity {
        entity,
        local_path: None,
        provider,
        url: Some(url),
        original_filename: None,
    })
}

pub fn list_files(conn: &Connection, space_id: &str) -> AppResult<Vec<FileEntity>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, f.local_path, f.provider, f.url, f.original_filename FROM entities e
         JOIN files f ON f.entity_id = e.id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY e.created_at ASC",
    )?;
    let rows = stmt.query_map(params![space_id], row_to_file)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_detection() {
        assert_eq!(
            detect_provider("https://drive.google.com/file/d/x"),
            Some("google_drive")
        );
        assert_eq!(
            detect_provider("https://www.dropbox.com/s/x"),
            Some("dropbox")
        );
        assert_eq!(detect_provider("https://example.com/doc"), None);
    }
}
