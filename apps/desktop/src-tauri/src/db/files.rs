use crate::db::entities::Entity;
use crate::db::schema::{CreateInput, EntitySchemaDef, FieldDef, FieldKind, JsonMap};
use crate::error::{AppError, AppResult};
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
    /// Where a referenced file lives on disk, outside Nookly's storage. Set with
    /// no `local_path` until the file is copied in.
    pub source_path: Option<String>,
    /// Read only. True for a File of an indexable type (pdf, png/jpg, docx,
    /// pptx, xlsx — see `extractor_for`) that has no search content yet: never
    /// indexed (imported before this File type became indexable), or the last
    /// attempt found nothing. Powers the Files page's "Reindex" action and the
    /// `reindex` bulk action/CLI verb, both a backfill for the gap rather than
    /// something that fires on every write.
    pub needs_reindex: bool,
    /// Attached Label ids, ordered by label name.
    pub label_ids: Vec<String>,
}

fn row_to_file(row: &rusqlite::Row) -> rusqlite::Result<FileEntity> {
    let local_path: Option<String> = row.get("local_path")?;
    let source_path: Option<String> = row.get("source_path")?;
    let has_indexed_content: bool = row.get("has_indexed_content")?;
    let needs_reindex = !has_indexed_content
        && local_path
            .as_deref()
            .or(source_path.as_deref())
            .is_some_and(is_indexable);
    Ok(FileEntity {
        entity: crate::db::entities::row_to_entity(row)?,
        local_path,
        provider: row.get("provider")?,
        url: row.get("url")?,
        original_filename: row.get("original_filename")?,
        source_path,
        needs_reindex,
        label_ids: Vec::new(),
    })
}

fn label_ids_for(conn: &Connection, entity_id: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT el.label_id FROM entity_labels el
         JOIN labels l ON l.id = el.label_id
         WHERE el.entity_id = ?1
         ORDER BY l.name ASC",
    )?;
    let rows = stmt.query_map(params![entity_id], |row| row.get(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
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
    let bytes = std::fs::read(source_path).map_err(|e| AppError::Io(e.to_string()))?;
    store_file(conn, files_dir, space_id, &original_filename, &bytes, None)
}

/// Writes `bytes` into storage as a new File. `source_url` is where a downloaded
/// file came from, kept for "Open Link" and provider tags.
pub fn store_file(
    conn: &Connection,
    files_dir: &Path,
    space_id: String,
    filename: &str,
    bytes: &[u8],
    source_url: Option<&str>,
) -> AppResult<FileEntity> {
    let local_path = write_stored(files_dir, filename, bytes)?;
    let provider = source_url.and_then(detect_provider).map(str::to_string);
    let entity =
        crate::db::entities::create_entity(conn, space_id, "file".into(), filename.into(), None)?;
    conn.execute(
        "INSERT INTO files (entity_id, local_path, provider, url, original_filename) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![entity.id, local_path, provider, source_url, filename],
    )?;
    index_file_content(conn, &entity.id, &local_path);
    get_file(conn, &entity.id)
}

/// The extractor a path's extension routes to — the single source of truth
/// `index_file_content` dispatches on and `is_indexable`/`needs_reindex`
/// check membership against, so the two can never drift apart.
enum Extractor {
    Pdf,
    Image,
    Office,
}

fn extractor_for(path: &str) -> Option<Extractor> {
    let ext = Path::new(path).extension()?.to_str()?.to_ascii_lowercase();
    Some(match ext.as_str() {
        "pdf" => Extractor::Pdf,
        "png" | "jpg" | "jpeg" => Extractor::Image,
        "docx" | "pptx" | "xlsx" => Extractor::Office,
        _ => return None,
    })
}

/// Whether `path`'s extension is one `index_file_content` knows how to
/// extract from — a reference-only File whose path has moved, or a type like
/// video/audio/plain-text with nothing to extract, is never "missing an index".
fn is_indexable(path: &str) -> bool {
    extractor_for(path).is_some()
}

/// Best-effort content extraction into the search index (Cmd+K, §"File
/// Indexing & OCR for Search"): a File's own content becomes keyword
/// searchable, not just its file name. Silently skipped for anything not
/// handled below, or if extraction fails — the File entity itself is
/// unaffected either way. PDFs and images route through OCR when needed
/// (`db::ocr`); Office documents through native XML text (`db::office_text`).
/// Returns whether text was actually found and indexed.
fn index_file_content(conn: &Connection, entity_id: &str, path: &str) -> bool {
    let path_ref = Path::new(path);
    let text = match extractor_for(path) {
        Some(Extractor::Pdf) => super::ocr::extract_pdf_text(path_ref),
        Some(Extractor::Image) => super::ocr::extract_image_text(path_ref),
        Some(Extractor::Office) => super::office_text::extract_office_text(path_ref),
        None => None,
    };
    match text {
        Some(text) => crate::db::search::index_entity_content(conn, entity_id, &text).is_ok(),
        None => false,
    }
}

fn write_stored(files_dir: &Path, filename: &str, bytes: &[u8]) -> AppResult<String> {
    std::fs::create_dir_all(files_dir).map_err(|e| AppError::Io(e.to_string()))?;
    let dest_path = files_dir.join(format!("{}-{}", super::new_id(), filename));
    std::fs::write(&dest_path, bytes).map_err(|e| AppError::Io(e.to_string()))?;
    Ok(dest_path.to_string_lossy().to_string())
}

/// Gives a link-only File (from before links were downloaded) its own copy.
pub fn attach_download(
    conn: &Connection,
    files_dir: &Path,
    entity_id: &str,
    filename: &str,
    bytes: &[u8],
) -> AppResult<FileEntity> {
    let local_path = write_stored(files_dir, filename, bytes)?;
    conn.execute(
        "UPDATE files SET local_path = ?1, original_filename = ?2 WHERE entity_id = ?3",
        params![local_path, filename, entity_id],
    )?;
    index_file_content(conn, entity_id, &local_path);
    get_file(conn, entity_id)
}

/// Adds a file where it lives on disk, without copying it: it stays in sync with
/// edits made elsewhere, and breaks if the original is moved or deleted.
/// `copy_into_storage` makes it independent.
pub fn reference_file(conn: &Connection, space_id: String, path: &Path) -> AppResult<FileEntity> {
    if !path.is_file() {
        return Err(AppError::InvalidInput(format!(
            "no file at {}",
            path.display()
        )));
    }
    let filename = path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "untitled".to_string());
    let entity =
        crate::db::entities::create_entity(conn, space_id, "file".into(), filename.clone(), None)?;
    conn.execute(
        "INSERT INTO files (entity_id, local_path, provider, url, original_filename, source_path)
         VALUES (?1, NULL, NULL, NULL, ?2, ?3)",
        params![entity.id, filename, path.to_string_lossy()],
    )?;
    index_file_content(conn, &entity.id, &path.to_string_lossy());
    get_file(conn, &entity.id)
}

