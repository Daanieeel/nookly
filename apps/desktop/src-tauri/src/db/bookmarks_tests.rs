//! Spec tests for Bookmarks (`docs/03-modules/files-bookmarks.md`).

use crate::db::bookmarks::*;
use crate::db::entities::{
    empty_trash, restore_entity, soft_delete_entity, update_entity, EntityPatch,
};
use crate::db::{test_conn, test_space};
use crate::error::AppError;
use rusqlite::Connection;

fn bm(conn: &Connection, space_id: &str, url: &str) -> Bookmark {
    create_bookmark(conn, space_id.into(), url.into()).unwrap()
}

fn temp_file(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("nookly-bm-tests-{}", crate::db::new_id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(name);
    std::fs::write(&path, b"jpeg").unwrap();
    path
}

fn urls(items: &[Bookmark]) -> Vec<String> {
    items.iter().map(|b| b.url.clone()).collect()
}

#[test]
fn a_new_bookmark_is_an_offline_placeholder_titled_by_its_url() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let b = bm(&conn, &space.id, "https://example.com/a");
    assert_eq!(b.entity.entity_type, "bookmark");
    assert!(b.entity.key.starts_with("BMK-"));
    assert_eq!(b.entity.title, "https://example.com/a");
    assert!(b.fetched_title.is_none() && b.favicon_url.is_none());
    assert!(b.preview_image_url.is_none() && b.description.is_none());
    assert!(b.metadata_fetched_at.is_none() && b.screenshot_path.is_none());
    // The "added on" date of the placeholder.
    assert!(!b.entity.created_at.is_empty());
}

#[test]
fn metadata_fills_in_and_is_cached_with_a_timestamp() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let b = bm(&conn, &space.id, "https://a.dev");
    update_metadata(
        &conn,
        &b.entity.id,
        Some("A Dev".into()),
        Some("https://a.dev/favicon.ico".into()),
        Some("https://a.dev/og.png".into()),
        Some("Desc".into()),
    )
    .unwrap();
    let stored = get_bookmark(&conn, &b.entity.id).unwrap();
    assert_eq!(stored.fetched_title.as_deref(), Some("A Dev"));
    assert_eq!(
        stored.favicon_url.as_deref(),
        Some("https://a.dev/favicon.ico")
    );
    assert_eq!(
        stored.preview_image_url.as_deref(),
        Some("https://a.dev/og.png")
    );
    assert_eq!(stored.description.as_deref(), Some("Desc"));
    assert!(stored.metadata_fetched_at.is_some());
    assert_eq!(stored.entity.title, "A Dev");
}

#[test]
fn a_fetch_without_a_title_keeps_the_current_one() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let b = bm(&conn, &space.id, "https://a.dev");
    update_metadata(&conn, &b.entity.id, None, None, None, None).unwrap();
    let stored = get_bookmark(&conn, &b.entity.id).unwrap();
    assert_eq!(stored.entity.title, "https://a.dev");
    assert!(stored.metadata_fetched_at.is_some());
}

#[test]
fn a_cleared_title_is_filled_by_the_fetch() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let b = bm(&conn, &space.id, "https://a.dev");
    update_entity(
        &conn,
        &b.entity.id,
        EntityPatch {
            title: Some("   ".into()),
            ..Default::default()
        },
    )
    .unwrap();
    update_metadata(
        &conn,
        &b.entity.id,
        Some("Fetched".into()),
        None,
        None,
        None,
    )
    .unwrap();
    assert_eq!(
        get_bookmark(&conn, &b.entity.id).unwrap().entity.title,
        "Fetched"
    );
}

#[test]
fn metadata_for_an_unknown_bookmark_fails() {
    let conn = test_conn();
    assert!(update_metadata(&conn, "ghost", Some("x".into()), None, None, None).is_err());
}

