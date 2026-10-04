//! Tests for Recipes (`db/recipes.rs`; no module doc exists for Recipes yet).
//! Note: there is no scaling or unit handling in the data layer: an
//! ingredient is one free text line.

use crate::db::entities::{empty_trash, restore_entity, soft_delete_entity};
use crate::db::recipes::*;
use crate::db::{test_conn, test_space};
use crate::error::AppError;
use rusqlite::Connection;

fn recipe(conn: &Connection, space_id: &str, title: &str) -> String {
    create_recipe(conn, space_id.into(), title.into())
        .unwrap()
        .id
}

fn count(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |r| r.get(0)).unwrap()
}

fn ingredient_order(conn: &Connection, id: &str) -> Vec<(String, i64)> {
    list_ingredients(conn, id, false)
        .unwrap()
        .into_iter()
        .map(|i| (i.text, i.position))
        .collect()
}

fn temp_image(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("nookly-recipe-tests-{}", crate::db::new_id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(name);
    std::fs::write(&path, b"\x89PNG").unwrap();
    path
}

#[test]
fn a_new_recipe_has_defaults() {
    let conn = test_conn();
    let space = test_space(&conn, "Home");
    let e = create_recipe(&conn, space.id.clone(), "Pancakes".into()).unwrap();
    assert!(e.key.starts_with("RCP-"));
    assert_eq!(e.entity_type, "recipe");
    let r = get_recipe(&conn, &e.id).unwrap();
    assert_eq!(r.kind, "other");
    assert!(r.duration_minutes.is_none() && r.total_duration_minutes.is_none());
    assert!(r.banner_path.is_none() && r.tags.is_empty());
}

#[test]
fn every_kind_is_accepted() {
    let conn = test_conn();
    let space = test_space(&conn, "Home");
    let id = recipe(&conn, &space.id, "R");
    for kind in RECIPE_KINDS {
        set_recipe_kind(&conn, &id, kind.to_string()).unwrap();
        assert_eq!(get_recipe(&conn, &id).unwrap().kind, *kind);
    }
    for bad in ["", "Dinner", "brunch"] {
        assert!(matches!(
            set_recipe_kind(&conn, &id, bad.into()),
            Err(AppError::InvalidInput(_))
        ));
    }
    assert_eq!(get_recipe(&conn, &id).unwrap().kind, "other");
}

#[test]
fn setters_on_an_unknown_recipe_report_not_found() {
    let conn = test_conn();
    // Setters must report NotFound for a missing recipe id.
    assert!(matches!(
        set_recipe_kind(&conn, "ghost", "lunch".into()),
        Err(AppError::NotFound(_))
    ));
    assert!(matches!(
        set_recipe_duration_minutes(&conn, "ghost", Some(5)),
        Err(AppError::NotFound(_))
    ));
    assert!(matches!(
        get_recipe(&conn, "ghost"),
        Err(AppError::NotFound(_))
    ));
}

#[test]
fn get_recipe_on_another_type_is_not_found() {
    let conn = test_conn();
    let space = test_space(&conn, "Home");
    let note = crate::db::notes::create_page(&conn, space.id.clone(), "note", "N".into()).unwrap();
    assert!(matches!(
        get_recipe(&conn, &note.id),
        Err(AppError::NotFound(_))
    ));
}

#[test]
fn a_zero_override_still_wins_over_the_sum() {
    let conn = test_conn();
    let space = test_space(&conn, "Home");
    let id = recipe(&conn, &space.id, "R");
    create_step(&conn, id.clone(), "Mix".into(), Some(10)).unwrap();
    set_recipe_duration_minutes(&conn, &id, Some(0)).unwrap();
    assert_eq!(
        get_recipe(&conn, &id).unwrap().total_duration_minutes,
        Some(0)
    );
}

#[test]
fn trashed_steps_leave_the_duration_sum_and_return_on_restore() {
    let conn = test_conn();
    let space = test_space(&conn, "Home");
    let id = recipe(&conn, &space.id, "R");
    create_step(&conn, id.clone(), "A".into(), Some(10)).unwrap();
    let b = create_step(&conn, id.clone(), "B".into(), Some(5)).unwrap();
    delete_step(&conn, &b.id).unwrap();
    assert_eq!(
        get_recipe(&conn, &id).unwrap().total_duration_minutes,
        Some(10)
    );
    restore_step(&conn, &b.id).unwrap();
    assert_eq!(
        get_recipe(&conn, &id).unwrap().total_duration_minutes,
        Some(15)
    );
}

#[test]
fn a_steps_duration_can_be_cleared_without_touching_its_text() {
    let conn = test_conn();
    let space = test_space(&conn, "Home");
    let id = recipe(&conn, &space.id, "R");
    let s = create_step(&conn, id.clone(), "Bake".into(), Some(30)).unwrap();
    let s = update_step(&conn, &s.id, Some("Bake well".into()), None).unwrap();
    assert_eq!(
        (s.text.as_str(), s.duration_minutes),
        ("Bake well", Some(30))
    );
    let s = update_step(&conn, &s.id, None, Some(None)).unwrap();
    assert_eq!((s.text.as_str(), s.duration_minutes), ("Bake well", None));
    assert_eq!(get_recipe(&conn, &id).unwrap().total_duration_minutes, None);
}

#[test]
fn unknown_steps_and_ingredients_are_not_found() {
    let conn = test_conn();
    assert!(matches!(
        get_step(&conn, "ghost"),
        Err(AppError::NotFound(_))
    ));
    assert!(matches!(
        update_step(&conn, "ghost", Some("x".into()), None),
        Err(AppError::NotFound(_))
    ));
    assert!(matches!(
        move_step(&conn, "ghost", 0),
        Err(AppError::NotFound(_))
    ));
    assert!(matches!(
        delete_step(&conn, "ghost"),
        Err(AppError::NotFound(_))
    ));
    assert!(matches!(
        restore_step(&conn, "ghost"),
        Err(AppError::NotFound(_))
    ));
    assert!(matches!(
        get_ingredient(&conn, "ghost"),
        Err(AppError::NotFound(_))
    ));
    assert!(matches!(
        update_ingredient(&conn, "ghost", "x".into()),
        Err(AppError::NotFound(_))
    ));
    assert!(matches!(
        move_ingredient(&conn, "ghost", 0),
        Err(AppError::NotFound(_))
    ));
    assert!(matches!(
        delete_ingredient(&conn, "ghost"),
        Err(AppError::NotFound(_))
    ));
    assert!(matches!(
        restore_ingredient(&conn, "ghost"),
        Err(AppError::NotFound(_))
    ));
}

#[test]
fn ingredients_on_a_missing_recipe() {
    let conn = test_conn();
    assert!(create_ingredient(&conn, "ghost".into(), "Flour".into()).is_err());
    assert!(create_step(&conn, "ghost".into(), "Mix".into(), None).is_err());
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM recipe_ingredients"), 0);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM recipe_steps"), 0);
}

