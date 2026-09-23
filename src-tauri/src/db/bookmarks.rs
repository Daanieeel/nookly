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
    })
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
    })
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
    if let Some(title) = title {
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

pub fn list_bookmarks(conn: &Connection, space_id: &str) -> AppResult<Vec<Bookmark>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, b.url, b.fetched_title, b.favicon_url, b.preview_image_url, b.description, b.metadata_fetched_at
         FROM entities e JOIN bookmarks b ON b.entity_id = e.id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY e.created_at DESC",
    )?;
    let rows = stmt.query_map(params![space_id], row_to_bookmark)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_bookmark(conn: &Connection, entity_id: &str) -> AppResult<Bookmark> {
    conn.query_row(
        "SELECT e.*, b.url, b.fetched_title, b.favicon_url, b.preview_image_url, b.description, b.metadata_fetched_at
         FROM entities e JOIN bookmarks b ON b.entity_id = e.id WHERE e.id = ?1",
        params![entity_id],
        row_to_bookmark,
    )
    .map_err(|_| AppError::NotFound(format!("bookmark {entity_id}")))
}

// --- CLI schema registration (PLAN.md §1/§3) -------------------------------

const BOOKMARK_FIELDS: &[FieldDef] = &[FieldDef {
    name: "url",
    kind: FieldKind::Text,
    required_on_create: true,
    writable_on_update: false,
    description: "The bookmarked URL. Metadata (favicon, preview, description) is fetched asynchronously by the GUI.",
}];

fn cli_create_bookmark(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    let url = crate::db::schema::require_str(&input.fields, "url")?;
    let bookmark = create_bookmark(conn, input.space_id, url)?;
    Ok(serde_json::to_value(bookmark).expect("Bookmark always serializes"))
}

fn cli_update_bookmark(
    conn: &Connection,
    id: &str,
    _fields: &JsonMap,
) -> AppResult<serde_json::Value> {
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
