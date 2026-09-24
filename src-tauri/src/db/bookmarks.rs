use crate::db::entities::Entity;
use crate::db::schema::{CreateInput, EntitySchemaDef, FieldDef, FieldKind, JsonMap};
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bookmark {
    pub entity: Entity,
    pub url: String,
    pub fetched_title: Option<String>,
    pub favicon_url: Option<String>,
    pub preview_image_url: Option<String>,
    pub description: Option<String>,
    pub metadata_fetched_at: Option<String>,
    /// A local JPEG snapshot of the page, captured by the GUI; preferred over
    /// `preview_image_url` when present.
    pub screenshot_path: Option<String>,
    /// Attached Label ids, ordered by label name.
    pub label_ids: Vec<String>,
}

fn row_to_bookmark(row: &rusqlite::Row) -> rusqlite::Result<Bookmark> {
    Ok(Bookmark {
        entity: crate::db::entities::row_to_entity(row)?,
        url: row.get("url")?,
        fetched_title: row.get("fetched_title")?,
        favicon_url: row.get("favicon_url")?,
        preview_image_url: row.get("preview_image_url")?,
        description: row.get("description")?,
        metadata_fetched_at: row.get("metadata_fetched_at")?,
        screenshot_path: row.get("screenshot_path")?,
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

/// Stored immediately as a placeholder (§5.10) — metadata is filled in later,
/// opportunistically, once network is available (see `update_metadata`).
pub fn create_bookmark(conn: &Connection, space_id: String, url: String) -> AppResult<Bookmark> {
    let entity =
        crate::db::entities::create_entity(conn, space_id, "bookmark".into(), url.clone(), None)?;
    conn.execute(
        "INSERT INTO bookmarks (entity_id, url, fetched_title, favicon_url, preview_image_url, description, metadata_fetched_at)
         VALUES (?1, ?2, NULL, NULL, NULL, NULL, NULL)",
        params![entity.id, url],
    )?;
    Ok(Bookmark {
        entity,
        url,
        fetched_title: None,
        favicon_url: None,
        preview_image_url: None,
        description: None,
        metadata_fetched_at: None,
        screenshot_path: None,
        label_ids: Vec::new(),
    })
}

/// Points the bookmark at a new URL. The old page's metadata no longer applies,
/// so it's cleared for the next fetch; a title that was still the old URL
/// follows along.
pub fn update_bookmark_url(conn: &Connection, entity_id: &str, url: String) -> AppResult<Bookmark> {
    let current = get_bookmark(conn, entity_id)?;
    if current.url == url {
        return Ok(current);
    }
    remove_screenshot_file(current.screenshot_path.as_deref());
    conn.execute(
        "UPDATE bookmarks SET url = ?1, fetched_title = NULL, favicon_url = NULL, preview_image_url = NULL,
         description = NULL, metadata_fetched_at = NULL, screenshot_path = NULL WHERE entity_id = ?2",
        params![url, entity_id],
    )?;
    let title = if current.entity.title == current.url || current.entity.title.trim().is_empty() {
        Some(url)
    } else {
        None
    };
    crate::db::entities::update_entity(
        conn,
        entity_id,
        crate::db::entities::EntityPatch {
            title,
            ..Default::default()
        },
    )?;
    get_bookmark(conn, entity_id)
}

#[allow(clippy::too_many_arguments)]
pub fn update_metadata(
    conn: &Connection,
    entity_id: &str,
    title: Option<String>,
    favicon_url: Option<String>,
    preview_image_url: Option<String>,
    description: Option<String>,
) -> AppResult<()> {
    let now = super::now();
    conn.execute(
        "UPDATE bookmarks SET fetched_title = ?1, favicon_url = ?2, preview_image_url = ?3, description = ?4, metadata_fetched_at = ?5
         WHERE entity_id = ?6",
        params![title.clone(), favicon_url, preview_image_url, description, now, entity_id],
    )?;
    // The fetched title only replaces a title nobody has typed yet: the URL it
    // started as, or nothing.
    let (current_title, url): (String, String) = conn.query_row(
        "SELECT e.title, b.url FROM entities e JOIN bookmarks b ON b.entity_id = e.id WHERE e.id = ?1",
        params![entity_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let untouched = current_title.trim().is_empty() || current_title == url;
    if let Some(title) = title.filter(|_| untouched) {
        crate::db::entities::update_entity(
            conn,
            entity_id,
            crate::db::entities::EntityPatch {
                title: Some(title),
                ..Default::default()
            },
        )?;
    }
    Ok(())
}

/// Records a new snapshot of the page and deletes the one it replaces.
pub fn set_screenshot(conn: &Connection, entity_id: &str, path: &str) -> AppResult<Bookmark> {
    let previous = get_bookmark(conn, entity_id)?.screenshot_path;
    conn.execute(
        "UPDATE bookmarks SET screenshot_path = ?1 WHERE entity_id = ?2",
        params![path, entity_id],
    )?;
    if previous.as_deref() != Some(path) {
        remove_screenshot_file(previous.as_deref());
    }
    get_bookmark(conn, entity_id)
}

/// Snapshots are a cache the app regenerates, so a failed delete is harmless.
fn remove_screenshot_file(path: Option<&str>) {
    if let Some(path) = path {
        let _ = std::fs::remove_file(path);
    }
}

pub fn list_bookmarks(conn: &Connection, space_id: &str) -> AppResult<Vec<Bookmark>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, b.url, b.fetched_title, b.favicon_url, b.preview_image_url, b.description, b.metadata_fetched_at, b.screenshot_path
         FROM entities e JOIN bookmarks b ON b.entity_id = e.id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY e.created_at DESC",
    )?;
    let rows = stmt.query_map(params![space_id], row_to_bookmark)?;
    let mut bookmarks = rows.collect::<Result<Vec<_>, _>>()?;

    let index: std::collections::HashMap<String, usize> = bookmarks
        .iter()
        .enumerate()
        .map(|(i, b)| (b.entity.id.clone(), i))
        .collect();
    let mut stmt = conn.prepare(
        "SELECT el.entity_id, el.label_id FROM entity_labels el
         JOIN entities e ON e.id = el.entity_id
         JOIN labels l ON l.id = el.label_id
         WHERE e.space_id = ?1 AND e.type = 'bookmark' AND e.deleted_at IS NULL
         ORDER BY l.name ASC",
    )?;
    let mut rows = stmt.query(params![space_id])?;
    while let Some(row) = rows.next()? {
        let entity_id: String = row.get(0)?;
        if let Some(&i) = index.get(&entity_id) {
            bookmarks[i].label_ids.push(row.get(1)?);
        }
    }
    Ok(bookmarks)
}

pub fn get_bookmark(conn: &Connection, entity_id: &str) -> AppResult<Bookmark> {
    let mut bookmark = conn.query_row(
        "SELECT e.*, b.url, b.fetched_title, b.favicon_url, b.preview_image_url, b.description, b.metadata_fetched_at, b.screenshot_path
         FROM entities e JOIN bookmarks b ON b.entity_id = e.id WHERE e.id = ?1",
        params![entity_id],
        row_to_bookmark,
    )
    .map_err(|_| AppError::NotFound(format!("bookmark {entity_id}")))?;
    bookmark.label_ids = label_ids_for(conn, entity_id)?;
    Ok(bookmark)
}

// --- CLI schema registration (PLAN.md §1/§3) -------------------------------

const BOOKMARK_FIELDS: &[FieldDef] = &[FieldDef {
    name: "url",
    kind: FieldKind::Text,
    required_on_create: true,
    writable_on_update: true,
    description: "The bookmarked URL. Metadata (favicon, preview, description) is fetched asynchronously by the GUI; changing the URL clears it until the next fetch.",
}];

fn cli_create_bookmark(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    let url = crate::db::schema::require_str(&input.fields, "url")?;
    let bookmark = create_bookmark(conn, input.space_id, url)?;
    Ok(serde_json::to_value(bookmark).expect("Bookmark always serializes"))
}

fn cli_update_bookmark(
    conn: &Connection,
    id: &str,
    fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    if let Some(url) = crate::db::schema::field_str(fields, "url") {
        update_bookmark_url(conn, id, url)?;
    }
    cli_get_bookmark(conn, id)
}

fn cli_get_bookmark(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    Ok(serde_json::to_value(get_bookmark(conn, id)?).expect("Bookmark always serializes"))
}

fn cli_list_bookmarks(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id.ok_or_else(|| {
        AppError::InvalidInput("bookmark list requires --space <space-id>".into())
    })?;
    Ok(list_bookmarks(conn, space_id)?
        .into_iter()
        .map(|b| serde_json::to_value(b).expect("Bookmark always serializes"))
        .collect())
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "bookmark",
        supports_blocks: false,
        description: "A saved URL with auto-fetched preview metadata.",
        fields: BOOKMARK_FIELDS,
        relationship_types: &["relates-to"],
        create: cli_create_bookmark,
        update: cli_update_bookmark,
        get: cli_get_bookmark,
        list: cli_list_bookmarks,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::spaces::create_space;

    fn setup() -> (Connection, String) {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        (conn, space.id)
    }

    #[test]
    fn fetched_title_never_replaces_a_typed_one() {
        let (conn, space_id) = setup();
        let b = create_bookmark(&conn, space_id, "https://a.dev".into()).unwrap();
        update_metadata(&conn, &b.entity.id, Some("A".into()), None, None, None).unwrap();
        assert_eq!(get_bookmark(&conn, &b.entity.id).unwrap().entity.title, "A");

        crate::db::entities::update_entity(
            &conn,
            &b.entity.id,
            crate::db::entities::EntityPatch {
                title: Some("Mine".into()),
                ..Default::default()
            },
        )
        .unwrap();
        update_metadata(&conn, &b.entity.id, Some("B".into()), None, None, None).unwrap();
        assert_eq!(
            get_bookmark(&conn, &b.entity.id).unwrap().entity.title,
            "Mine"
        );
    }

    #[test]
    fn changing_the_url_clears_metadata_and_moves_an_untouched_title() {
        let (conn, space_id) = setup();
        let b = create_bookmark(&conn, space_id, "https://a.dev".into()).unwrap();
        update_metadata(&conn, &b.entity.id, None, Some("icon".into()), None, None).unwrap();
        let moved = update_bookmark_url(&conn, &b.entity.id, "https://b.dev".into()).unwrap();
        assert_eq!(moved.url, "https://b.dev");
        assert_eq!(moved.entity.title, "https://b.dev");
        assert!(moved.favicon_url.is_none());
        assert!(moved.metadata_fetched_at.is_none());
    }

    #[test]
    fn list_carries_label_ids() {
        let (conn, space_id) = setup();
        let b = create_bookmark(&conn, space_id.clone(), "https://a.dev".into()).unwrap();
        let label =
            crate::db::labels::create_label(&conn, space_id.clone(), "Read".into(), "#f00".into())
                .unwrap();
        crate::db::labels::attach_label(&conn, &b.entity.id, &label.id).unwrap();
        assert_eq!(
            list_bookmarks(&conn, &space_id).unwrap()[0].label_ids,
            vec![label.id.clone()]
        );
        assert_eq!(
            get_bookmark(&conn, &b.entity.id).unwrap().label_ids,
            vec![label.id]
        );
    }
}
