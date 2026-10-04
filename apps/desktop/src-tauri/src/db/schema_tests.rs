//! Registry level tests for `db::schema`, independent of the CLI. Each one walks
//! the inventory registries, so new registrations are covered automatically.

use crate::db::schema::{self, CreateInput, JsonMap};
use crate::error::AppError;
use serde_json::{json, Value};
use std::collections::BTreeSet;

#[test]
fn lookup_finds_every_type_all_returns() {
    let all = schema::all();
    assert!(!all.is_empty());
    for def in &all {
        let found = schema::lookup(def.entity_type).unwrap();
        assert!(std::ptr::eq(found, *def));
    }
    assert!(schema::lookup("unicorn").is_none());
    assert!(schema::lookup("").is_none());
    assert!(schema::lookup("Task").is_none(), "lookup is case sensitive");
}

#[test]
fn all_is_sorted_and_unique() {
    let names: Vec<&str> = schema::all().iter().map(|d| d.entity_type).collect();
    let mut sorted = names.clone();
    sorted.sort_unstable();
    sorted.dedup();
    assert_eq!(names, sorted);
    // The registry is keyed by name: two registrations of one name would silently
    // drop one. Counting the raw inventory catches that.
    assert_eq!(
        inventory::iter::<schema::EntitySchemaDef>().count(),
        names.len()
    );
}

#[test]
fn type_names_are_snake_case() {
    for def in schema::all() {
        assert!(
            def.entity_type
                .chars()
                .all(|c| c.is_ascii_lowercase() || c == '_'),
            "{}",
            def.entity_type
        );
    }
}

#[test]
fn describe_json_kinds_serialize_per_field_kind() {
    let task = schema::describe_json(schema::lookup("task").unwrap());
    let kind = |name: &str| {
        task["fields"]
            .as_array()
            .unwrap()
            .iter()
            .find(|f| f["name"] == name)
            .unwrap()["kind"]
            .clone()
    };
    assert_eq!(kind("dueDate"), json!("date"));
    assert_eq!(kind("effort"), json!("integer"));
    assert_eq!(kind("completedAt"), json!("datetime"));
    assert_eq!(
        kind("parentId"),
        json!({ "type": "entity_ref", "entityType": "task" })
    );
    let view = schema::describe_json(schema::lookup("view").unwrap());
    assert_eq!(view["fields"][0]["kind"]["type"], "enum");
}

#[test]
fn payload_id_finds_top_level_and_nested_ids() {
    assert_eq!(schema::payload_id(&json!({ "id": "a" })), Some("a".into()));
    assert_eq!(
        schema::payload_id(&json!({ "entity": { "id": "b" } })),
        Some("b".into())
    );
    assert_eq!(
        schema::payload_id(&json!({ "id": "top", "entity": { "id": "nested" } })),
        Some("top".into())
    );
    assert_eq!(schema::payload_id(&json!({ "id": 3 })), None);
    assert_eq!(schema::payload_id(&json!({})), None);
}

#[test]
fn field_helpers_read_only_their_own_json_type() {
    let mut m = JsonMap::new();
    m.insert("s".into(), json!("x"));
    m.insert("n".into(), json!(3));
    m.insert("f".into(), json!(1.5));
    m.insert("b".into(), json!(true));
    assert_eq!(schema::field_str(&m, "s"), Some("x".into()));
    assert_eq!(schema::field_str(&m, "n"), None);
    assert_eq!(schema::field_i64(&m, "n"), Some(3));
    assert_eq!(schema::field_i64(&m, "f"), None);
    assert_eq!(schema::field_f64(&m, "n"), Some(3.0));
    assert_eq!(schema::field_bool(&m, "b"), Some(true));
    assert_eq!(schema::field_bool(&m, "s"), None);
    let e = schema::require_str(&m, "missing").unwrap_err().to_string();
    assert!(e.contains("--field missing=<value> is required"));
    assert!(schema::require_str(&m, "n").is_err());
}

#[test]
fn every_get_reports_not_found_for_a_missing_id() {
    let conn = crate::db::test_conn();
    for def in schema::all() {
        match (def.get)(&conn, "no-such-id") {
            Err(AppError::NotFound(_)) => {}
            other => panic!("{}: {:?}", def.entity_type, other.map(|_| ())),
        }
    }
}

#[test]
fn every_list_of_an_empty_space_is_empty_or_refused() {
    let conn = crate::db::test_conn();
    let space = crate::db::test_space(&conn, "Empty").id;
    for def in schema::all() {
        match (def.list)(&conn, Some(&space), false) {
            Ok(items) => assert!(items.is_empty(), "{}", def.entity_type),
            Err(AppError::InvalidInput(_)) => {}
            Err(e) => panic!("{}: {e}", def.entity_type),
        }
        assert!(
            (def.list)(&conn, None, false).is_err(),
            "{}",
            def.entity_type
        );
    }
}

#[test]
fn every_create_with_no_fields_succeeds_or_refuses_cleanly() {
    let conn = crate::db::test_conn();
    let space = crate::db::test_space(&conn, "Bare").id;
    for def in schema::all() {
        let required = def.fields.iter().any(|f| f.required_on_create);
        let res = (def.create)(
            &conn,
            CreateInput {
                space_id: space.clone(),
                title: "Bare".into(),
                fields: JsonMap::new(),
            },
        );
        if required {
            assert!(
                res.is_err(),
                "{} created without its required fields",
                def.entity_type
            );
        }
        if let Ok(v) = res {
            assert!(schema::payload_id(&v).is_some(), "{}", def.entity_type);
        }
    }
}