#[test]
fn the_same_url_again_changes_nothing() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let b = bm(&conn, &space.id, "https://a.dev");
    update_metadata(&conn, &b.entity.id, None, Some("icon".into()), None, None).unwrap();
    let same = update_bookmark_url(&conn, &b.entity.id, "https://a.dev".into()).unwrap();
    assert_eq!(same.favicon_url.as_deref(), Some("icon"));
    assert!(same.metadata_fetched_at.is_some());
}

#[test]
fn a_new_url_keeps_a_typed_title() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let b = bm(&conn, &space.id, "https://a.dev");
    update_entity(
        &conn,
        &b.entity.id,
        EntityPatch {
            title: Some("My docs".into()),
            ..Default::default()
        },
    )
    .unwrap();
    let moved = update_bookmark_url(&conn, &b.entity.id, "https://b.dev".into()).unwrap();
    assert_eq!(moved.entity.title, "My docs");
    assert_eq!(moved.url, "https://b.dev");
}

#[test]
fn a_new_url_on_an_unknown_bookmark_is_not_found() {
    let conn = test_conn();
    assert!(matches!(
        update_bookmark_url(&conn, "ghost", "https://x.dev".into()),
        Err(AppError::NotFound(_))
    ));
}

#[test]
fn a_new_screenshot_replaces_and_deletes_the_old_file() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let b = bm(&conn, &space.id, "https://a.dev");
    let first = temp_file("one.jpg");
    let second = temp_file("two.jpg");
    set_screenshot(&conn, &b.entity.id, first.to_str().unwrap()).unwrap();
    // Same path again keeps the file.
    set_screenshot(&conn, &b.entity.id, first.to_str().unwrap()).unwrap();
    assert!(first.exists());
    let updated = set_screenshot(&conn, &b.entity.id, second.to_str().unwrap()).unwrap();
    assert_eq!(updated.screenshot_path.as_deref(), second.to_str());
    assert!(!first.exists());
    assert!(second.exists());
    std::fs::remove_dir_all(second.parent().unwrap()).ok();
    std::fs::remove_dir_all(first.parent().unwrap()).ok();
}

#[test]
fn a_new_url_drops_the_old_screenshot() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let b = bm(&conn, &space.id, "https://a.dev");
    let shot = temp_file("shot.jpg");
    set_screenshot(&conn, &b.entity.id, shot.to_str().unwrap()).unwrap();
    set_preferred_image(&conn, &b.entity.id, Some("screenshot".into())).unwrap();
    let moved = update_bookmark_url(&conn, &b.entity.id, "https://b.dev".into()).unwrap();
    assert!(moved.screenshot_path.is_none());
    assert!(moved.preferred_image.is_none());
    assert!(!shot.exists());
    std::fs::remove_dir_all(shot.parent().unwrap()).ok();
}

#[test]
fn screenshot_on_an_unknown_bookmark_is_not_found() {
    let conn = test_conn();
    assert!(matches!(
        set_screenshot(&conn, "ghost", "/tmp/nope.jpg"),
        Err(AppError::NotFound(_))
    ));
}

#[test]
fn preferred_image_sets_and_clears() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let b = bm(&conn, &space.id, "https://a.dev");
    let p = set_preferred_image(&conn, &b.entity.id, Some("preview".into())).unwrap();
    assert_eq!(p.preferred_image.as_deref(), Some("preview"));
    let cleared = set_preferred_image(&conn, &b.entity.id, None).unwrap();
    assert!(cleared.preferred_image.is_none());
}