/// Copies a referenced file into storage; the entity stays the same and remembers
/// where the original was.
pub fn copy_into_storage(
    conn: &Connection,
    files_dir: &Path,
    entity_id: &str,
) -> AppResult<FileEntity> {
    let file = get_file(conn, entity_id)?;
    if file.local_path.is_some() {
        return Ok(file);
    }
    let source = file.source_path.ok_or_else(|| {
        AppError::InvalidInput("this file isn't a reference to a file on disk".into())
    })?;
    let bytes =
        std::fs::read(&source).map_err(|e| AppError::Io(format!("couldn't read {source}: {e}")))?;
    let filename = file.original_filename.unwrap_or_else(|| "untitled".into());
    attach_download(conn, files_dir, entity_id, &filename, &bytes)
}

/// Swaps a File's stored copy for a newer one, keeping the entity (id, key,
/// labels, relationships). A title that was still the old file name follows the
/// new one. Returns the file and the path of the replaced copy, which the caller
/// removes once the change is committed: there is no version history.
pub fn replace_file(
    conn: &Connection,
    files_dir: &Path,
    entity_id: &str,
    source_path: &Path,
) -> AppResult<(FileEntity, Option<String>)> {
    let current = get_file(conn, entity_id)?;
    let filename = source_path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "untitled".to_string());
    let bytes = std::fs::read(source_path).map_err(|e| AppError::Io(e.to_string()))?;
    let local_path = write_stored(files_dir, &filename, &bytes)?;
    conn.execute(
        "UPDATE files SET local_path = ?1, original_filename = ?2 WHERE entity_id = ?3",
        params![local_path, filename, entity_id],
    )?;
    index_file_content(conn, entity_id, &local_path);
    let title_was_name =
        current.original_filename.as_deref() == Some(current.entity.title.as_str());
    crate::db::entities::update_entity(
        conn,
        entity_id,
        crate::db::entities::EntityPatch {
            title: title_was_name.then(|| filename.clone()),
            ..Default::default()
        },
    )?;
    Ok((get_file(conn, entity_id)?, current.local_path))
}

/// What a link turned out to be once fetched.
pub enum Download {
    File {
        filename: String,
        bytes: Vec<u8>,
    },
    /// An HTML page (or a sign in wall in front of the file): a Bookmark, not a File.
    Webpage,
}

/// Larger downloads are almost certainly not what someone pasting a link meant.
const MAX_DOWNLOAD_BYTES: u64 = 500 * 1024 * 1024;

