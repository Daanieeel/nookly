use crate::db::bookmarks::{self, Bookmark};
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use regex::Regex;
use tauri::State;

#[tauri::command]
pub fn create_bookmark(
    state: State<DbState>,
    space_id: String,
    url: String,
) -> AppResult<Bookmark> {
    let conn = state.0.lock().unwrap();
    bookmarks::create_bookmark(&conn, space_id, url)
}

#[tauri::command]
pub fn get_bookmark(state: State<DbState>, entity_id: String) -> AppResult<Bookmark> {
    let conn = state.0.lock().unwrap();
    bookmarks::get_bookmark(&conn, &entity_id)
}

#[tauri::command]
pub fn list_bookmarks(state: State<DbState>, space_id: String) -> AppResult<Vec<Bookmark>> {
    let conn = state.0.lock().unwrap();
    bookmarks::list_bookmarks(&conn, &space_id)
}

/// Best-effort metadata fetch (§5.10). While offline this simply fails and the
/// frontend keeps showing the "added on [date]" placeholder it already has;
/// the caller is expected to retry once connectivity returns.
#[tauri::command]
pub async fn fetch_bookmark_metadata(
    state: State<'_, DbState>,
    entity_id: String,
    url: String,
) -> AppResult<Bookmark> {
    let html = reqwest::get(&url)
        .await
        .map_err(|e| AppError::Db(format!("fetch failed: {e}")))?
        .text()
        .await
        .map_err(|e| AppError::Db(format!("read body failed: {e}")))?;

    let title = extract_tag(&html, r#"(?is)<title[^>]*>(.*?)</title>"#)
        .or_else(|| extract_meta(&html, "og:title"));
    let description =
        extract_meta(&html, "description").or_else(|| extract_meta(&html, "og:description"));
    let preview_image_url = extract_meta(&html, "og:image");
    let favicon_url = extract_favicon(&html, &url);

    {
        let conn = state.0.lock().unwrap();
        bookmarks::update_metadata(
            &conn,
            &entity_id,
            title,
            favicon_url,
            preview_image_url,
            description,
        )?;
        let bookmark = conn
            .query_row(
                "SELECT e.*, b.url, b.fetched_title, b.favicon_url, b.preview_image_url, b.description, b.metadata_fetched_at
                 FROM entities e JOIN bookmarks b ON b.entity_id = e.id WHERE e.id = ?1",
                rusqlite::params![entity_id],
                |row| {
                    Ok(Bookmark {
                        entity: crate::db::entities::row_to_entity(row)?,
                        url: row.get("url")?,
                        fetched_title: row.get("fetched_title")?,
                        favicon_url: row.get("favicon_url")?,
                        preview_image_url: row.get("preview_image_url")?,
                        description: row.get("description")?,
                        metadata_fetched_at: row.get("metadata_fetched_at")?,
                    })
                },
            )
            .map_err(AppError::from)?;
        Ok(bookmark)
    }
}

fn extract_tag(html: &str, pattern: &str) -> Option<String> {
    let re = Regex::new(pattern).ok()?;
    re.captures(html).map(|c| html_unescape(c[1].trim()))
}

fn extract_meta(html: &str, name: &str) -> Option<String> {
    let escaped = regex::escape(name);
    let pattern = format!(
        r#"(?is)<meta[^>]+(?:property|name)=["']{escaped}["'][^>]+content=["']([^"']*)["']"#
    );
    let re = Regex::new(&pattern).ok()?;
    re.captures(html).map(|c| html_unescape(c[1].trim()))
}

fn extract_favicon(html: &str, base_url: &str) -> Option<String> {
    let re = Regex::new(
        r#"(?is)<link[^>]+rel=["'](?:shortcut icon|icon)["'][^>]+href=["']([^"']*)["']"#,
    )
    .ok()?;
    let href = re.captures(html).map(|c| c[1].to_string());
    href.map(|h| resolve_url(base_url, &h)).or_else(|| {
        let parsed = url::Url::parse(base_url).ok()?;
        Some(format!(
            "{}://{}/favicon.ico",
            parsed.scheme(),
            parsed.host_str()?
        ))
    })
}

fn resolve_url(base: &str, maybe_relative: &str) -> String {
    url::Url::parse(base)
        .and_then(|b| b.join(maybe_relative))
        .map(|u| u.to_string())
        .unwrap_or_else(|_| maybe_relative.to_string())
}

fn html_unescape(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}