#[test]
fn ingredient_text_updates_and_round_trips_unicode() {
    let conn = test_conn();
    let space = test_space(&conn, "Home");
    let id = recipe(&conn, &space.id, "R");
    let i = create_ingredient(&conn, id.clone(), "200 g Mehl".into()).unwrap();
    let i = update_ingredient(&conn, &i.id, "250 g Weizenmehl 🌾, ½ TL Salz".into()).unwrap();
    assert_eq!(i.text, "250 g Weizenmehl 🌾, ½ TL Salz");
    assert_eq!(i.position, 0);
    let long = "x".repeat(20_000);
    let l = create_ingredient(&conn, id.clone(), long.clone()).unwrap();
    assert_eq!(get_ingredient(&conn, &l.id).unwrap().text, long);
}

#[test]
fn ingredients_and_steps_stay_in_their_own_recipe() {
    let conn = test_conn();
    let space = test_space(&conn, "Home");
    let r1 = recipe(&conn, &space.id, "R1");
    let r2 = recipe(&conn, &space.id, "R2");
    create_ingredient(&conn, r1.clone(), "a".into()).unwrap();
    let b = create_ingredient(&conn, r2.clone(), "b".into()).unwrap();
    // Positions count per recipe.
    assert_eq!(b.position, 0);
    create_step(&conn, r1.clone(), "s1".into(), None).unwrap();
    assert_eq!(list_steps(&conn, &r2, true).unwrap().len(), 0);
    assert_eq!(ingredient_order(&conn, &r2), vec![("b".to_string(), 0)]);
}