#[test]
fn convert_refuses_unregistered_pairs() {
    let conn = crate::db::test_conn();
    let space = crate::db::test_space(&conn, "Conv").id;
    let note = crate::db::notes::create_page(&conn, space, "note", "N".into()).unwrap();
    let e = schema::convert(&conn, &note.id, "task")
        .unwrap_err()
        .to_string();
    assert!(e.contains("a note can't become a task"), "{e}");
    assert!(matches!(
        schema::convert(&conn, "missing", "note"),
        Err(AppError::NotFound(_))
    ));
    for c in inventory::iter::<schema::ConversionDef>() {
        assert!(schema::lookup(c.from).is_some() && schema::lookup(c.to).is_some());
        assert_ne!(c.from, c.to);
        assert!(!c.description.trim().is_empty());
    }
}

#[test]
fn registries_only_name_registered_types() {
    for c in inventory::iter::<schema::ChildCollectionDef>() {
        assert!(schema::lookup(c.parent_type).is_some(), "{}", c.parent_type);
        assert_ne!(c.singular, c.plural);
        assert!(!c.singular.contains('-'), "verbs split on the last '-'");
    }
    for a in inventory::iter::<schema::BulkActionDef>() {
        assert!(schema::lookup(a.entity_type).is_some(), "{}", a.entity_type);
    }
    for a in inventory::iter::<schema::EntityActionDef>() {
        assert!(schema::lookup(a.entity_type).is_some(), "{}", a.entity_type);
    }
    for c in inventory::iter::<schema::ComputedFieldDef>() {
        assert!(schema::lookup(c.entity_type).is_some(), "{}", c.entity_type);
    }
    for e in inventory::iter::<schema::EmbeddedPageDef>() {
        assert!(schema::lookup(e.entity_type).is_some(), "{}", e.entity_type);
        assert!(
            schema::lookup(e.page_type).is_none(),
            "an embedded page is not listed"
        );
    }
}

#[test]
fn filtered_registry_helpers_agree_with_the_inventory() {
    for def in schema::all() {
        let t = def.entity_type;
        assert_eq!(
            schema::child_collections(t).len(),
            inventory::iter::<schema::ChildCollectionDef>()
                .filter(|c| c.parent_type == t)
                .count()
        );
        assert!(schema::entity_actions(t).iter().all(|a| a.entity_type == t));
        assert!(schema::bulk_actions(t).iter().all(|a| a.entity_type == t));
        assert!(schema::conversions_from(t).iter().all(|c| c.from == t));
    }
    assert!(schema::child_collections("unicorn").is_empty());
}

#[test]
fn embedded_course_page_is_resolved_once() {
    let conn = crate::db::test_conn();
    let (_, course) = crate::db::test_space_with_course(&conn, "S", "C");
    let def = schema::embedded_page("course").unwrap();
    let a = (def.resolve)(&conn, &course.id).unwrap();
    let b = (def.resolve)(&conn, &course.id).unwrap();
    assert_eq!(a.id, b.id);
    assert_eq!(a.entity_type, def.page_type);
    assert!(schema::embedded_page("note").is_none());
}

#[test]
fn duplicate_copies_blocks_labels_and_icon() {
    let conn = crate::db::test_conn();
    let space = crate::db::test_space(&conn, "Dup").id;
    let note = crate::db::notes::create_page(&conn, space.clone(), "note", "Orig".into()).unwrap();
    crate::db::entities::update_entity(
        &conn,
        &note.id,
        crate::db::entities::EntityPatch {
            icon: Some("📘".into()),
            ..Default::default()
        },
    )
    .unwrap();
    crate::db::notes::create_block_with_attrs(
        &conn,
        &note.id,
        "paragraph".into(),
        "Body".into(),
        None,
        None,
        None,
        Default::default(),
    )
    .unwrap();
    let label = crate::db::labels::create_label(&conn, space, "L".into(), "#000".into()).unwrap();
    crate::db::labels::attach_label(&conn, &note.id, &label.id).unwrap();
    let copy = schema::duplicate(&conn, &note.id).unwrap();
    let id = schema::payload_id(&copy).unwrap();
    assert_ne!(id, note.id);
    assert_eq!(copy["entity"]["title"], "Orig (copy)");
    assert_eq!(copy["entity"]["icon"], "📘");
    assert_eq!(crate::db::notes::list_blocks(&conn, &id).unwrap().len(), 1);
    assert_eq!(
        crate::db::labels::list_labels_for_entity(&conn, &id)
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn duplicate_keeps_an_empty_title_empty() {
    let conn = crate::db::test_conn();
    let space = crate::db::test_space(&conn, "Dup").id;
    let note = crate::db::notes::create_page(&conn, space, "note", "  ".into()).unwrap();
    let copy = schema::duplicate(&conn, &note.id).unwrap();
    assert_eq!(copy["entity"]["title"], "");
}

#[test]
fn known_block_types_are_unique() {
    let set: BTreeSet<&str> = schema::KNOWN_BLOCK_TYPES.iter().copied().collect();
    assert_eq!(set.len(), schema::KNOWN_BLOCK_TYPES.len());
    for custom in crate::db::block_types::all() {
        assert!(
            !set.contains(custom.block_type),
            "{} shadows a built in block type",
            custom.block_type
        );
    }
}

#[test]
fn describe_json_is_deterministic() {
    for def in schema::all() {
        let a: Value = schema::describe_json(def);
        assert_eq!(a, schema::describe_json(def), "{}", def.entity_type);
    }
}
