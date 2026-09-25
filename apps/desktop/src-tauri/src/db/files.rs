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
}

fn row_to_file(row: &rusqlite::Row) -> rusqlite::Result<FileEntity> {
    Ok(FileEntity {
        entity: crate::db::entities::row_to_entity(row)?,
        local_path: row.get("local_path")?,
        provider: row.get("provider")?,
        url: row.get("url")?,
        original_filename: row.get("original_filename")?,
        source_path: row.get("source_path")?,
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
    index_pdf_content(conn, &entity.id, &local_path);
    get_file(conn, &entity.id)
}

/// Best-effort PDF text extraction into the search index (Cmd+K, §6): a PDF's
/// own content becomes keyword-searchable, not just its file name. Silently
/// skipped for anything else, or if extraction fails (a scanned/image-only PDF
/// has no text layer, for instance) — the File entity itself is unaffected.
fn index_pdf_content(conn: &Connection, entity_id: &str, path: &str) {
    let is_pdf = Path::new(path)
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"));
    if !is_pdf {
        return;
    }
    if let Ok(result) = pdf_inspector::process_pdf(path) {
        if let Some(markdown) = result.markdown {
            let _ = crate::db::search::index_entity_content(conn, entity_id, &markdown);
        }
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
    index_pdf_content(conn, entity_id, &local_path);
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
    index_pdf_content(conn, &entity.id, &path.to_string_lossy());
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
    index_pdf_content(conn, entity_id, &local_path);
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

pub fn list_files(conn: &Connection, space_id: &str) -> AppResult<Vec<FileEntity>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, f.local_path, f.provider, f.url, f.original_filename, f.source_path FROM entities e
         JOIN files f ON f.entity_id = e.id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY e.created_at ASC",
    )?;
    let rows = stmt.query_map(params![space_id], row_to_file)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_file(conn: &Connection, entity_id: &str) -> AppResult<FileEntity> {
    conn.query_row(
        "SELECT e.*, f.local_path, f.provider, f.url, f.original_filename, f.source_path FROM entities e
         JOIN files f ON f.entity_id = e.id WHERE e.id = ?1",
        params![entity_id],
        row_to_file,
    )
    .map_err(|_| AppError::NotFound(format!("file {entity_id}")))
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
}