#[test]
fn a_new_ingredient_after_a_deleted_one_goes_last() {
    let conn = test_conn();
    let space = test_space(&conn, "Home");
    let id = recipe(&conn, &space.id, "R");
    create_ingredient(&conn, id.clone(), "a".into()).unwrap();
    let b = create_ingredient(&conn, id.clone(), "b".into()).unwrap();
    delete_ingredient(&conn, &b.id).unwrap();
    let c = create_ingredient(&conn, id.clone(), "c".into()).unwrap();
    assert_eq!(c.position, 2);
    restore_ingredient(&conn, &b.id).unwrap();
    assert_eq!(
        ingredient_order(&conn, &id),
        vec![("a".into(), 0), ("b".into(), 1), ("c".into(), 2)]
    );
}

#[test]
fn moving_to_a_negative_position_clamps_to_first() {
    let conn = test_conn();
    let space = test_space(&conn, "Home");
    let id = recipe(&conn, &space.id, "R");
    create_ingredient(&conn, id.clone(), "a".into()).unwrap();
    let b = create_ingredient(&conn, id.clone(), "b".into()).unwrap();
    move_ingredient(&conn, &b.id, -5).unwrap();
    assert_eq!(
        ingredient_order(&conn, &id),
        vec![("b".into(), 0), ("a".into(), 1)]
    );
    // Moving to where it already is changes nothing.
    move_ingredient(&conn, &b.id, 0).unwrap();
    assert_eq!(
        ingredient_order(&conn, &id),
        vec![("b".into(), 0), ("a".into(), 1)]
    );
}

#[test]
fn a_restored_ingredient_does_not_collide_with_reordered_ones() {
    let conn = test_conn();
    let space = test_space(&conn, "Home");
    let id = recipe(&conn, &space.id, "R");
    let a = create_ingredient(&conn, id.clone(), "a".into()).unwrap();
    create_ingredient(&conn, id.clone(), "b".into()).unwrap();
    let c = create_ingredient(&conn, id.clone(), "c".into()).unwrap();
    delete_ingredient(&conn, &a.id).unwrap();
    move_ingredient(&conn, &c.id, 0).unwrap();
    restore_ingredient(&conn, &a.id).unwrap();
    let mut positions: Vec<i64> = ingredient_order(&conn, &id)
        .into_iter()
        .map(|(_, p)| p)
        .collect();
    positions.sort();
    // A restored item gets a unique place: positions stay unique and contiguous.
    assert_eq!(positions, vec![0, 1, 2]);
}

#[test]
fn steps_number_from_zero_in_insertion_order() {
    let conn = test_conn();
    let space = test_space(&conn, "Home");
    let id = recipe(&conn, &space.id, "R");
    for (i, t) in ["one", "two", "three"].iter().enumerate() {
        let s = create_step(&conn, id.clone(), t.to_string(), None).unwrap();
        assert_eq!(s.position, i as i64);
    }
    let texts: Vec<String> = list_steps(&conn, &id, false)
        .unwrap()
        .into_iter()
        .map(|s| s.text)
        .collect();
    assert_eq!(texts, vec!["one", "two", "three"]);
}