/// Fetches a link as a file. Cloud share links are rewritten to their direct
/// download form first; public Google Docs, Sheets and Slides come as PDF.
/// Blocking: call off the async runtime.
pub fn download(url: &str) -> AppResult<Download> {
    let direct = direct_download_url(url);
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Nookly")
        .build()
        .map_err(|e| AppError::Io(e.to_string()))?;
    let response = client
        .get(&direct)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| AppError::Io(format!("couldn't download the file: {e}")))?;
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|v| {
            v.split(';')
                .next()
                .unwrap_or("")
                .trim()
                .to_ascii_lowercase()
        })
        .unwrap_or_default();
    if content_type == "text/html" || content_type == "application/xhtml+xml" {
        return Ok(Download::Webpage);
    }
    if response
        .content_length()
        .is_some_and(|len| len > MAX_DOWNLOAD_BYTES)
    {
        return Err(AppError::InvalidInput(
            "the file is larger than 500 MB".into(),
        ));
    }
    let disposition = response
        .headers()
        .get(reqwest::header::CONTENT_DISPOSITION)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let final_url = response.url().to_string();
    let bytes = response
        .bytes()
        .map_err(|e| AppError::Io(format!("couldn't download the file: {e}")))?
        .to_vec();
    let filename = with_extension(
        disposition
            .as_deref()
            .and_then(filename_from_disposition)
            .or_else(|| filename_from_url(&final_url))
            .or_else(|| filename_from_url(url))
            .unwrap_or_else(|| "download".into()),
        &content_type,
    );
    Ok(Download::File { filename, bytes })
}

/// Share links point at a viewer page; these are the file behind it.
fn direct_download_url(url: &str) -> String {
    static DRIVE_FILE: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r"drive\.google\.com/(?:file/d/|open\?id=)([\w-]+)").unwrap()
    });
    static DOCS: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r"docs\.google\.com/(document|spreadsheets|presentation)/d/([\w-]+)")
            .unwrap()
    });
    if let Some(c) = DRIVE_FILE.captures(url) {
        return format!("https://drive.google.com/uc?export=download&id={}", &c[1]);
    }
    if let Some(c) = DOCS.captures(url) {
        let kind = &c[1];
        let id = &c[2];
        return match kind {
            "presentation" => format!("https://docs.google.com/presentation/d/{id}/export/pdf"),
            _ => format!("https://docs.google.com/{kind}/d/{id}/export?format=pdf"),
        };
    }
    if url.contains("dropbox.com") {
        if let Ok(mut parsed) = url::Url::parse(url) {
            let pairs: Vec<(String, String)> = parsed
                .query_pairs()
                .filter(|(k, _)| k != "dl" && k != "raw")
                .map(|(k, v)| (k.into_owned(), v.into_owned()))
                .collect();
            parsed
                .query_pairs_mut()
                .clear()
                .extend_pairs(pairs)
                .append_pair("dl", "1");
            return parsed.to_string();
        }
    }
    url.to_string()
}

fn filename_from_disposition(header: &str) -> Option<String> {
    static EXTENDED: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r#"(?i)filename\*\s*=\s*[^']*'[^']*'([^;]+)"#).unwrap()
    });
    static PLAIN: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r#"(?i)filename\s*=\s*"?([^";]+)"?"#).unwrap()
    });
    let name = if let Some(c) = EXTENDED.captures(header) {
        percent_decode(c[1].trim())
    } else {
        PLAIN.captures(header)?[1].trim().to_string()
    };
    sanitize(&name)
}

fn filename_from_url(url: &str) -> Option<String> {
    let parsed = url::Url::parse(url).ok()?;
    let last = parsed.path_segments()?.rfind(|s| !s.is_empty())?;
    sanitize(&percent_decode(last))
}

fn percent_decode(s: &str) -> String {
    url::form_urlencoded::parse(format!("x={s}").as_bytes())
        .next()
        .map(|(_, v)| v.into_owned())
        .unwrap_or_else(|| s.to_string())
}

/// Just a file name: no folders, nothing hidden, nothing empty.
fn sanitize(name: &str) -> Option<String> {
    let name = name
        .rsplit(['/', '\\'])
        .next()?
        .trim()
        .trim_start_matches('.');
    (!name.is_empty()).then(|| name.to_string())
}

/// Adds the extension the content type implies when the name has none, so the
/// file viewer knows what it's looking at.
fn with_extension(name: String, content_type: &str) -> String {
    if Path::new(&name).extension().is_some() {
        return name;
    }
    let ext = match content_type {
        "application/pdf" => "pdf",
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/svg+xml" => "svg",
        "video/mp4" => "mp4",
        "video/quicktime" => "mov",
        "audio/mpeg" => "mp3",
        "audio/wav" | "audio/x-wav" => "wav",
        "text/plain" => "txt",
        "text/csv" => "csv",
        "text/markdown" => "md",
        "application/json" => "json",
        "application/zip" => "zip",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => "docx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => "xlsx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" => "pptx",
        _ => return name,
    };
    format!("{name}.{ext}")
}