#[test]
fn cli_rejects_an_unknown_preferred_image() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let b = bm(&conn, &space.id, "https://a.dev");
    let def = crate::db::schema::lookup("bookmark").unwrap();
    let mut fields = crate::db::schema::JsonMap::new();
    fields.insert("preferredImage".into(), serde_json::json!("thumbnail"));
    assert!(matches!(
        (def.update)(&conn, &b.entity.id, &fields),
        Err(AppError::InvalidInput(_))
    ));
    let mut fields = crate::db::schema::JsonMap::new();
    fields.insert("preferredImage".into(), serde_json::json!("screenshot"));
    (def.update)(&conn, &b.entity.id, &fields).unwrap();
    let mut fields = crate::db::schema::JsonMap::new();
    fields.insert("preferredImage".into(), serde_json::json!(""));
    (def.update)(&conn, &b.entity.id, &fields).unwrap();
    assert!(get_bookmark(&conn, &b.entity.id)
        .unwrap()
        .preferred_image
        .is_none());
}

#[test]
fn bookmarks_live_inside_one_space() {
    let conn = test_conn();
    let a = test_space(&conn, "A");
    let b = test_space(&conn, "B");
    bm(&conn, &a.id, "https://a.dev");
    bm(&conn, &b.id, "https://b.dev");
    assert_eq!(
        urls(&list_bookmarks(&conn, &a.id).unwrap()),
        vec!["https://a.dev"]
    );
    assert_eq!(
        urls(&list_bookmarks(&conn, &b.id).unwrap()),
        vec!["https://b.dev"]
    );
}

#[test]
fn bookmarks_list_newest_first() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    for u in ["https://1.dev", "https://2.dev", "https://3.dev"] {
        bm(&conn, &space.id, u);
    }
    assert_eq!(
        urls(&list_bookmarks(&conn, &space.id).unwrap()),
        vec!["https://3.dev", "https://2.dev", "https://1.dev"]
    );
}

#[test]
fn trashed_bookmarks_leave_the_grid_and_restore_with_metadata() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let b = bm(&conn, &space.id, "https://a.dev");
    update_metadata(&conn, &b.entity.id, Some("A".into()), None, None, None).unwrap();
    soft_delete_entity(&conn, &b.entity.id).unwrap();
    assert!(list_bookmarks(&conn, &space.id).unwrap().is_empty());
    restore_entity(&conn, &b.entity.id).unwrap();
    let back = list_bookmarks(&conn, &space.id).unwrap();
    assert_eq!(back[0].fetched_title.as_deref(), Some("A"));
}

#[test]
fn empty_trash_removes_the_bookmark_row() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let b = bm(&conn, &space.id, "https://a.dev");
    soft_delete_entity(&conn, &b.entity.id).unwrap();
    empty_trash(&conn).unwrap();
    assert!(matches!(
        get_bookmark(&conn, &b.entity.id),
        Err(AppError::NotFound(_))
    ));
    let rows: i64 = conn
        .query_row("SELECT COUNT(*) FROM bookmarks", [], |r| r.get(0))
        .unwrap();
    assert_eq!(rows, 0);
}

#[test]
fn get_bookmark_on_another_type_is_not_found() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let note = crate::db::notes::create_page(&conn, space.id.clone(), "note", "N".into()).unwrap();
    assert!(matches!(
        get_bookmark(&conn, &note.id),
        Err(AppError::NotFound(_))
    ));
}

#[test]
fn unicode_and_very_long_urls_round_trip() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let long = format!("https://example.com/?q={}", "a".repeat(8000));
    for url in [
        "https://de.wikipedia.org/wiki/Straße",
        "https://例え.jp/パス",
        long.as_str(),
    ] {
        let b = bm(&conn, &space.id, url);
        let stored = get_bookmark(&conn, &b.entity.id).unwrap();
        assert_eq!(stored.url, url);
        assert_eq!(stored.entity.title, url);
    }
}

#[test]
fn cli_create_requires_a_url() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let def = crate::db::schema::lookup("bookmark").unwrap();
    let input = crate::db::schema::CreateInput {
        space_id: space.id.clone(),
        title: "x".into(),
        fields: crate::db::schema::JsonMap::new(),
    };
    assert!((def.create)(&conn, input).is_err());
    assert!(list_bookmarks(&conn, &space.id).unwrap().is_empty());
}