#[test]
fn tags_reject_unknowns_without_dropping_the_current_set() {
    let conn = test_conn();
    let space = test_space(&conn, "Home");
    let id = recipe(&conn, &space.id, "R");
    set_recipe_tags(&conn, &id, &["soup".into()]).unwrap();
    assert!(set_recipe_tags(&conn, &id, &["beef".into(), "nope".into()]).is_err());
    let tags: Vec<String> = get_recipe(&conn, &id)
        .unwrap()
        .tags
        .into_iter()
        .map(|t| t.id)
        .collect();
    assert_eq!(tags, vec!["soup"]);
    set_recipe_tags(&conn, &id, &[]).unwrap();
    assert!(get_recipe(&conn, &id).unwrap().tags.is_empty());
    // A repeated id is stored once.
    set_recipe_tags(&conn, &id, &["quick".into(), "quick".into()]).unwrap();
    assert_eq!(get_recipe(&conn, &id).unwrap().tags.len(), 1);
}

#[test]
fn the_tag_catalog_is_global() {
    let conn = test_conn();
    let before = list_recipe_tags(&conn).unwrap().len();
    test_space(&conn, "A");
    test_space(&conn, "B");
    assert_eq!(list_recipe_tags(&conn).unwrap().len(), before);
}

#[test]
fn a_banner_is_copied_in_and_the_previous_path_is_handed_back() {
    let conn = test_conn();
    let space = test_space(&conn, "Home");
    let id = recipe(&conn, &space.id, "R");
    let banners = std::env::temp_dir().join(format!("nookly-banners-{}", crate::db::new_id()));
    let first_src = temp_image("one.png");
    let (r, prev) = set_recipe_banner(&conn, &banners, &id, &first_src).unwrap();
    assert!(prev.is_none());
    let first = r.banner_path.clone().unwrap();
    assert!(first.ends_with(".png"));
    assert!(std::path::Path::new(&first).exists());
    // The copy is independent of the source.
    std::fs::remove_file(&first_src).unwrap();
    assert!(std::path::Path::new(&first).exists());

    let second_src = temp_image("two.jpg");
    let (r, prev) = set_recipe_banner(&conn, &banners, &id, &second_src).unwrap();
    assert_eq!(prev, Some(first));
    assert!(r.banner_path.unwrap().ends_with(".jpg"));
    std::fs::remove_dir_all(&banners).ok();
    std::fs::remove_dir_all(first_src.parent().unwrap()).ok();
    std::fs::remove_dir_all(second_src.parent().unwrap()).ok();
}

#[test]
fn a_missing_banner_source_changes_nothing() {
    let conn = test_conn();
    let space = test_space(&conn, "Home");
    let id = recipe(&conn, &space.id, "R");
    let banners = std::env::temp_dir().join(format!("nookly-banners-{}", crate::db::new_id()));
    let result = set_recipe_banner(
        &conn,
        &banners,
        &id,
        std::path::Path::new("/nonexistent/x.png"),
    );
    assert!(matches!(result, Err(AppError::Io(_))));
    assert!(get_recipe(&conn, &id).unwrap().banner_path.is_none());
    let unknown = set_recipe_banner(
        &conn,
        &banners,
        "ghost",
        std::path::Path::new("/nonexistent/x.png"),
    );
    assert!(matches!(unknown, Err(AppError::NotFound(_))));
}

#[test]
fn recipes_are_space_isolated_and_in_creation_order() {
    let conn = test_conn();
    let a = test_space(&conn, "A");
    let b = test_space(&conn, "B");
    for t in ["One", "Two", "Three"] {
        recipe(&conn, &a.id, t);
    }
    recipe(&conn, &b.id, "Other");
    let titles: Vec<String> = list_recipes(&conn, &a.id)
        .unwrap()
        .into_iter()
        .map(|r| r.entity.title)
        .collect();
    assert_eq!(titles, vec!["One", "Two", "Three"]);
    assert_eq!(list_recipes(&conn, &b.id).unwrap().len(), 1);
}