/// A File that is really a webpage becomes a Bookmark of its source URL. A
/// downloaded copy stays on disk: nothing is ever hard deleted, and `--dry-run`
/// only rolls back the database.
fn convert_file_to_bookmark(conn: &Connection, id: &str) -> AppResult<()> {
    let file = get_file(conn, id)?;
    let url = file.url.ok_or_else(|| {
        AppError::InvalidInput("only a File that came from a link can become a Bookmark".into())
    })?;
    crate::db::schema::retype_entity(conn, id, "bookmark")?;
    conn.execute("DELETE FROM files WHERE entity_id = ?1", params![id])?;
    conn.execute(
        "INSERT INTO bookmarks (entity_id, url) VALUES (?1, ?2)",
        params![id, url],
    )?;
    Ok(())
}

inventory::submit! {
    crate::db::schema::ConversionDef {
        from: "file",
        to: "bookmark",
        description: "A File that came from a link and is really a webpage. Keeps id, relationships, labels and pin; gets a BMK key.",
        run: convert_file_to_bookmark,
    }
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

/// `f.*` columns plus whether the entity already has non-empty search content
/// (a Note/Bookmark-style `LEFT JOIN`, since a File with none yet has no
/// guarantee of a matching row's content being set — `search_index` itself is
/// always populated at creation via `index_entity_title`, just with `content = ''`).
const FILE_SELECT: &str =
    "SELECT e.*, f.local_path, f.provider, f.url, f.original_filename, f.source_path, \
     COALESCE(si.content, '') != '' AS has_indexed_content \
     FROM entities e \
     JOIN files f ON f.entity_id = e.id \
     LEFT JOIN search_index si ON si.entity_id = e.id";

pub fn list_files(conn: &Connection, space_id: &str) -> AppResult<Vec<FileEntity>> {
    let mut stmt = conn.prepare(&format!(
        "{FILE_SELECT} WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY e.created_at ASC"
    ))?;
    let rows = stmt.query_map(params![space_id], row_to_file)?;
    let mut files = rows.collect::<Result<Vec<_>, _>>()?;

    let index: std::collections::HashMap<String, usize> = files
        .iter()
        .enumerate()
        .map(|(i, f): (usize, &FileEntity)| (f.entity.id.clone(), i))
        .collect();
    let mut stmt = conn.prepare(
        "SELECT el.entity_id, el.label_id FROM entity_labels el
         JOIN entities e ON e.id = el.entity_id
         JOIN labels l ON l.id = el.label_id
         WHERE e.space_id = ?1 AND e.type = 'file' AND e.deleted_at IS NULL
         ORDER BY l.name ASC",
    )?;
    let mut rows = stmt.query(params![space_id])?;
    while let Some(row) = rows.next()? {
        let entity_id: String = row.get(0)?;
        if let Some(&i) = index.get(&entity_id) {
            files[i].label_ids.push(row.get(1)?);
        }
    }
    Ok(files)
}

pub fn get_file(conn: &Connection, entity_id: &str) -> AppResult<FileEntity> {
    let mut file = conn
        .query_row(
            &format!("{FILE_SELECT} WHERE e.id = ?1"),
            params![entity_id],
            row_to_file,
        )
        .map_err(|_| AppError::NotFound(format!("file {entity_id}")))?;
    file.label_ids = label_ids_for(conn, entity_id)?;
    Ok(file)
}

/// Every File missing search content whose type `index_file_content` knows
/// how to extract from, scoped to one Space or (`None`) every Space — the
/// candidates for `reindex_missing` and for the Files page's "Reindex" button.
pub fn files_needing_reindex(
    conn: &Connection,
    space_id: Option<&str>,
) -> AppResult<Vec<FileEntity>> {
    let mut stmt = conn.prepare(&format!(
        "{FILE_SELECT} WHERE e.deleted_at IS NULL AND (?1 IS NULL OR e.space_id = ?1) \
         ORDER BY e.created_at ASC"
    ))?;
    let rows = stmt.query_map(params![space_id], row_to_file)?;
    let files: Vec<FileEntity> = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(files.into_iter().filter(|f| f.needs_reindex).collect())
}

/// Re-runs content extraction for one File regardless of whether it already
/// has indexed content — e.g. to retry after fixing an extractor bug, not
/// just to backfill a gap. A no-op for a File with no local bytes to read yet
/// (link-only, or a reference whose source has moved).
pub fn reindex_file(conn: &Connection, entity_id: &str) -> AppResult<FileEntity> {
    let file = get_file(conn, entity_id)?;
    if let Some(path) = file.local_path.as_deref().or(file.source_path.as_deref()) {
        index_file_content(conn, entity_id, path);
    }
    get_file(conn, entity_id)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReindexSummary {
    /// Files found missing an index and attempted.
    pub checked: u32,
    /// Of those, how many now have search content — the rest found nothing
    /// to extract (e.g. a blank image) and are tried again on the next pass.
    pub reindexed: u32,
}

/// The backfill for Files that predate this File type becoming indexable, or
/// predate OCR/office-text extraction existing at all (§"File Indexing & OCR
/// for Search"): every File missing search content gets one extraction pass.
/// Scoped to one Space when given, every Space otherwise.
pub fn reindex_missing(conn: &Connection, space_id: Option<&str>) -> AppResult<ReindexSummary> {
    let candidates = files_needing_reindex(conn, space_id)?;
    let mut reindexed = 0u32;
    for file in &candidates {
        let Some(path) = file.local_path.as_deref().or(file.source_path.as_deref()) else {
            continue;
        };
        if index_file_content(conn, &file.entity.id, path) {
            reindexed += 1;
        }
    }
    Ok(ReindexSummary {
        checked: candidates.len() as u32,
        reindexed,
    })
}

fn reindex_missing_bulk_action(
    conn: &Connection,
    space_id: Option<&str>,
) -> AppResult<serde_json::Value> {
    Ok(serde_json::to_value(reindex_missing(conn, space_id)?)
        .expect("ReindexSummary always serializes"))
}

inventory::submit! {
    crate::db::schema::BulkActionDef {
        entity_type: "file",
        name: "reindex",
        description: "Runs content extraction for every File missing search content \
                      (never indexed, or an earlier attempt found nothing) — the backfill for \
                      Files imported before this File type became indexable. Safe to run \
                      repeatedly; an already-indexed File is left untouched.",
        run: reindex_missing_bulk_action,
    }
}

/// Corrects when a File was added. This replaces `entity.created_at` itself
/// (rather than layering a second, divergent date on top), so every date the
/// user sees for the file — the detail view, the list and grid, sort and group
/// order — agrees that it was really added on `day` (`YYYY-MM-DD`).
pub fn set_added_at(conn: &Connection, entity_id: &str, day: &str) -> AppResult<FileEntity> {
    let created_at = format!("{day}T00:00:00+00:00");
    let affected = conn.execute(
        "UPDATE entities SET created_at = ?1, updated_at = ?2 WHERE id = ?3 AND type = 'file'",
        params![created_at, super::now(), entity_id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("file {entity_id}")));
    }
    get_file(conn, entity_id)
}

// --- CLI schema registration (PLAN.md §1/§3) -------------------------------

const FILE_FIELDS: &[FieldDef] = &[
    FieldDef {
        name: "localPath",
        kind: FieldKind::Text,
        required_on_create: false,
        writable_on_update: true,
        description:
            "Path to a local file to copy in and attach. Exactly one of localPath/url is required on create. \
             On update it replaces the stored copy with a newer version (same entity, labels and relationships; \
             the previous copy stays on disk).",
    },
    FieldDef {
        name: "sourcePath",
        kind: FieldKind::Text,
        required_on_create: false,
        writable_on_update: false,
        description: "Path to a local file to reference where it is, without copying it. It follows \
                      edits to the original but breaks if that is moved; set copyIntoStorage=true to copy it in.",
    },
    FieldDef {
        name: "copyIntoStorage",
        kind: FieldKind::Boolean,
        required_on_create: false,
        writable_on_update: true,
        description: "Update only: true copies a referenced file (sourcePath) into Nookly's own storage.",
    },
    FieldDef {
        name: "url",
        kind: FieldKind::Text,
        required_on_create: false,
        writable_on_update: false,
        description:
            "URL of a file to download and store, e.g. a PDF or a Google Drive, Dropbox or iCloud share \
                      link (the provider is detected). A URL that is a webpage is refused: make it a bookmark instead. \
                      Exactly one of localPath/url is required.",
    },
    FieldDef {
        name: "added",
        kind: FieldKind::Date,
        required_on_create: false,
        writable_on_update: true,
        description: "When the file was added. Defaults to the day it was imported or \
                      downloaded; editable to correct it, e.g. for files brought in from another tool. \
                      Replaces the file's created date outright, so the detail view, lists and sort/group \
                      order all agree on it.",
    },
    FieldDef {
        name: "reindexContent",
        kind: FieldKind::Boolean,
        required_on_create: false,
        writable_on_update: true,
        description: "Update only: true re-runs content extraction for this File, even if it \
                      already has search content. For every File missing an index at once, use the \
                      `reindex` bulk action instead: nookly cli file reindex [--space <space-id>].",
    },
];

fn cli_create_file(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    let local_path = crate::db::schema::field_str(&input.fields, "localPath");
    let url = crate::db::schema::field_str(&input.fields, "url");
    if let Some(path) = crate::db::schema::field_str(&input.fields, "sourcePath") {
        if local_path.is_some() || url.is_some() {
            return Err(AppError::InvalidInput(
                "pass exactly one of --field localPath=..., sourcePath=... or url=...".into(),
            ));
        }
        let file = reference_file(conn, input.space_id, Path::new(&path))?;
        return Ok(serde_json::to_value(file).expect("FileEntity always serializes"));
    }
    let file = match (local_path, url) {
        (Some(path), None) => {
            let files_dir = crate::db::standalone_app_data_dir()
                .map_err(|e| AppError::Db(e.to_string()))?
                .join("files");
            import_file(conn, &files_dir, input.space_id, Path::new(&path))?
        }
        (None, Some(url)) => match download(&url)? {
            Download::File { filename, bytes } => {
                let files_dir = crate::db::standalone_app_data_dir()
                    .map_err(|e| AppError::Db(e.to_string()))?
                    .join("files");
                store_file(
                    conn,
                    &files_dir,
                    input.space_id,
                    &filename,
                    &bytes,
                    Some(&url),
                )?
            }
            Download::Webpage => {
                return Err(AppError::InvalidInput(format!(
                    "{url} is a webpage, not a file; save it as a bookmark: \
                     nookly cli bookmark create --space <id> --field url={url}"
                )))
            }
        },
        (Some(_), Some(_)) => {
            return Err(AppError::InvalidInput(
                "pass exactly one of --field localPath=... or --field url=..., not both".into(),
            ))
        }
        (None, None) => {
            return Err(AppError::InvalidInput(
                "one of --field localPath=... or --field url=... is required".into(),
            ))
        }
    };
    Ok(serde_json::to_value(file).expect("FileEntity always serializes"))
}

fn cli_update_file(conn: &Connection, id: &str, fields: &JsonMap) -> AppResult<serde_json::Value> {
    if let Some(path) = crate::db::schema::field_str(fields, "localPath") {
        let files_dir = crate::db::standalone_app_data_dir()
            .map_err(|e| AppError::Db(e.to_string()))?
            .join("files");
        // The old copy stays: `--dry-run` rolls back only the database.
        replace_file(conn, &files_dir, id, Path::new(&path))?;
    }
    if crate::db::schema::field_bool(fields, "copyIntoStorage") == Some(true) {
        let files_dir = crate::db::standalone_app_data_dir()
            .map_err(|e| AppError::Db(e.to_string()))?
            .join("files");
        copy_into_storage(conn, &files_dir, id)?;
    }
    if let Some(added) = crate::db::schema::field_str(fields, "added") {
        set_added_at(conn, id, &added)?;
    }
    if crate::db::schema::field_bool(fields, "reindexContent") == Some(true) {
        reindex_file(conn, id)?;
    }
    cli_get_file(conn, id)
}

fn cli_get_file(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    Ok(serde_json::to_value(get_file(conn, id)?).expect("FileEntity always serializes"))
}

fn cli_list_files(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id
        .ok_or_else(|| AppError::InvalidInput("file list requires --space <space-id>".into()))?;
    Ok(list_files(conn, space_id)?
        .into_iter()
        .map(|f| serde_json::to_value(f).expect("FileEntity always serializes"))
        .collect())
}

inventory::submit! {
    crate::db::schema::ComputedFieldDef {
        entity_type: "file",
        name: "needsReindex",
        kind: FieldKind::Boolean,
        description: "Read only. True for an indexable File (pdf, png/jpg, docx, pptx, xlsx) with no \
                      search content yet — never indexed, or the last attempt found nothing. \
                      See the `reindex` bulk action.",
    }
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "file",
        supports_blocks: false,
        description: "A file stored in Nookly: imported from disk or downloaded from a link.",
        fields: FILE_FIELDS,
        relationship_types: &["attached-file", "relates-to"],
        create: cli_create_file,
        update: cli_update_file,
        get: cli_get_file,
        list: cli_list_files,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// A minimal, valid .docx: `office_text::extract_office_text` needs a real
    /// zip with `word/document.xml`, so this stands in for OCR-dependent
    /// fixtures (pdf/image) that need real tooling not available in tests.
    fn write_docx(path: &Path, body_text: &str) {
        let file = std::fs::File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        zip.start_file("word/document.xml", options).unwrap();
        let paragraph = if body_text.is_empty() {
            String::new()
        } else {
            format!("<w:p><w:r><w:t>{body_text}</w:t></w:r></w:p>")
        };
        zip.write_all(
            format!(r#"<w:document xmlns:w="ns"><w:body>{paragraph}</w:body></w:document>"#)
                .as_bytes(),
        )
        .unwrap();
        zip.finish().unwrap();
    }

    #[test]
    fn needs_reindex_reflects_whether_content_was_found() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let dir = std::env::temp_dir().join(format!("nookly-test-{}", crate::db::new_id()));
        std::fs::create_dir_all(&dir).unwrap();

        // A docx with extractable text is indexed on import: no reindex needed.
        let source = dir.join("notes.docx");
        write_docx(&source, "Hello world");
        let file = import_file(&conn, &dir, space.id.clone(), &source).unwrap();
        assert!(!file.needs_reindex);

        // A docx with nothing to extract looks like "never tried" and stays
        // a reindex candidate, same as a file imported before this File type
        // became indexable — intentional (see `is_indexable` doc comment).
        let blank_source = dir.join("blank.docx");
        write_docx(&blank_source, "");
        let blank = import_file(&conn, &dir, space.id.clone(), &blank_source).unwrap();
        assert!(blank.needs_reindex);

        // A type with no extractor at all (e.g. plain text) is never a candidate.
        let txt_source = dir.join("readme.txt");
        std::fs::write(&txt_source, b"whatever").unwrap();
        let txt = import_file(&conn, &dir, space.id, &txt_source).unwrap();
        assert!(!txt.needs_reindex);
    }

    #[test]
    fn reindex_missing_only_touches_files_without_content_and_reports_counts() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let dir = std::env::temp_dir().join(format!("nookly-test-{}", crate::db::new_id()));
        std::fs::create_dir_all(&dir).unwrap();

        let indexed_source = dir.join("indexed.docx");
        write_docx(&indexed_source, "Already searchable");
        let indexed = import_file(&conn, &dir, space.id.clone(), &indexed_source).unwrap();

        let blank_source = dir.join("blank.docx");
        write_docx(&blank_source, "");
        let blank = import_file(&conn, &dir, space.id.clone(), &blank_source).unwrap();
        assert!(blank.needs_reindex);

        // Simulates a file imported before this File type became indexable:
        // the extractor now finds text, but nothing has re-run it yet.
        let stale_source = dir.join("stale.docx");
        write_docx(&stale_source, "Found on reindex");
        let stale = import_file(&conn, &dir, space.id.clone(), &stale_source).unwrap();
        crate::db::search::index_entity_content(&conn, &stale.entity.id, "").unwrap();
        assert!(files_needing_reindex(&conn, Some(&space.id))
            .unwrap()
            .iter()
            .any(|f| f.entity.id == stale.entity.id));

        let summary = reindex_missing(&conn, Some(&space.id)).unwrap();
        assert_eq!(summary.checked, 2);
        assert_eq!(summary.reindexed, 1);

        assert!(!get_file(&conn, &indexed.entity.id).unwrap().needs_reindex);
        assert!(!get_file(&conn, &stale.entity.id).unwrap().needs_reindex);
        assert!(get_file(&conn, &blank.entity.id).unwrap().needs_reindex);
    }

    #[test]
    fn reindex_content_field_reindexes_via_cli_update() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let dir = std::env::temp_dir().join(format!("nookly-test-{}", crate::db::new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("stale.docx");
        write_docx(&source, "Content here");
        let file = import_file(&conn, &dir, space.id, &source).unwrap();
        crate::db::search::index_entity_content(&conn, &file.entity.id, "").unwrap();
        assert!(get_file(&conn, &file.entity.id).unwrap().needs_reindex);

        let mut fields = JsonMap::new();
        fields.insert("reindexContent".into(), serde_json::json!(true));
        let updated = cli_update_file(&conn, &file.entity.id, &fields).unwrap();
        assert_eq!(updated["needsReindex"], false);
    }

    #[test]
    fn reindex_bulk_action_and_computed_field_are_registered_for_file() {
        assert!(crate::db::schema::bulk_actions("file")
            .iter()
            .any(|a| a.name == "reindex"));
        assert!(crate::db::schema::computed_fields("file")
            .iter()
            .any(|f| f.name == "needsReindex"));
    }

    #[test]
    fn share_links_become_direct_downloads() {
        assert_eq!(
            direct_download_url("https://drive.google.com/file/d/abc-1/view?usp=sharing"),
            "https://drive.google.com/uc?export=download&id=abc-1"
        );
        assert_eq!(
            direct_download_url("https://docs.google.com/document/d/xyz/edit"),
            "https://docs.google.com/document/d/xyz/export?format=pdf"
        );
        assert_eq!(
            direct_download_url("https://docs.google.com/presentation/d/xyz/edit#slide=1"),
            "https://docs.google.com/presentation/d/xyz/export/pdf"
        );
        assert_eq!(
            direct_download_url("https://www.dropbox.com/s/k/report.pdf?dl=0"),
            "https://www.dropbox.com/s/k/report.pdf?dl=1"
        );
        assert_eq!(
            direct_download_url("https://example.com/a.pdf"),
            "https://example.com/a.pdf"
        );
    }

    #[test]
    fn file_names_from_headers_and_urls() {
        assert_eq!(
            filename_from_disposition("attachment; filename=\"Q3 report.pdf\"").as_deref(),
            Some("Q3 report.pdf")
        );
        assert_eq!(
            filename_from_disposition("attachment; filename*=UTF-8''%C3%9Cbung%201.pdf").as_deref(),
            Some("Übung 1.pdf")
        );
        assert_eq!(
            filename_from_url("https://x.dev/files/Ma_VK25.pdf?x=1").as_deref(),
            Some("Ma_VK25.pdf")
        );
        // Folders and a leading dot are dropped, so a name can't escape storage.
        assert_eq!(
            filename_from_disposition("attachment; filename=\"../../.ssh\"").as_deref(),
            Some("ssh")
        );
        assert_eq!(
            with_extension("export".into(), "application/pdf"),
            "export.pdf"
        );
        assert_eq!(with_extension("a.png".into(), "application/pdf"), "a.png");
    }

    #[test]
    fn a_file_from_a_link_converts_to_a_bookmark_in_place() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let dir = std::env::temp_dir().join(format!("nookly-test-{}", crate::db::new_id()));
        let file = store_file(
            &conn,
            &dir,
            space.id.clone(),
            "page.html",
            b"<html>",
            Some("https://example.com/page"),
        )
        .unwrap();
        let label =
            crate::db::labels::create_label(&conn, space.id.clone(), "Read".into(), "#f00".into())
                .unwrap();
        crate::db::labels::attach_label(&conn, &file.entity.id, &label.id).unwrap();

        crate::db::schema::convert(&conn, &file.entity.id, "bookmark").unwrap();
        let bookmark = crate::db::bookmarks::get_bookmark(&conn, &file.entity.id).unwrap();
        assert_eq!(bookmark.url, "https://example.com/page");
        assert!(bookmark.entity.key.starts_with("BMK-"));
        assert_eq!(bookmark.label_ids, vec![label.id]);
        assert!(get_file(&conn, &file.entity.id).is_err());

        let imported = store_file(&conn, &dir, space.id, "a.pdf", b"%PDF", None).unwrap();
        assert!(crate::db::schema::convert(&conn, &imported.entity.id, "bookmark").is_err());
        assert!(crate::db::schema::convert(&conn, &imported.entity.id, "task").is_err());
    }

    #[test]
    fn replacing_keeps_the_entity_and_follows_an_untouched_title() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let dir = std::env::temp_dir().join(format!("nookly-test-{}", crate::db::new_id()));
        let file = store_file(&conn, &dir, space.id, "v1.pdf", b"one", None).unwrap();
        let source = dir.join("v2.pdf");
        std::fs::write(&source, b"two").unwrap();

        let (replaced, old) = replace_file(&conn, &dir, &file.entity.id, &source).unwrap();
        assert_eq!(replaced.entity.id, file.entity.id);
        assert_eq!(replaced.entity.key, file.entity.key);
        assert_eq!(replaced.entity.title, "v2.pdf");
        assert_eq!(replaced.original_filename.as_deref(), Some("v2.pdf"));
        assert_eq!(std::fs::read(replaced.local_path.unwrap()).unwrap(), b"two");
        assert_eq!(old, file.local_path);
    }

    #[test]
    fn a_referenced_file_copies_into_storage_later() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let dir = std::env::temp_dir().join(format!("nookly-test-{}", crate::db::new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let original = dir.join("notes.md");
        std::fs::write(&original, b"# hi").unwrap();

        let file = reference_file(&conn, space.id.clone(), &original).unwrap();
        assert!(file.local_path.is_none());
        assert_eq!(
            file.source_path.as_deref(),
            Some(original.to_str().unwrap())
        );
        assert!(reference_file(&conn, space.id, &dir.join("missing.md")).is_err());

        let copied = copy_into_storage(&conn, &dir.join("files"), &file.entity.id).unwrap();
        assert_eq!(copied.entity.id, file.entity.id);
        assert_eq!(std::fs::read(copied.local_path.unwrap()).unwrap(), b"# hi");
        assert_eq!(copied.source_path, file.source_path);
    }

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

    #[test]
    fn list_and_get_carry_label_ids_sorted_by_name() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let dir = std::env::temp_dir().join(format!("nookly-test-{}", crate::db::new_id()));
        let file = store_file(&conn, &dir, space.id.clone(), "a.pdf", b"%PDF", None).unwrap();
        let unlabeled = store_file(&conn, &dir, space.id.clone(), "b.pdf", b"%PDF", None).unwrap();

        let zeta =
            crate::db::labels::create_label(&conn, space.id.clone(), "Zeta".into(), "#f00".into())
                .unwrap();
        let alpha =
            crate::db::labels::create_label(&conn, space.id.clone(), "Alpha".into(), "#0f0".into())
                .unwrap();
        crate::db::labels::attach_label(&conn, &file.entity.id, &zeta.id).unwrap();
        crate::db::labels::attach_label(&conn, &file.entity.id, &alpha.id).unwrap();

        let listed = list_files(&conn, &space.id).unwrap();
        let labeled = listed
            .iter()
            .find(|f| f.entity.id == file.entity.id)
            .unwrap();
        assert_eq!(labeled.label_ids, vec![alpha.id.clone(), zeta.id.clone()]);
        let still_unlabeled = listed
            .iter()
            .find(|f| f.entity.id == unlabeled.entity.id)
            .unwrap();
        assert!(still_unlabeled.label_ids.is_empty());

        assert_eq!(
            get_file(&conn, &file.entity.id).unwrap().label_ids,
            vec![alpha.id, zeta.id]
        );
    }
}