#[test]
fn a_trashed_recipe_keeps_its_children_and_restores() {
    let conn = test_conn();
    let space = test_space(&conn, "Home");
    let id = recipe(&conn, &space.id, "R");
    create_ingredient(&conn, id.clone(), "a".into()).unwrap();
    create_step(&conn, id.clone(), "s".into(), Some(3)).unwrap();
    set_recipe_tags(&conn, &id, &["soup".into()]).unwrap();
    soft_delete_entity(&conn, &id).unwrap();
    assert!(list_recipes(&conn, &space.id).unwrap().is_empty());
    restore_entity(&conn, &id).unwrap();
    let r = get_recipe(&conn, &id).unwrap();
    assert_eq!(r.total_duration_minutes, Some(3));
    assert_eq!(r.tags.len(), 1);
    assert_eq!(list_ingredients(&conn, &id, false).unwrap().len(), 1);
}

#[test]
fn empty_trash_removes_a_recipe_with_all_its_children() {
    let conn = test_conn();
    let space = test_space(&conn, "Home");
    let id = recipe(&conn, &space.id, "R");
    create_ingredient(&conn, id.clone(), "a".into()).unwrap();
    create_step(&conn, id.clone(), "s".into(), None).unwrap();
    set_recipe_tags(&conn, &id, &["soup".into()]).unwrap();
    soft_delete_entity(&conn, &id).unwrap();
    empty_trash(&conn).unwrap();
    for table in [
        "recipes",
        "recipe_ingredients",
        "recipe_steps",
        "recipe_tag_links",
    ] {
        assert_eq!(
            count(&conn, &format!("SELECT COUNT(*) FROM {table}")),
            0,
            "{table}"
        );
    }
    assert_eq!(list_recipe_tags(&conn).unwrap().len(), 14);
}

#[test]
fn cli_ingredient_create_with_position_inserts_there() {
    let conn = test_conn();
    let space = test_space(&conn, "Home");
    let id = recipe(&conn, &space.id, "R");
    create_ingredient(&conn, id.clone(), "a".into()).unwrap();
    create_ingredient(&conn, id.clone(), "b".into()).unwrap();
    let coll = crate::db::schema::child_collections("recipe")
        .into_iter()
        .find(|c| c.plural == "ingredients")
        .unwrap();
    let mut fields = crate::db::schema::JsonMap::new();
    fields.insert("text".into(), serde_json::json!("first"));
    fields.insert("position".into(), serde_json::json!(0));
    (coll.create)(&conn, &id, &fields).unwrap();
    assert_eq!(
        ingredient_order(&conn, &id),
        vec![("first".into(), 0), ("a".into(), 1), ("b".into(), 2)]
    );
}

#[test]
fn cli_duration_override_clears_with_an_empty_value() {
    let conn = test_conn();
    let space = test_space(&conn, "Home");
    let id = recipe(&conn, &space.id, "R");
    create_step(&conn, id.clone(), "s".into(), Some(7)).unwrap();
    let def = crate::db::schema::lookup("recipe").unwrap();
    let mut fields = crate::db::schema::JsonMap::new();
    fields.insert("durationMinutes".into(), serde_json::json!(45));
    (def.update)(&conn, &id, &fields).unwrap();
    assert_eq!(
        get_recipe(&conn, &id).unwrap().total_duration_minutes,
        Some(45)
    );
    let mut fields = crate::db::schema::JsonMap::new();
    fields.insert("durationMinutes".into(), serde_json::Value::Null);
    (def.update)(&conn, &id, &fields).unwrap();
    assert_eq!(
        get_recipe(&conn, &id).unwrap().total_duration_minutes,
        Some(7)
    );
}
