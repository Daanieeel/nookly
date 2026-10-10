//! Registry driven tests for the generic CLI. Every entity test below walks
//! `schema::all()`, so a newly registered type is covered the moment it submits
//! its `EntitySchemaDef`. Values are generated per `FieldKind`, and an
//! `EntityRef` field gets its target created first through the same generic
//! `create`, so no test hand-writes a fixture per module.
//!
//! Tests assert the intended behavior; some are red until src is fixed.

use super::*;
use crate::db::schema::{EntitySchemaDef, FieldDef, FieldKind};
use std::collections::{BTreeMap, BTreeSet};

// --- harness -----------------------------------------------------------------

/// Types the generic generator can't create, and why. Everything else must create.
const NOT_GENERIC: &[(&str, &str)] = &[
    (
        "file",
        "needs a real file on disk (localPath, copied into the app data dir) or a network download (url); \
         the one-of rule is not expressible as required_on_create",
    ),
];

fn cli(conn: &Connection, args: &[&str]) -> AppResult<Value> {
    dispatch(conn, args.iter().map(|s| s.to_string()).collect())
}

fn cli_owned(conn: &Connection, args: &[String]) -> AppResult<Value> {
    dispatch(conn, args.to_vec())
}

fn err_of(r: AppResult<Value>) -> AppError {
    match r {
        Ok(v) => panic!("expected an error, got {v}"),
        Err(e) => e,
    }
}

fn kind_of(e: &AppError) -> String {
    serde_json::to_value(e).unwrap()["kind"]
        .as_str()
        .unwrap()
        .to_string()
}

struct Fx {
    conn: Connection,
    space: String,
}

fn fx() -> Fx {
    let conn = crate::db::test_conn();
    let space = crate::db::test_space(&conn, "Gen").id;
    Fx { conn, space }
}

fn scalar(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |r| r.get(0)).unwrap()
}

/// Row count of every table: two equal fingerprints mean nothing was written.
fn fingerprint(conn: &Connection) -> BTreeMap<String, i64> {
    let names: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    names
        .into_iter()
        .map(|n| {
            let c = scalar(conn, &format!("SELECT COUNT(*) FROM \"{n}\""));
            (n, c)
        })
        .collect()
}

/// A valid value per kind; `variant` 1 differs from 0 so updates are observable.
/// `None` for kinds that need real world input (paths) or are not settable.
fn sample(f: &FieldDef, variant: usize) -> Option<Value> {
    let pick = |a: Value, b: Value| Some(if variant == 0 { a } else { b });
    match f.kind {
        FieldKind::Text if f.name.ends_with("Path") => None,
        FieldKind::Text if f.name == "startTime" => pick(json!("09:00"), json!("09:30")),
        FieldKind::Text if f.name == "examTime" => pick(json!("09:00"), json!("14:30")),
        FieldKind::Text if f.name == "endTime" => pick(json!("10:00"), json!("11:30")),
        FieldKind::Text if f.name.to_lowercase().contains("url") => pick(
            json!("https://example.com/a"),
            json!("https://example.com/b"),
        ),
        FieldKind::Text => pick(json!("Sample text"), json!("Other text")),
        FieldKind::LongText => pick(json!("Line one"), json!("Line two")),
        FieldKind::Integer => pick(json!(1), json!(2)),
        FieldKind::Float => pick(json!(0.5), json!(0.25)),
        FieldKind::Boolean => pick(json!(true), json!(false)),
        FieldKind::Date => pick(json!("2026-10-05"), json!("2026-11-12")),
        FieldKind::DateTime => pick(json!("2026-10-05T09:00:00Z"), json!("2026-11-12T09:00:00Z")),
        FieldKind::Enum(values) => pick(json!(values[0]), json!(values[values.len().min(2) - 1])),
        FieldKind::EntityRef(_) | FieldKind::Object => None,
    }
}

/// How a value is typed on the command line: strings bare, everything else as JSON.
fn arg_text(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

/// Builds `create` argv for `def`, creating every referenced entity first. `full`
/// also fills optional fields (for types with conditional requirements).
fn create_args(
    conn: &Connection,
    space: &str,
    def: &EntitySchemaDef,
    full: bool,
    depth: usize,
) -> Result<Vec<String>, String> {
    let mut args: Vec<String> = vec![
        def.entity_type.into(),
        "create".into(),
        "--space".into(),
        space.into(),
        "--title".into(),
        format!("Gen {}", def.entity_type),
    ];
    for f in def.fields {
        if !(f.required_on_create || (full && f.writable_on_update)) {
            continue;
        }
        let value = match f.kind {
            FieldKind::EntityRef(target) => {
                if depth > 4 {
                    return Err("reference chain too deep".into());
                }
                let tdef = schema::lookup(target).ok_or("unregistered reference target")?;
                json!(create_generic(conn, space, tdef, depth + 1)?.id)
            }
            _ => match sample(f, 0) {
                Some(v) => v,
                None => continue,
            },
        };
        args.push("--field".into());
        args.push(format!("{}={}", f.name, arg_text(&value)));
    }
    Ok(args)
}

#[derive(Clone)]
struct Created {
    id: String,
    key: String,
    full: bool,
}

/// Minimal create first, then the full one for conditionally required fields.
fn create_generic(
    conn: &Connection,
    space: &str,
    def: &EntitySchemaDef,
    depth: usize,
) -> Result<Created, String> {
    let mut last = String::new();
    for full in [false, true] {
        let args = create_args(conn, space, def, full, depth)?;
        match cli_owned(conn, &args) {
            Ok(res) => {
                let id = extract_id(&res["data"]).map_err(|e| e.to_string())?;
                let key = crate::db::entities::entity_key(conn, &id).map_err(|e| e.to_string())?;
                return Ok(Created { id, key, full });
            }
            Err(e) => last = e.to_string(),
        }
    }
    Err(last)
}

/// Direct seeds for the types listed in `NOT_GENERIC` that can still be exercised.
fn seed(conn: &Connection, space: &str, entity_type: &str) -> Option<Created> {
    let id = match entity_type {
        "view" => {
            crate::db::views::create_view(
                conn,
                space.into(),
                "Gen view".into(),
                "tasks".into(),
                "{}".into(),
                None,
            )
            .unwrap()
            .entity
            .id
        }
        _ => return None,
    };
    let key = crate::db::entities::entity_key(conn, &id).unwrap();
    Some(Created {
        id,
        key,
        full: false,
    })
}

fn make(conn: &Connection, space: &str, def: &EntitySchemaDef) -> Option<Created> {
    create_generic(conn, space, def, 0)
        .ok()
        .or_else(|| seed(conn, space, def.entity_type))
}

/// Runs `f` once per exercisable type, each on a fresh database.
fn each_type(mut f: impl FnMut(&Fx, &'static EntitySchemaDef, &Created)) -> usize {
    let mut n = 0;
    for def in schema::all() {
        let fx = fx();
        if let Some(created) = make(&fx.conn, &fx.space, def) {
            f(&fx, def, &created);
            n += 1;
        }
    }
    assert!(n >= schema::all().len() - NOT_GENERIC.len());
    n
}

fn get_data(conn: &Connection, t: &str, id: &str) -> Value {
    cli(conn, &[t, "get", id]).unwrap()["data"].clone()
}

fn read(data: &Value, name: &str) -> Value {
    view::lookup(data, name).cloned().unwrap_or(Value::Null)
}

fn listed_ids(res: &Value) -> Vec<String> {
    res["items"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|i| extract_id(i).ok())
        .collect()
}

fn deleted_at(conn: &Connection, id: &str) -> Option<String> {
    conn.query_row("SELECT deleted_at FROM entities WHERE id = ?1", [id], |r| {
        r.get(0)
    })
    .unwrap()
}

// --- generic create ------------------------------------------------------------

#[test]
fn only_the_listed_types_cannot_be_created_generically() {
    let mut failing = BTreeSet::new();
    for def in schema::all() {
        let fx = fx();
        if create_generic(&fx.conn, &fx.space, def, 0).is_err() {
            failing.insert(def.entity_type);
        }
    }
    let expected: BTreeSet<&str> = NOT_GENERIC.iter().map(|(t, _)| *t).collect();
    assert_eq!(failing, expected);
}

#[test]
fn every_type_creates_from_its_required_on_create_fields_alone() {
    // Intended: startTime/endTime are required unless allDay is true, and that is
    // enforced where agents see it: following `requiredOnCreate` alone is enough
    // to create any entity, calendar types included.
    let mut full = BTreeSet::new();
    each_type(|_, def, c| {
        if c.full {
            full.insert(def.entity_type);
        }
    });
    assert!(
        full.is_empty(),
        "needed more than requiredOnCreate: {full:?}"
    );
}

#[test]
fn all_day_calendar_entries_need_no_times() {
    let fx = fx();
    let res = cli(
        &fx.conn,
        &[
            "calendar_entry",
            "create",
            "--space",
            &fx.space,
            "--title",
            "Trip",
            "--field",
            "date=2026-10-05",
            "--field",
            "allDay=true",
        ],
    )
    .unwrap();
    assert_eq!(read(&res["data"], "allDay"), json!(true));
}

#[test]
fn create_payload_carries_id_key_title_and_space() {
    each_type(|fx, def, c| {
        let data = get_data(&fx.conn, def.entity_type, &c.id);
        assert_eq!(read(&data, "id"), json!(c.id), "{}", def.entity_type);
        assert_eq!(read(&data, "key"), json!(c.key), "{}", def.entity_type);
        assert_eq!(
            read(&data, "spaceId"),
            json!(fx.space),
            "{}",
            def.entity_type
        );
        assert!(read(&data, "title").is_string(), "{}", def.entity_type);
        assert_eq!(read(&data, "type"), json!(def.entity_type));
        assert!(read(&data, "deletedAt").is_null());
    });
}

#[test]
fn create_response_is_enriched_like_get() {
    for def in schema::all() {
        let fx = fx();
        let Ok(args) = create_args(
            &fx.conn,
            &fx.space,
            def,
            def.entity_type.starts_with("calendar"),
            0,
        ) else {
            continue;
        };
        let Ok(res) = cli_owned(&fx.conn, &args) else {
            continue;
        };
        assert_eq!(res["entityType"], def.entity_type);
        for key in ["data", "relationships", "labels", "mentionedIn"] {
            assert!(
                res.get(key).is_some(),
                "{} create lacks {key}",
                def.entity_type
            );
        }
    }
}

#[test]
fn key_prefix_is_specific_for_every_registered_type() {
    for def in schema::all() {
        assert_ne!(
            crate::db::entities::key_prefix(def.entity_type),
            "ENT",
            "{} falls back to the generic ENT prefix",
            def.entity_type
        );
    }
}

#[test]
fn create_with_icon_applies_it() {
    each_type(|fx, def, _| {
        if NOT_GENERIC.iter().any(|(t, _)| *t == def.entity_type) {
            return;
        }
        let mut args = create_args(
            &fx.conn,
            &fx.space,
            def,
            def.entity_type.starts_with("calendar"),
            0,
        )
        .unwrap();
        args.extend(["--icon".into(), "🧪".into()]);
        let res = cli_owned(&fx.conn, &args).unwrap();
        assert_eq!(
            read(&res["data"], "icon"),
            json!("🧪"),
            "{}",
            def.entity_type
        );
    });
}

#[test]
fn titles_with_spaces_and_unicode_round_trip() {
    let title = "  Grüße, 日本語 ✨ \"quoted\" 'single' $HOME `tick`  ";
    each_type(|fx, def, c| {
        let t = def.entity_type;
        cli(&fx.conn, &[t, "update", &c.id, "--title", title]).unwrap();
        assert_eq!(
            read(&get_data(&fx.conn, t, &c.id), "title"),
            json!(title),
            "{t}"
        );
    });
}

#[test]
fn create_missing_title_or_space_is_rejected_without_writing() {
    let fx = fx();
    for def in schema::all() {
        let Ok(args) = create_args(&fx.conn, &fx.space, def, true, 0) else {
            continue;
        };
        for drop in ["--title", "--space"] {
            let pos = args.iter().position(|a| a == drop).unwrap();
            let mut cut = args.clone();
            cut.drain(pos..pos + 2);
            let before = fingerprint(&fx.conn);
            let e = err_of(cli_owned(&fx.conn, &cut));
            assert_eq!(kind_of(&e), "InvalidInput", "{} {drop}", def.entity_type);
            assert_eq!(before, fingerprint(&fx.conn), "{} {drop}", def.entity_type);
        }
    }
}

#[test]
fn create_missing_each_required_field_is_rejected_without_writing() {
    let mut checked = 0;
    for def in schema::all() {
        for f in def.fields.iter().filter(|f| f.required_on_create) {
            let fx = fx();
            let args = create_args(&fx.conn, &fx.space, def, true, 0).unwrap();
            let prefix = format!("{}=", f.name);
            let pos = args.iter().position(|a| a.starts_with(&prefix)).unwrap();
            let mut cut = args.clone();
            cut.drain(pos - 1..=pos);
            let before = fingerprint(&fx.conn);
            let e = err_of(cli_owned(&fx.conn, &cut));
            assert_eq!(
                kind_of(&e),
                "InvalidInput",
                "{}.{}",
                def.entity_type,
                f.name
            );
            assert!(e.to_string().contains(f.name), "{e}");
            assert_eq!(
                before,
                fingerprint(&fx.conn),
                "{}.{}",
                def.entity_type,
                f.name
            );
            checked += 1;
        }
    }
    assert!(checked >= 10);
}

#[test]
fn create_with_unknown_field_is_rejected_and_names_the_known_ones() {
    let fx = fx();
    for def in schema::all() {
        let e = err_of(cli(
            &fx.conn,
            &[
                def.entity_type,
                "create",
                "--space",
                &fx.space,
                "--title",
                "X",
                "--field",
                "definitelyNotAField=1",
            ],
        ));
        let msg = e.to_string();
        assert!(msg.contains("unknown field 'definitelyNotAField'"), "{msg}");
        for f in def.fields {
            assert!(
                msg.contains(f.name),
                "{} message lacks {}",
                def.entity_type,
                f.name
            );
        }
    }
    assert_eq!(scalar(&fx.conn, "SELECT COUNT(*) FROM entities"), 0);
}

#[test]
fn body_field_points_block_types_at_the_block_commands() {
    let fx = fx();
    for def in schema::all() {
        let e = err_of(cli(
            &fx.conn,
            &[
                def.entity_type,
                "create",
                "--space",
                &fx.space,
                "--title",
                "X",
                "--field",
                "body=# Hi",
            ],
        ))
        .to_string();
        if def.supports_blocks {
            assert!(e.contains("add-block"), "{}: {e}", def.entity_type);
        } else {
            assert!(
                e.contains("unknown field 'body'"),
                "{}: {e}",
                def.entity_type
            );
        }
    }
}

#[test]
fn read_only_fields_are_refused_on_create() {
    // Intended: a field that is neither required_on_create nor writable_on_update
    // (a Task's read only `completedAt`) is refused on create, like on update, and
    // nothing is written.
    let mut accepted = BTreeSet::new();
    for def in schema::all() {
        for f in def
            .fields
            .iter()
            .filter(|f| !f.writable_on_update && !f.required_on_create)
        {
            if NOT_GENERIC.iter().any(|(t, _)| *t == def.entity_type) {
                continue;
            }
            let fx = fx();
            let Some(v) = sample(f, 0) else { continue };
            let Ok(mut args) = create_args(&fx.conn, &fx.space, def, false, 0) else {
                continue;
            };
            args.extend(["--field".into(), format!("{}={}", f.name, arg_text(&v))]);
            let before = fingerprint(&fx.conn);
            match cli_owned(&fx.conn, &args) {
                Ok(_) => {
                    accepted.insert(format!("{}.{}", def.entity_type, f.name));
                }
                Err(e) => {
                    assert_eq!(
                        kind_of(&e),
                        "InvalidInput",
                        "{}.{}",
                        def.entity_type,
                        f.name
                    );
                    assert_eq!(before, fingerprint(&fx.conn));
                }
            }
        }
    }
    assert!(accepted.is_empty(), "accepted silently: {accepted:?}");
}

#[test]
fn create_into_a_space_that_does_not_exist() {
    // A Space name passed where an id is expected is refused and writes nothing. Only
    // sub_task succeeds, because it ignores --space and takes its parent's Space.
    let mut stranded = BTreeSet::new();
    for def in schema::all() {
        let fx = fx();
        let Ok(mut args) = create_args(
            &fx.conn,
            &fx.space,
            def,
            def.entity_type.starts_with("calendar"),
            0,
        ) else {
            continue;
        };
        let pos = args.iter().position(|a| a == "--space").unwrap();
        args[pos + 1] = "Gen".into(); // the Space's name, not its id
        let before = fingerprint(&fx.conn);
        if cli_owned(&fx.conn, &args).is_ok() {
            stranded.insert(def.entity_type);
        } else {
            assert_eq!(before, fingerprint(&fx.conn), "{}", def.entity_type);
        }
    }
    assert_eq!(stranded, BTreeSet::from(["sub_task"]));
}

#[test]
fn sub_task_create_ignores_space_and_follows_its_parent() {
    let fx = fx();
    let other = crate::db::test_space(&fx.conn, "Other").id;
    let parent = cli(
        &fx.conn,
        &["task", "create", "--space", &fx.space, "--title", "P"],
    )
    .unwrap();
    let parent_id = extract_id(&parent["data"]).unwrap();
    let sub = cli(
        &fx.conn,
        &[
            "sub_task",
            "create",
            "--space",
            &other,
            "--title",
            "S",
            "--field",
            &format!("parentId={parent_id}"),
        ],
    )
    .unwrap();
    assert_eq!(read(&sub["data"], "spaceId"), json!(fx.space));
}

// --- get / list ----------------------------------------------------------------------

#[test]
fn get_returns_what_create_returned() {
    each_type(|fx, def, c| {
        let a = get_data(&fx.conn, def.entity_type, &c.id);
        let b = get_data(&fx.conn, def.entity_type, &c.id);
        assert_eq!(a, b, "{} get is not stable", def.entity_type);
        assert_eq!(read(&a, "id"), json!(c.id));
    });
}

#[test]
fn get_by_key_matches_get_by_id_in_any_case() {
    each_type(|fx, def, c| {
        let t = def.entity_type;
        let by_id = get_data(&fx.conn, t, &c.id);
        assert_eq!(get_data(&fx.conn, t, &c.key), by_id, "{t}");
        assert_eq!(get_data(&fx.conn, t, &c.key.to_lowercase()), by_id, "{t}");
    });
}

#[test]
fn get_reports_revision_and_size() {
    each_type(|fx, def, c| {
        let res = cli(&fx.conn, &[def.entity_type, "get", &c.id]).unwrap();
        assert_eq!(res["revision"].as_str().unwrap().len(), 16);
        assert!(res["size"]["chars"].as_u64().unwrap() > 0);
        assert!(res["relationships"].is_array());
        assert!(res["labels"].is_array());
        assert!(res["mentionedIn"].is_array());
    });
}

#[test]
fn get_fields_projection_keeps_id_and_key() {
    each_type(|fx, def, c| {
        let res = cli(
            &fx.conn,
            &[def.entity_type, "get", &c.id, "--fields", "title,nope"],
        )
        .unwrap();
        assert_eq!(res["data"]["id"], json!(c.id));
        assert_eq!(res["data"]["key"], json!(c.key));
        assert_eq!(res["data"]["unknownFields"], json!(["nope"]));
    });
}

#[test]
fn get_summary_reports_truncation_map() {
    each_type(|fx, def, c| {
        let res = cli(&fx.conn, &[def.entity_type, "get", &c.id, "--summary"]).unwrap();
        assert!(res["truncated"].is_object(), "{}", def.entity_type);
        if def.supports_blocks {
            assert!(res["outline"].is_array());
        }
    });
}

#[test]
fn get_several_ids_turns_bad_refs_into_error_rows() {
    each_type(|fx, def, c| {
        let res = cli(
            &fx.conn,
            &[def.entity_type, "get", &c.id, "missing-id", "ZZZ-999"],
        )
        .unwrap();
        assert_eq!(res["count"], 3);
        assert!(res["items"][0].get("error").is_none());
        assert_eq!(res["items"][1]["ref"], "missing-id");
        assert!(res["items"][1]["error"]["kind"].is_string());
        assert_eq!(res["items"][2]["error"]["kind"], "NotFound");
    });
}

#[test]
fn list_includes_the_created_entity() {
    let mut no_listing = BTreeSet::new();
    each_type(
        |fx, def, c| match cli(&fx.conn, &[def.entity_type, "list", "--space", &fx.space]) {
            Ok(res) => {
                assert!(listed_ids(&res).contains(&c.id), "{}", def.entity_type);
                assert_eq!(res["entityType"], def.entity_type);
                assert_eq!(res["count"], res["returned"]);
            }
            Err(_) => {
                no_listing.insert(def.entity_type);
            }
        },
    );
    assert!(no_listing.is_empty(), "{no_listing:?}");
}

#[test]
fn list_without_space_is_refused_with_a_hint() {
    let fx = fx();
    let mut open = BTreeSet::new();
    for def in schema::all() {
        match cli(&fx.conn, &[def.entity_type, "list"]) {
            Ok(_) => {
                open.insert(def.entity_type);
            }
            Err(e) => assert_eq!(kind_of(&e), "InvalidInput"),
        }
    }
    assert!(open.is_empty(), "{open:?}");
}

#[test]
fn list_only_shows_the_requested_space() {
    each_type(|fx, def, c| {
        let other = crate::db::test_space(&fx.conn, "Other").id;
        if let Ok(res) = cli(&fx.conn, &[def.entity_type, "list", "--space", &other]) {
            assert!(!listed_ids(&res).contains(&c.id), "{}", def.entity_type);
        }
    });
}

#[test]
fn list_limit_and_fields_shape_the_rows() {
    each_type(|fx, def, c| {
        let t = def.entity_type;
        let Ok(res) = cli(&fx.conn, &[t, "list", "--space", &fx.space, "--limit", "0"]) else {
            return;
        };
        assert_eq!(res["returned"], 0);
        assert!(res["count"].as_u64().unwrap() >= 1);
        let res = cli(
            &fx.conn,
            &[t, "list", "--space", &fx.space, "--fields", "title"],
        )
        .unwrap();
        let row = res["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["id"] == json!(c.id))
            .unwrap();
        assert_eq!(row.as_object().unwrap().len(), 3, "{t}: {row}");
        let e = err_of(cli(
            &fx.conn,
            &[t, "list", "--space", &fx.space, "--limit", "-1"],
        ));
        assert!(e.to_string().contains("non negative integer"));
    });
}

#[test]
fn list_since_keeps_recent_rows_and_rejects_garbage() {
    each_type(|fx, def, c| {
        let t = def.entity_type;
        let Ok(res) = cli(
            &fx.conn,
            &[t, "list", "--space", &fx.space, "--since", "1h"],
        ) else {
            return;
        };
        assert!(listed_ids(&res).contains(&c.id), "{t}");
        let res = cli(
            &fx.conn,
            &[t, "list", "--space", &fx.space, "--since", "2999-01-01"],
        )
        .unwrap();
        assert_eq!(res["count"], 0, "{t}");
        assert!(cli(
            &fx.conn,
            &[t, "list", "--space", &fx.space, "--since", "soon"]
        )
        .is_err());
    });
}

#[test]
fn block_page_list_rows_carry_size_hints() {
    each_type(|fx, def, c| {
        if !def.supports_blocks {
            return;
        }
        let Ok(res) = cli(&fx.conn, &[def.entity_type, "list", "--space", &fx.space]) else {
            return;
        };
        let row = res["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| extract_id(r).ok().as_deref() == Some(&c.id))
            .unwrap();
        assert!(row["bodySize"]["chars"].is_number(), "{}", def.entity_type);
        assert_eq!(row["blockCount"], 0);
        assert!(row["lastEditedAt"].is_string());
    });
}

// --- update ------------------------------------------------------------------------

#[test]
fn base_fields_round_trip_on_update() {
    each_type(|fx, def, c| {
        let t = def.entity_type;
        let res = cli(
            &fx.conn,
            &[
                t, "update", &c.id, "--title", "Renamed", "--icon", "🔥", "--pinned", "true",
            ],
        )
        .unwrap();
        let data = get_data(&fx.conn, t, &c.id);
        assert_eq!(read(&data, "title"), json!("Renamed"), "{t}");
        assert_eq!(read(&data, "icon"), json!("🔥"), "{t}");
        assert_eq!(read(&data, "pinned"), json!(true), "{t}");
        let paths: Vec<&str> = res["changes"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|c| c["path"].as_str())
            .collect();
        assert!(paths.iter().any(|p| p.ends_with("title")), "{t}: {paths:?}");
    });
}

#[test]
fn update_with_nothing_to_change_reports_no_field_changes() {
    each_type(|fx, def, c| {
        let res = cli(&fx.conn, &[def.entity_type, "update", &c.id]).unwrap();
        assert_eq!(res["changes"], json!([]), "{}", def.entity_type);
    });
}

#[test]
fn pinned_takes_only_true_or_false() {
    // Intended: `--pinned yes` and `--pinned 1` are refused (InvalidInput) and the
    // pinned state is left alone, instead of silently unpinning.
    each_type(|fx, def, c| {
        let t = def.entity_type;
        cli(&fx.conn, &[t, "update", &c.id, "--pinned", "true"]).unwrap();
        for bad in ["yes", "1"] {
            let e = err_of(cli(&fx.conn, &[t, "update", &c.id, "--pinned", bad]));
            assert_eq!(kind_of(&e), "InvalidInput", "{t} --pinned {bad}: {e}");
            assert_eq!(
                read(&get_data(&fx.conn, t, &c.id), "pinned"),
                json!(true),
                "{t} --pinned {bad}"
            );
        }
        cli(&fx.conn, &[t, "update", &c.id, "--pinned", "false"]).unwrap();
        assert_eq!(
            read(&get_data(&fx.conn, t, &c.id), "pinned"),
            json!(false),
            "{t}"
        );
    });
}

/// Writable fields whose generic sample does not read back unchanged, and why.
const UPDATE_ROUND_TRIP_EXCEPTIONS: &[(&str, &str)] = &[
    (
        "calendar_entry_template.applyFromDate",
        "an update directive, never stored",
    ),
    ("recipe.tagIds", "ids from the fixed recipe_tags catalog"),
    (
        "session_template.applyFromDate",
        "an update directive, never stored",
    ),
    ("sub_task.statusId", "ids from the task_statuses table"),
    ("task.statusId", "ids from the task_statuses table"),
    ("view.config", "a JSON object, validated per module"),
];

#[test]
fn every_writable_field_round_trips_on_update() {
    let mut mismatched = BTreeSet::new();
    let mut checked = 0;
    each_type(|fx, def, c| {
        let t = def.entity_type;
        for f in def.fields.iter().filter(|f| f.writable_on_update) {
            let Some(v) = sample(f, 1) else { continue };
            let arg = format!("{}={}", f.name, arg_text(&v));
            let ok = cli(&fx.conn, &[t, "update", &c.id, "--field", &arg]).is_ok()
                && read(&get_data(&fx.conn, t, &c.id), f.name) == v;
            if !ok {
                mismatched.insert(format!("{t}.{}", f.name));
            }
            checked += 1;
        }
    });
    let expected: BTreeSet<String> = UPDATE_ROUND_TRIP_EXCEPTIONS
        .iter()
        .map(|(n, _)| n.to_string())
        .collect();
    assert_eq!(mismatched, expected);
    assert!(checked >= 40, "{checked}");
}

#[test]
fn every_create_only_field_is_refused_on_update_and_nothing_changes() {
    let mut checked = 0;
    each_type(|fx, def, c| {
        let t = def.entity_type;
        for f in def.fields.iter().filter(|f| !f.writable_on_update) {
            let before = get_data(&fx.conn, t, &c.id);
            let value = sample(f, 1).unwrap_or(json!("x"));
            let e = err_of(cli(
                &fx.conn,
                &[
                    t,
                    "update",
                    &c.id,
                    "--title",
                    "Should not stick",
                    "--field",
                    &format!("{}={}", f.name, arg_text(&value)),
                ],
            ));
            assert!(
                e.to_string().contains("can only be set at creation"),
                "{t}.{}: {e}",
                f.name
            );
            assert_eq!(before, get_data(&fx.conn, t, &c.id), "{t}.{}", f.name);
            checked += 1;
        }
    });
    assert!(checked >= 10, "{checked}");
}

#[test]
fn update_with_unknown_field_is_refused_and_nothing_changes() {
    each_type(|fx, def, c| {
        let t = def.entity_type;
        let before = get_data(&fx.conn, t, &c.id);
        let e = err_of(cli(
            &fx.conn,
            &[t, "update", &c.id, "--title", "X", "--field", "nope=1"],
        ));
        assert_eq!(kind_of(&e), "InvalidInput");
        assert_eq!(before, get_data(&fx.conn, t, &c.id), "{t}");
    });
}

#[test]
fn update_if_revision_refuses_a_stale_revision() {
    each_type(|fx, def, c| {
        let t = def.entity_type;
        let rev = cli(&fx.conn, &[t, "get", &c.id]).unwrap()["revision"]
            .as_str()
            .unwrap()
            .to_string();
        let e = err_of(cli(
            &fx.conn,
            &[
                t,
                "update",
                &c.id,
                "--title",
                "X",
                "--if-revision",
                "0000000000000000",
            ],
        ));
        assert_eq!(kind_of(&e), "Conflict", "{t}");
        cli(
            &fx.conn,
            &[t, "update", &c.id, "--title", "Y", "--if-revision", &rev],
        )
        .unwrap();
        // The old revision is stale now.
        let e = err_of(cli(
            &fx.conn,
            &[t, "delete", &c.id, "--yes", "--if-revision", &rev],
        ));
        assert_eq!(kind_of(&e), "Conflict", "{t}");
        assert!(deleted_at(&fx.conn, &c.id).is_none());
    });
}

#[test]
fn update_space_moves_the_entity_or_names_its_owner() {
    let mut owned = BTreeSet::new();
    each_type(|fx, def, c| {
        let t = def.entity_type;
        let other = crate::db::test_space(&fx.conn, "Other").id;
        match cli(&fx.conn, &[t, "update", &c.id, "--space", &other]) {
            Ok(_) => assert_eq!(read(&get_data(&fx.conn, t, &c.id), "spaceId"), json!(other)),
            Err(e) => {
                assert!(e.to_string().contains("moves together with it"), "{t}: {e}");
                owned.insert(t);
            }
        }
        let e = err_of(cli(
            &fx.conn,
            &[t, "update", &c.id, "--space", "no-such-space"],
        ));
        assert!(
            matches!(e, AppError::NotFound(_) | AppError::InvalidInput(_)),
            "{t}: {e}"
        );
    });
    // Exactly the types whose structural parent edge is `FromFollowsTo`.
    assert_eq!(
        owned,
        BTreeSet::from([
            "assignment",
            "exam",
            "session",
            "session_template",
            "study_block",
            "sub_task"
        ])
    );
}

/// Sets each field of the matching kinds to a good value, then sends `bad`, and
/// reports what happened: refused (InvalidInput, stored value untouched), refused
/// badly, left alone, cleared or stored as sent.
fn bad_value_outcomes(kinds: fn(&FieldKind) -> bool, bad: &str) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    each_type(|fx, def, c| {
        let t = def.entity_type;
        for f in def
            .fields
            .iter()
            .filter(|f| f.writable_on_update && kinds(&f.kind))
        {
            let Some(good) = sample(f, 0) else { continue };
            if cli(
                &fx.conn,
                &[
                    t,
                    "update",
                    &c.id,
                    "--field",
                    &format!("{}={}", f.name, arg_text(&good)),
                ],
            )
            .is_err()
            {
                continue;
            }
            let good = read(&get_data(&fx.conn, t, &c.id), f.name);
            let outcome = match cli(
                &fx.conn,
                &[t, "update", &c.id, "--field", &format!("{}={bad}", f.name)],
            ) {
                Err(e) => {
                    let now = read(&get_data(&fx.conn, t, &c.id), f.name);
                    if now != good {
                        "refused-but-changed"
                    } else if kind_of(&e) != "InvalidInput" {
                        "refused-wrong-kind"
                    } else {
                        "refused"
                    }
                }
                Ok(_) => {
                    let now = read(&get_data(&fx.conn, t, &c.id), f.name);
                    if now == good {
                        "unchanged"
                    } else if now.is_null() {
                        "cleared"
                    } else {
                        "stored"
                    }
                }
            };
            out.insert(format!("{t}.{}:{outcome}", f.name));
        }
    });
    out
}

fn set(items: &[&str]) -> BTreeSet<String> {
    items.iter().map(|s| s.to_string()).collect()
}

/// Every outcome must be a clean refusal: InvalidInput with the stored value untouched.
fn assert_all_refused(got: BTreeSet<String>) {
    let bad: Vec<_> = got.iter().filter(|o| !o.ends_with(":refused")).collect();
    assert!(bad.is_empty(), "not cleanly refused: {bad:?}");
}

#[test]
fn numeric_fields_given_a_non_number_are_refused() {
    // Intended: a typo in a number is InvalidInput and never clears the stored value.
    assert_all_refused(bad_value_outcomes(
        |k| matches!(k, FieldKind::Integer | FieldKind::Float),
        "abc",
    ));
}

#[test]
fn integer_fields_given_a_fraction_are_refused() {
    // Intended: 1.5 for an integer is InvalidInput, the stored value stays.
    assert_all_refused(bad_value_outcomes(
        |k| matches!(k, FieldKind::Integer),
        "1.5",
    ));
}

#[test]
fn date_fields_given_garbage_are_refused() {
    // Intended: dates are validated on update; garbage is InvalidInput.
    assert_all_refused(bad_value_outcomes(
        |k| matches!(k, FieldKind::Date),
        "not-a-date",
    ));
}

#[test]
fn enum_fields_given_an_unknown_value_are_refused() {
    // Intended: status (and every other enum) accepts only the values describe lists.
    assert_all_refused(bad_value_outcomes(
        |k| matches!(k, FieldKind::Enum(_)),
        "bogus",
    ));
}

#[test]
fn boolean_fields_given_a_non_boolean_are_refused() {
    // Intended: `maybe` is InvalidInput, neither applied nor silently ignored.
    assert_all_refused(bad_value_outcomes(
        |k| matches!(k, FieldKind::Boolean),
        "maybe",
    ));
}

#[test]
fn text_fields_given_a_numeric_looking_value_are_converted_to_strings() {
    // Intended: `--field room=123` is accepted and stored as the text "123", never
    // cleared or dropped. Fields with their own format (times, urls, enums) may
    // refuse "123" cleanly, but must not clear or ignore it.
    let got = bad_value_outcomes(
        |k| matches!(k, FieldKind::Text | FieldKind::LongText),
        "123",
    );
    let bad: Vec<_> = got
        .iter()
        .filter(|o| !(o.ends_with(":stored") || o.ends_with(":refused")))
        .collect();
    assert!(bad.is_empty(), "cleared or ignored: {bad:?}");
    for free in [
        "calendar_entry.description",
        "calendar_entry.location",
        "course.professor",
        "exam.room",
        "session.location",
        "session.notes",
    ] {
        assert!(got.contains(&format!("{free}:stored")), "{free}: {got:?}");
    }
}

#[test]
fn a_numeric_text_value_is_stored_as_the_string() {
    let fx = fx();
    let course = cli(
        &fx.conn,
        &["course", "create", "--space", &fx.space, "--title", "C"],
    )
    .unwrap();
    let id = extract_id(&course["data"]).unwrap();
    cli(
        &fx.conn,
        &["course", "update", &id, "--field", "professor=123"],
    )
    .unwrap();
    assert_eq!(
        read(&get_data(&fx.conn, "course", &id), "professor"),
        json!("123")
    );
}

#[test]
fn quoting_a_numeric_text_value_keeps_it_a_string() {
    let fx = fx();
    let course = cli(
        &fx.conn,
        &["course", "create", "--space", &fx.space, "--title", "C"],
    )
    .unwrap();
    let id = extract_id(&course["data"]).unwrap();
    cli(
        &fx.conn,
        &["course", "update", &id, "--field", "professor=\"123\""],
    )
    .unwrap();
    assert_eq!(
        read(&get_data(&fx.conn, "course", &id), "professor"),
        json!("123")
    );
}

#[test]
fn entity_ref_fields_refuse_a_missing_id_and_write_nothing() {
    each_type(|fx, def, c| {
        let t = def.entity_type;
        for f in def
            .fields
            .iter()
            .filter(|f| matches!(f.kind, FieldKind::EntityRef(_)))
        {
            let arg = format!("{}=00000000-0000-0000-0000-000000000000", f.name);
            let before = fingerprint(&fx.conn);
            if f.writable_on_update {
                assert!(
                    cli(&fx.conn, &[t, "update", &c.id, "--field", &arg]).is_err(),
                    "{t}.{}",
                    f.name
                );
            }
            assert!(
                cli(
                    &fx.conn,
                    &[t, "create", "--space", &fx.space, "--title", "X", "--field", &arg]
                )
                .is_err(),
                "{t}.{}",
                f.name
            );
            assert_eq!(before, fingerprint(&fx.conn), "{t}.{}", f.name);
            // A key that resolves to nothing is refused too (NotFound, or InvalidInput
            // when another required field is checked first).
            let e = err_of(cli(
                &fx.conn,
                &[
                    t,
                    "create",
                    "--space",
                    &fx.space,
                    "--title",
                    "X",
                    "--field",
                    &format!("{}=ZZZ-404", f.name),
                ],
            ));
            assert!(
                ["NotFound", "InvalidInput"].contains(&kind_of(&e).as_str()),
                "{t}.{}",
                f.name
            );
            assert_eq!(before, fingerprint(&fx.conn), "{t}.{}", f.name);
        }
    });
}

#[test]
fn entity_ref_fields_refuse_an_entity_of_the_wrong_type() {
    // An entity-ref field takes only the entity type its relationship declares: a
    // Note is refused as a courseId.
    let mut accepted = BTreeSet::new();
    for def in schema::all() {
        for f in def
            .fields
            .iter()
            .filter(|f| matches!(f.kind, FieldKind::EntityRef(_)))
        {
            let fx = fx();
            let note = cli(
                &fx.conn,
                &["note", "create", "--space", &fx.space, "--title", "N"],
            )
            .unwrap();
            let note_id = extract_id(&note["data"]).unwrap();
            let Ok(mut args) = create_args(&fx.conn, &fx.space, def, false, 0) else {
                continue;
            };
            let pos = args
                .iter()
                .position(|a| a.starts_with(&format!("{}=", f.name)));
            match pos {
                Some(p) => args[p] = format!("{}={note_id}", f.name),
                None => args.extend(["--field".into(), format!("{}={note_id}", f.name)]),
            }
            if cli_owned(&fx.conn, &args).is_ok() {
                accepted.insert(format!("{}.{}", def.entity_type, f.name));
            }
        }
    }
    assert_eq!(accepted, set(&[]));
}

#[test]
fn writable_entity_ref_fields_move_the_entity_to_a_new_target() {
    // Intended: documented writable entity-ref fields (exam/assignment courseId, ...)
    // can be changed through the CLI, even inside its savepoint.
    let mut outcome = BTreeSet::new();
    each_type(|fx, def, c| {
        let t = def.entity_type;
        for f in def.fields.iter().filter(|f| f.writable_on_update) {
            let FieldKind::EntityRef(target) = f.kind else {
                continue;
            };
            let tdef = schema::lookup(target).unwrap();
            let fresh = create_generic(&fx.conn, &fx.space, tdef, 0).unwrap();
            let before = get_data(&fx.conn, t, &c.id);
            let res = cli(
                &fx.conn,
                &[
                    t,
                    "update",
                    &c.id,
                    "--field",
                    &format!("{}={}", f.name, fresh.key),
                ],
            );
            let tag = match res {
                Ok(_) => {
                    let id = cli(&fx.conn, &["describe", t]).map(|_| ()).ok();
                    let _ = id;
                    "ok"
                }
                Err(AppError::Db(m)) if m.contains("transaction within a transaction") => {
                    assert_eq!(before, get_data(&fx.conn, t, &c.id));
                    "nested-transaction"
                }
                Err(_) => "refused",
            };
            outcome.insert(format!("{t}.{}:{tag}", f.name));
        }
    });
    assert_eq!(
        outcome,
        set(&[
            "assignment.courseId:ok",
            // A session outside the assignment's Course is refused.
            "assignment.dueSessionId:refused",
            "exam.courseId:ok",
            "index_card_deck.examId:ok",
            "task.parentId:ok",
        ])
    );
}

#[test]
fn updating_an_entity_ref_field_validates_the_target_type() {
    // Intended: update refuses an entity of the wrong type for a writable ref field
    // (a Note as a courseId) and leaves the stored value untouched.
    let mut accepted = BTreeSet::new();
    each_type(|fx, def, c| {
        let t = def.entity_type;
        for f in def.fields.iter().filter(|f| f.writable_on_update) {
            if !matches!(f.kind, FieldKind::EntityRef(_)) {
                continue;
            }
            let note = cli(
                &fx.conn,
                &["note", "create", "--space", &fx.space, "--title", "N"],
            )
            .unwrap();
            let note_id = extract_id(&note["data"]).unwrap();
            let before = get_data(&fx.conn, t, &c.id);
            let rels = scalar(&fx.conn, "SELECT COUNT(*) FROM relationships");
            let res = cli(
                &fx.conn,
                &[
                    t,
                    "update",
                    &c.id,
                    "--field",
                    &format!("{}={note_id}", f.name),
                ],
            );
            if res.is_ok() {
                accepted.insert(format!("{t}.{}", f.name));
            }
            assert_eq!(before, get_data(&fx.conn, t, &c.id), "{t}.{}", f.name);
            assert_eq!(
                rels,
                scalar(&fx.conn, "SELECT COUNT(*) FROM relationships"),
                "{t}.{}",
                f.name
            );
        }
    });
    assert!(accepted.is_empty(), "{accepted:?}");
}

#[test]
fn moving_an_exam_to_another_course_works_outside_the_cli() {
    let fx = fx();
    let (a, b) = (
        crate::db::courses::create_course(&fx.conn, fx.space.clone(), "A".into()).unwrap(),
        crate::db::courses::create_course(&fx.conn, fx.space.clone(), "B".into()).unwrap(),
    );
    let exam =
        crate::db::exams::create_exam(&fx.conn, fx.space.clone(), "E".into(), a.id, None, None)
            .unwrap();
    crate::db::exams::set_exam_course(&fx.conn, &exam.entity.id, b.id.clone()).unwrap();
    let rel = crate::db::relationships::list_relationships(
        &fx.conn,
        &exam.entity.id,
        crate::db::relationships::Direction::From,
    )
    .unwrap();
    assert!(rel
        .iter()
        .any(|r| r.relationship_type == "exam-course" && r.to_entity_id == b.id));
}

// --- delete / restore ----------------------------------------------------------------

#[test]
fn delete_requires_yes_and_writes_nothing_without_it() {
    each_type(|fx, def, c| {
        let e = err_of(cli(&fx.conn, &[def.entity_type, "delete", &c.id]));
        assert!(e.to_string().contains("--yes"), "{e}");
        assert!(deleted_at(&fx.conn, &c.id).is_none());
    });
}

#[test]
fn delete_is_soft_and_keeps_the_row() {
    each_type(|fx, def, c| {
        let t = def.entity_type;
        let rows = scalar(&fx.conn, "SELECT COUNT(*) FROM entities");
        let res = cli(&fx.conn, &[t, "delete", &c.id, "--yes"]).unwrap();
        assert_eq!(res["deleted"], json!(c.id));
        assert_eq!(res["key"], json!(c.key));
        assert!(res["note"].as_str().unwrap().contains("soft delete"));
        assert_eq!(
            rows,
            scalar(&fx.conn, "SELECT COUNT(*) FROM entities"),
            "{t}"
        );
        assert!(deleted_at(&fx.conn, &c.id).is_some(), "{t}");
    });
}

#[test]
fn deleted_entities_stay_readable_by_get() {
    // 02-entity-model.md: a soft deleted entity stays visible wherever it is referenced.
    each_type(|fx, def, c| {
        let t = def.entity_type;
        cli(&fx.conn, &[t, "delete", &c.id, "--yes"]).unwrap();
        let data = get_data(&fx.conn, t, &c.id);
        assert!(read(&data, "deletedAt").is_string(), "{t}");
        assert_eq!(get_data(&fx.conn, t, &c.key), data, "{t}");
    });
}

#[test]
fn deleted_entities_leave_the_default_list() {
    each_type(|fx, def, c| {
        let t = def.entity_type;
        cli(&fx.conn, &[t, "delete", &c.id, "--yes"]).unwrap();
        if let Ok(res) = cli(&fx.conn, &[t, "list", "--space", &fx.space]) {
            assert!(!listed_ids(&res).contains(&c.id), "{t}");
        }
    });
}

#[test]
fn include_deleted_is_honored_by_every_type() {
    // Intended: `list --include-deleted` is advertised for every type, so it works
    // for all of them and a trashed entity can be found to restore it.
    let mut missing = BTreeSet::new();
    each_type(|fx, def, c| {
        let t = def.entity_type;
        cli(&fx.conn, &[t, "delete", &c.id, "--yes"]).unwrap();
        let res = cli(
            &fx.conn,
            &[t, "list", "--space", &fx.space, "--include-deleted"],
        );
        match res {
            Ok(res) if listed_ids(&res).contains(&c.id) => {}
            _ => {
                missing.insert(t);
            }
        }
    });
    assert!(
        missing.is_empty(),
        "no trashed entity listed for {missing:?}"
    );
}

#[test]
fn double_delete_is_not_found() {
    each_type(|fx, def, c| {
        cli(&fx.conn, &[def.entity_type, "delete", &c.id, "--yes"]).unwrap();
        let first = deleted_at(&fx.conn, &c.id);
        let e = err_of(cli(&fx.conn, &[def.entity_type, "delete", &c.id, "--yes"]));
        assert_eq!(kind_of(&e), "NotFound", "{}", def.entity_type);
        assert_eq!(
            first,
            deleted_at(&fx.conn, &c.id),
            "a second delete moved deletedAt"
        );
    });
}

#[test]
fn restore_brings_the_entity_back() {
    each_type(|fx, def, c| {
        let t = def.entity_type;
        cli(&fx.conn, &[t, "delete", &c.id, "--yes"]).unwrap();
        let res = cli(&fx.conn, &[t, "restore", &c.key]).unwrap();
        assert!(read(&res["data"], "deletedAt").is_null(), "{t}");
        assert!(deleted_at(&fx.conn, &c.id).is_none());
        if let Ok(list) = cli(&fx.conn, &[t, "list", "--space", &fx.space]) {
            assert!(listed_ids(&list).contains(&c.id), "{t}");
        }
        let e = err_of(cli(&fx.conn, &[t, "restore", &c.id]));
        assert_eq!(kind_of(&e), "NotFound", "restoring a live entity, {t}");
    });
}

#[test]
fn delete_keeps_relationships_in_the_graph() {
    each_type(|fx, def, c| {
        let t = def.entity_type;
        let other = cli(
            &fx.conn,
            &["note", "create", "--space", &fx.space, "--title", "Other"],
        )
        .unwrap();
        let other_id = extract_id(&other["data"]).unwrap();
        cli(
            &fx.conn,
            &["relate", &other_id, "relates-to", &c.id, "--yes"],
        )
        .unwrap();
        cli(&fx.conn, &[t, "delete", &c.id, "--yes"]).unwrap();
        let rels = cli(&fx.conn, &["note", "get", &other_id]).unwrap()["relationships"].clone();
        assert!(
            rels.as_array()
                .unwrap()
                .iter()
                .any(|r| r["toEntityId"] == json!(c.id)),
            "{t}"
        );
    });
}

#[test]
fn unknown_ids_are_not_found_for_every_verb() {
    let fx = fx();
    for def in schema::all() {
        let t = def.entity_type;
        for args in [
            vec![t, "get", "no-such-id"],
            vec![t, "get", "TSK-99999"],
            vec![t, "update", "no-such-id", "--title", "x"],
            vec![t, "delete", "no-such-id", "--yes"],
            vec![t, "restore", "no-such-id"],
            vec![t, "duplicate", "no-such-id"],
        ] {
            let e = err_of(cli(&fx.conn, &args));
            assert_eq!(kind_of(&e), "NotFound", "{args:?}: {e}");
        }
    }
}

#[test]
fn malformed_keys_pass_through_as_ids() {
    let fx = fx();
    for raw in ["TS-1", "TSK-", "TSK-1a", "1SK-1", "TASK-1"] {
        let e = err_of(cli(&fx.conn, &["task", "get", raw]));
        assert_eq!(kind_of(&e), "NotFound", "{raw}");
        assert!(e.to_string().contains(raw), "{raw}: {e}");
    }
}

#[test]
fn get_refuses_an_entity_of_another_type() {
    // Intended: `<type> get <id>` never returns an entity of a different type.
    // Task and sub_task share one adapter and read each other on purpose.
    let mut lenient = BTreeSet::new();
    each_type(|fx, def, c| {
        for other in schema::all() {
            if other.entity_type == def.entity_type {
                continue;
            }
            let pair = [def.entity_type, other.entity_type];
            if pair.contains(&"task") && pair.contains(&"sub_task") {
                continue;
            }
            if cli(&fx.conn, &[other.entity_type, "get", &c.id]).is_ok() {
                lenient.insert(format!("{} get {}", other.entity_type, def.entity_type));
            }
        }
    });
    assert!(lenient.is_empty(), "{lenient:?}");
}

#[test]
fn delete_refuses_an_entity_of_another_type() {
    // Intended: `note delete <course-id> --yes` is refused and the Course stays live;
    // delete checks the entity is of the type the verb names.
    let fx = fx();
    let course = cli(
        &fx.conn,
        &["course", "create", "--space", &fx.space, "--title", "C"],
    )
    .unwrap();
    let id = extract_id(&course["data"]).unwrap();
    let mut deleted_by = BTreeSet::new();
    for def in schema::all() {
        if def.entity_type == "course" {
            continue;
        }
        if cli(&fx.conn, &[def.entity_type, "delete", &id, "--yes"]).is_ok() {
            deleted_by.insert(def.entity_type);
            cli(&fx.conn, &["course", "restore", &id]).unwrap();
        } else {
            assert!(
                deleted_at(&fx.conn, &id).is_none(),
                "{} left it deleted",
                def.entity_type
            );
        }
    }
    assert!(
        deleted_by.is_empty(),
        "wrong type verbs deleted a Course: {deleted_by:?}"
    );
}

#[test]
fn failed_restore_through_another_type_rolls_back() {
    each_type(|fx, def, c| {
        cli(&fx.conn, &[def.entity_type, "delete", &c.id, "--yes"]).unwrap();
        let wrong = if def.entity_type == "semester" {
            "exam"
        } else {
            "semester"
        };
        if cli(&fx.conn, &[wrong, "restore", &c.id]).is_err() {
            assert!(deleted_at(&fx.conn, &c.id).is_some(), "{}", def.entity_type);
        }
    });
}

// --- duplicate / dry run ---------------------------------------------------------------

#[test]
fn duplicate_copies_every_type_into_the_same_space() {
    let mut failed = BTreeSet::new();
    let mut retitled = BTreeSet::new();
    each_type(|fx, def, c| {
        let t = def.entity_type;
        cli(&fx.conn, &[t, "update", &c.id, "--icon", "📎"]).unwrap();
        match cli(&fx.conn, &[t, "duplicate", &c.key]) {
            Ok(res) => {
                let data = &res["data"];
                assert_ne!(read(data, "id"), json!(c.id));
                if read(data, "title") != json!(format!("Gen {t} (copy)")) {
                    retitled.insert(format!("{t}:{}", read(data, "title")));
                }
                assert_eq!(read(data, "spaceId"), json!(fx.space));
                assert_eq!(read(data, "icon"), json!("📎"), "{t}");
                assert_eq!(read(data, "type"), json!(t));
            }
            Err(_) => {
                failed.insert(t);
            }
        }
    });
    // Bookmarks have their own test below.
    assert!(failed.is_empty(), "{failed:?}");
    retitled.retain(|r| !r.starts_with("bookmark:"));
    assert!(retitled.is_empty(), "{retitled:?}");
}

#[test]
fn a_view_can_be_duplicated_through_the_cli() {
    // Intended: every advertised verb works for every type, including `view duplicate`.
    let fx = fx();
    let c = seed(&fx.conn, &fx.space, "view").unwrap();
    let res = cli(&fx.conn, &["view", "duplicate", &c.key]).unwrap();
    assert_ne!(read(&res["data"], "id"), json!(c.id));
    assert_eq!(read(&res["data"], "type"), json!("view"));
    assert_eq!(read(&res["data"], "title"), json!("Gen view (copy)"));
}

#[test]
fn a_duplicated_bookmark_is_titled_like_other_duplicates() {
    // Intended: the copy is "<title> (copy)" like every other type, not its URL.
    let fx = fx();
    let def = schema::lookup("bookmark").unwrap();
    let c = create_generic(&fx.conn, &fx.space, def, 0).unwrap();
    let res = cli(&fx.conn, &["bookmark", "duplicate", &c.key]).unwrap();
    assert_eq!(read(&res["data"], "title"), json!("Gen bookmark (copy)"));
}

#[test]
fn dry_run_create_writes_nothing_for_every_type() {
    for def in schema::all() {
        let fx = fx();
        let Ok(mut args) = create_args(
            &fx.conn,
            &fx.space,
            def,
            def.entity_type.starts_with("calendar"),
            0,
        ) else {
            continue;
        };
        args.push("--dry-run".into());
        let before = fingerprint(&fx.conn);
        if let Ok(res) = cli_owned(&fx.conn, &args) {
            assert_eq!(res["dryRun"], true);
            assert!(res["result"]["data"].is_object(), "{}", def.entity_type);
        }
        assert_eq!(before, fingerprint(&fx.conn), "{}", def.entity_type);
    }
}

#[test]
fn dry_run_delete_and_update_keep_the_entity() {
    each_type(|fx, def, c| {
        let t = def.entity_type;
        let before = get_data(&fx.conn, t, &c.id);
        let res = cli(&fx.conn, &[t, "delete", &c.id, "--dry-run"]).unwrap();
        assert_eq!(res["result"]["deleted"], json!(c.id));
        let res = cli(
            &fx.conn,
            &[t, "update", &c.id, "--title", "Dry", "--dry-run"],
        )
        .unwrap();
        assert_eq!(read(&res["result"]["data"], "title"), json!("Dry"));
        assert_eq!(before, get_data(&fx.conn, t, &c.id), "{t}");
    });
}

#[test]
fn dry_run_of_a_failing_command_still_reports_the_error() {
    let fx = fx();
    let before = fingerprint(&fx.conn);
    let e = err_of(cli(
        &fx.conn,
        &["task", "create", "--space", &fx.space, "--dry-run"],
    ));
    assert!(e.to_string().contains("--title"));
    assert_eq!(before, fingerprint(&fx.conn));
    assert!(fx.conn.is_autocommit());
}

// --- savepoints --------------------------------------------------------------------------

#[test]
fn create_failing_on_a_stray_flag_leaves_no_row_anywhere() {
    for def in schema::all() {
        let fx = fx();
        let Ok(mut args) = create_args(
            &fx.conn,
            &fx.space,
            def,
            def.entity_type.starts_with("calendar"),
            0,
        ) else {
            continue;
        };
        args.extend(["--bogus-flag".into(), "x".into()]);
        let before = fingerprint(&fx.conn);
        let e = err_of(cli_owned(&fx.conn, &args));
        if NOT_GENERIC.iter().all(|(t, _)| *t != def.entity_type) {
            assert!(
                e.to_string().contains("--bogus-flag"),
                "{}: {e}",
                def.entity_type
            );
        }
        assert_eq!(before, fingerprint(&fx.conn), "{}", def.entity_type);
        assert!(fx.conn.is_autocommit());
    }
}

#[test]
fn update_failing_after_its_writes_rolls_all_of_them_back() {
    each_type(|fx, def, c| {
        let t = def.entity_type;
        let before = get_data(&fx.conn, t, &c.id);
        let print = fingerprint(&fx.conn);
        let mut args = vec![
            t, "update", &c.id, "--title", "Half", "--icon", "x", "--pinned", "true",
        ];
        let field;
        let exception = |f: &&FieldDef| {
            UPDATE_ROUND_TRIP_EXCEPTIONS
                .iter()
                .any(|(n, _)| *n == format!("{t}.{}", f.name))
        };
        if let Some(f) = def
            .fields
            .iter()
            .find(|f| f.writable_on_update && sample(f, 1).is_some() && !exception(f))
        {
            field = format!("{}={}", f.name, arg_text(&sample(f, 1).unwrap()));
            args.extend(["--field", &field]);
        }
        args.extend(["--typo-flag", "1"]);
        let e = err_of(cli(&fx.conn, &args));
        assert!(e.to_string().contains("--typo-flag"), "{t}: {e}");
        assert_eq!(before, get_data(&fx.conn, t, &c.id), "{t}");
        assert_eq!(print, fingerprint(&fx.conn), "{t}");
    });
}

#[test]
fn delete_failing_on_a_stray_flag_keeps_the_entity() {
    each_type(|fx, def, c| {
        assert!(cli(
            &fx.conn,
            &[def.entity_type, "delete", &c.id, "--yes", "--force"]
        )
        .is_err());
        assert!(deleted_at(&fx.conn, &c.id).is_none(), "{}", def.entity_type);
    });
}

#[test]
fn cli_commands_nest_inside_an_outer_savepoint() {
    let fx = fx();
    fx.conn.execute_batch("SAVEPOINT outer_test").unwrap();
    cli(
        &fx.conn,
        &["task", "create", "--space", &fx.space, "--title", "Inner"],
    )
    .unwrap();
    assert!(cli(&fx.conn, &["task", "create", "--space", &fx.space]).is_err());
    assert_eq!(scalar(&fx.conn, "SELECT COUNT(*) FROM entities"), 1);
    fx.conn
        .execute_batch("ROLLBACK TO outer_test; RELEASE outer_test")
        .unwrap();
    assert_eq!(scalar(&fx.conn, "SELECT COUNT(*) FROM entities"), 0);
}

#[test]
fn view_create_works_through_the_cli_and_with_dry_run() {
    // Intended: `view create` works inside the CLI's own savepoint, and under
    // --dry-run (which wraps it in another one) it writes nothing.
    let fx = fx();
    let args = [
        "view",
        "create",
        "--space",
        fx.space.as_str(),
        "--title",
        "Mine",
        "--field",
        "module=tasks",
    ];
    let before = fingerprint(&fx.conn);
    let mut dry: Vec<&str> = args.to_vec();
    dry.push("--dry-run");
    let res = cli(&fx.conn, &dry).unwrap();
    assert_eq!(res["dryRun"], true);
    assert_eq!(before, fingerprint(&fx.conn));
    let res = cli(&fx.conn, &args).unwrap();
    assert_eq!(read(&res["data"], "title"), json!("Mine"));
    assert_eq!(
        scalar(
            &fx.conn,
            "SELECT COUNT(*) FROM entities WHERE type = 'view'"
        ),
        1
    );
    assert!(fx.conn.is_autocommit());
}

// --- relate ------------------------------------------------------------------------------

fn new_note(fx: &Fx, title: &str) -> (String, String) {
    let res = cli(
        &fx.conn,
        &["note", "create", "--space", &fx.space, "--title", title],
    )
    .unwrap();
    let id = extract_id(&res["data"]).unwrap();
    let key = crate::db::entities::entity_key(&fx.conn, &id).unwrap();
    (id, key)
}

#[test]
fn relates_to_links_every_type_to_a_note_and_shows_both_directions() {
    each_type(|fx, def, c| {
        let (note, note_key) = new_note(fx, "Hub");
        let rel = cli(
            &fx.conn,
            &["relate", &c.key, "relates-to", &note_key, "--yes"],
        )
        .unwrap();
        assert_eq!(rel["fromEntityId"], json!(c.id));
        assert_eq!(rel["toEntityKey"], json!(note_key));
        assert_eq!(rel["fromEntityKey"], json!(c.key));
        let mine = cli(&fx.conn, &[def.entity_type, "get", &c.id]).unwrap();
        let theirs = cli(&fx.conn, &["note", "get", &note]).unwrap();
        for side in [&mine, &theirs] {
            assert!(
                side["relationships"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|r| r["id"] == rel["id"]),
                "{}",
                def.entity_type
            );
        }
    });
}

#[test]
fn relate_requires_yes_and_writes_nothing_without_it() {
    let fx = fx();
    let (a, _) = new_note(&fx, "A");
    let (b, _) = new_note(&fx, "B");
    assert!(cli(&fx.conn, &["relate", &a, "relates-to", &b]).is_err());
    assert_eq!(scalar(&fx.conn, "SELECT COUNT(*) FROM relationships"), 0);
}

#[test]
fn relate_unknown_type_and_missing_ends_are_refused() {
    let fx = fx();
    let (a, _) = new_note(&fx, "A");
    let (b, _) = new_note(&fx, "B");
    let e = err_of(cli(
        &fx.conn,
        &["relate", &a, "is-friends-with", &b, "--yes"],
    ));
    assert_eq!(kind_of(&e), "UnknownRelationshipType");
    let e = err_of(cli(
        &fx.conn,
        &["relate", &a, "relates-to", "missing", "--yes"],
    ));
    assert_eq!(kind_of(&e), "NotFound");
    let e = err_of(cli(
        &fx.conn,
        &["relate", "missing", "relates-to", &b, "--yes"],
    ));
    assert_eq!(kind_of(&e), "NotFound");
    let e = err_of(cli(&fx.conn, &["relate", &a, "relates-to", "--yes"]));
    assert!(e.to_string().contains("<to-id>"));
    assert_eq!(scalar(&fx.conn, "SELECT COUNT(*) FROM relationships"), 0);
}

#[test]
fn relate_several_targets_is_all_or_nothing() {
    let fx = fx();
    let (a, _) = new_note(&fx, "A");
    let (b, _) = new_note(&fx, "B");
    let (c, _) = new_note(&fx, "C");
    let res = cli(&fx.conn, &["relate", &a, "relates-to", &b, &c, "--yes"]).unwrap();
    assert_eq!(res["count"], 2);
    let e = err_of(cli(
        &fx.conn,
        &["relate", &a, "blocks", &b, "nope", "--yes"],
    ));
    assert_eq!(kind_of(&e), "NotFound");
    // Cardinality failure on the second target also rolls back the first.
    let make = |kind: &str, title: &str| {
        let r = cli(
            &fx.conn,
            &[kind, "create", "--space", &fx.space, "--title", title],
        )
        .unwrap();
        extract_id(&r["data"]).unwrap()
    };
    let course = make("course", "C");
    let semester = make("semester", "S1");
    let semester2 = make("semester", "S2");
    let before = scalar(&fx.conn, "SELECT COUNT(*) FROM relationships");
    let e = err_of(cli(
        &fx.conn,
        &[
            "relate",
            &course,
            "course-semester",
            &semester,
            &semester2,
            "--yes",
        ],
    ));
    assert_eq!(kind_of(&e), "CardinalityViolation");
    assert_eq!(
        before,
        scalar(&fx.conn, "SELECT COUNT(*) FROM relationships")
    );
}

#[test]
fn relating_the_same_pair_twice_returns_the_existing_relationship() {
    // Intended: a repeat `relate` of the same pair and type is not refused and
    // creates no duplicate edge; it returns the existing relationship.
    let fx = fx();
    let (a, _) = new_note(&fx, "A");
    let (b, _) = new_note(&fx, "B");
    let first = cli(&fx.conn, &["relate", &a, "relates-to", &b, "--yes"]).unwrap();
    let second = cli(&fx.conn, &["relate", &a, "relates-to", &b, "--yes"]).unwrap();
    assert_eq!(second["id"], first["id"]);
    assert_eq!(scalar(&fx.conn, "SELECT COUNT(*) FROM relationships"), 1);
}

#[test]
fn self_relations_are_refused_for_every_type() {
    // Intended: an entity can never be related to, or block, itself.
    let first = fx();
    let (a, _) = new_note(&first, "A");
    for rt in ["blocks", "relates-to"] {
        let e = err_of(cli(&first.conn, &["relate", &a, rt, &a, "--yes"]));
        assert_eq!(kind_of(&e), "InvalidInput", "{rt}: {e}");
    }
    assert_eq!(scalar(&first.conn, "SELECT COUNT(*) FROM relationships"), 0);
    // Same on every other entity type.
    for def in schema::all() {
        let fx = fx();
        let Some(c) = make(&fx.conn, &fx.space, def) else {
            continue;
        };
        let before = scalar(&fx.conn, "SELECT COUNT(*) FROM relationships");
        let e = err_of(cli(&fx.conn, &["relate", &c.id, "blocks", &c.id, "--yes"]));
        assert_eq!(kind_of(&e), "InvalidInput", "{}: {e}", def.entity_type);
        assert_eq!(
            before,
            scalar(&fx.conn, "SELECT COUNT(*) FROM relationships"),
            "{}",
            def.entity_type
        );
    }
}

#[test]
fn one_to_per_from_relations_refuse_a_second_edge() {
    let mut checked = 0;
    for rt in inventory::iter::<crate::db::relationships::RelationshipTypeDef>() {
        if rt.cardinality != crate::db::relationships::Cardinality::OneToPerFrom {
            continue;
        }
        let (Some(from), Some(to)) = (rt.from_type, rt.to_type) else {
            continue;
        };
        let (Some(fdef), Some(tdef)) = (schema::lookup(from), schema::lookup(to)) else {
            continue;
        };
        let fx = fx();
        let Some(f) = make(&fx.conn, &fx.space, fdef) else {
            continue;
        };
        let t1 = make(&fx.conn, &fx.space, tdef).unwrap();
        let t2 = make(&fx.conn, &fx.space, tdef).unwrap();
        let existing = crate::db::relationships::list_relationships(
            &fx.conn,
            &f.id,
            crate::db::relationships::Direction::From,
        )
        .unwrap()
        .iter()
        .any(|r| r.relationship_type == rt.name);
        if !existing {
            cli(&fx.conn, &["relate", &f.id, rt.name, &t1.id, "--yes"]).unwrap();
        }
        let e = err_of(cli(&fx.conn, &["relate", &f.id, rt.name, &t2.id, "--yes"]));
        assert_eq!(kind_of(&e), "CardinalityViolation", "{}", rt.name);
        checked += 1;
    }
    assert!(checked >= 5, "{checked}");
}

#[test]
fn typed_relations_reject_ends_of_the_wrong_type() {
    // from_type/to_type are the types the ends must be: `relate <note> exam-course
    // <task>` is refused rather than faking a structural edge.
    let mut accepted = BTreeSet::new();
    for rt in inventory::iter::<crate::db::relationships::RelationshipTypeDef>() {
        if rt.from_type.is_none() && rt.to_type.is_none() {
            continue;
        }
        let fx = fx();
        let (a, _) = new_note(&fx, "A");
        let (b, _) = new_note(&fx, "B");
        let wrong_from = rt.from_type != Some("note");
        let wrong_to = rt.to_type != Some("note");
        assert!(wrong_from || wrong_to);
        if cli(&fx.conn, &["relate", &a, rt.name, &b, "--yes"]).is_ok() {
            accepted.insert(rt.name.to_string());
        }
    }
    let typed: BTreeSet<String> =
        inventory::iter::<crate::db::relationships::RelationshipTypeDef>()
            .filter(|rt| rt.from_type.is_some() || rt.to_type.is_some())
            .map(|rt| rt.name.to_string())
            .collect();
    assert!(!typed.is_empty());
    assert!(
        accepted.is_empty(),
        "typed relationships accepted the wrong end types: {accepted:?}"
    );
}

#[test]
fn relating_to_a_deleted_entity_is_allowed() {
    // 02-entity-model.md: a trashed entity stays in the graph, so linking to it works.
    let fx = fx();
    let (a, _) = new_note(&fx, "A");
    let (b, _) = new_note(&fx, "B");
    cli(&fx.conn, &["note", "delete", &b, "--yes"]).unwrap();
    let rel = cli(&fx.conn, &["relate", &a, "relates-to", &b, "--yes"]).unwrap();
    assert_eq!(rel["toEntityId"], json!(b));
}

#[test]
fn unrelate_removes_the_edge_once() {
    let fx = fx();
    let (a, _) = new_note(&fx, "A");
    let (b, _) = new_note(&fx, "B");
    let rel = cli(&fx.conn, &["relate", &a, "relates-to", &b, "--yes"]).unwrap();
    let id = rel["id"].as_str().unwrap();
    assert!(cli(&fx.conn, &["unrelate", id]).is_err());
    assert_eq!(scalar(&fx.conn, "SELECT COUNT(*) FROM relationships"), 1);
    assert_eq!(
        cli(&fx.conn, &["unrelate", id, "--yes"]).unwrap()["deleted"],
        id
    );
    let e = err_of(cli(&fx.conn, &["unrelate", id, "--yes"]));
    assert_eq!(kind_of(&e), "NotFound");
    assert!(cli(&fx.conn, &["unrelate", "--yes"]).is_err());
}

#[test]
fn relationship_listing_by_direction() {
    let fx = fx();
    let (a, _) = new_note(&fx, "A");
    let (b, _) = new_note(&fx, "B");
    cli(&fx.conn, &["relate", &a, "blocks", &b, "--yes"]).unwrap();
    use crate::db::relationships::{list_relationships, Direction};
    assert_eq!(
        list_relationships(&fx.conn, &a, Direction::From)
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        list_relationships(&fx.conn, &a, Direction::To)
            .unwrap()
            .len(),
        0
    );
    assert_eq!(
        list_relationships(&fx.conn, &b, Direction::To)
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        list_relationships(&fx.conn, &b, Direction::Both)
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn every_relationship_type_named_in_describe_relates_two_generated_entities() {
    let fx = fx();
    let mut checked = BTreeSet::new();
    for def in schema::all() {
        for name in def.relationship_types {
            let rt = crate::db::relationships::lookup_relationship_type(name).unwrap();
            // An end that is an embedded page (a Course's notes) can't be generated.
            let end = |t: Option<&str>| match t {
                None => Some(def),
                Some(name) => schema::lookup(name),
            };
            let (Some(from), Some(to)) = (end(rt.from_type), end(rt.to_type)) else {
                continue;
            };
            let (Some(f), Some(t)) = (
                make(&fx.conn, &fx.space, from),
                make(&fx.conn, &fx.space, to),
            ) else {
                continue;
            };
            let already = crate::db::relationships::list_relationships(
                &fx.conn,
                &f.id,
                crate::db::relationships::Direction::From,
            )
            .unwrap()
            .iter()
            .any(|r| r.relationship_type == rt.name);
            if !already {
                cli(&fx.conn, &["relate", &f.id, rt.name, &t.id, "--yes"]).unwrap();
            }
            checked.insert(*name);
        }
    }
    assert!(checked.len() >= 10, "{checked:?}");
}

// --- describe / schema ----------------------------------------------------------------------

const BASE_FIELDS: &[&str] = &[
    "id",
    "key",
    "spaceId",
    "title",
    "icon",
    "pinned",
    "createdAt",
    "updatedAt",
    "deletedAt",
    "lastOpenedAt",
];

fn valid_kind(kind: &Value) -> bool {
    match kind {
        Value::String(s) => [
            "text",
            "long_text",
            "integer",
            "float",
            "boolean",
            "date",
            "datetime",
            "object",
        ]
        .contains(&s.as_str()),
        Value::Object(o) => match o.get("type").and_then(Value::as_str) {
            Some("enum") => o["values"].as_array().is_some_and(|v| !v.is_empty()),
            Some("entity_ref") => o["entityType"]
                .as_str()
                .is_some_and(|t| schema::lookup(t).is_some()),
            _ => false,
        },
        _ => false,
    }
}

#[test]
fn schema_lists_every_registered_type_once_in_order() {
    let all = cli(&crate::db::test_conn(), &["schema"]).unwrap();
    let names: Vec<&str> = all["entityTypes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["entityType"].as_str().unwrap())
        .collect();
    let registry: Vec<&str> = schema::all().iter().map(|d| d.entity_type).collect();
    assert_eq!(names, registry);
    let mut sorted = names.clone();
    sorted.sort_unstable();
    sorted.dedup();
    assert_eq!(sorted, names);
    assert!(names.len() >= 18);
}

#[test]
fn describe_cli_matches_the_registry_for_every_type() {
    let conn = crate::db::test_conn();
    for def in schema::all() {
        let t = def.entity_type;
        let via_describe = cli(&conn, &["describe", t]).unwrap();
        assert_eq!(via_describe, schema::describe_json(def), "{t}");
        assert_eq!(cli(&conn, &[t]).unwrap(), via_describe, "{t} with no verb");
    }
}

#[test]
fn describe_has_the_full_shape() {
    for def in schema::all() {
        let d = schema::describe_json(def);
        let t = def.entity_type;
        assert_eq!(d["entityType"], t);
        assert!(!d["description"].as_str().unwrap().trim().is_empty(), "{t}");
        assert!(d["supportsBlocks"].is_boolean());
        for key in [
            "baseFields",
            "fields",
            "computedFields",
            "relationshipTypes",
            "childCollections",
            "entityActions",
            "bulkActions",
            "convertsTo",
        ] {
            assert!(d[key].is_array(), "{t}.{key}");
        }
        let base: Vec<&str> = d["baseFields"]
            .as_array()
            .unwrap()
            .iter()
            .map(|f| f["name"].as_str().unwrap())
            .collect();
        assert_eq!(base, BASE_FIELDS);
    }
}

#[test]
fn describe_fields_mirror_their_field_defs() {
    for def in schema::all() {
        let d = schema::describe_json(def);
        let fields = d["fields"].as_array().unwrap();
        assert_eq!(fields.len(), def.fields.len());
        for (json, f) in fields.iter().zip(def.fields) {
            assert_eq!(json["name"], f.name);
            assert_eq!(json["requiredOnCreate"], f.required_on_create);
            assert_eq!(json["writableOnUpdate"], f.writable_on_update);
            assert_eq!(json["description"], f.description);
            assert!(
                valid_kind(&json["kind"]),
                "{}.{}: {}",
                def.entity_type,
                f.name,
                json["kind"]
            );
        }
    }
}

#[test]
fn field_names_are_unique_and_never_shadow_base_fields() {
    for def in schema::all() {
        let mut seen = BTreeSet::new();
        for f in def.fields {
            assert!(
                seen.insert(f.name),
                "{} repeats {}",
                def.entity_type,
                f.name
            );
            assert!(
                !BASE_FIELDS.contains(&f.name),
                "{} shadows {}",
                def.entity_type,
                f.name
            );
            assert!(!f.name.is_empty() && !f.name.contains(char::is_whitespace));
            assert!(!f.name.contains('='), "an '=' would break --field parsing");
        }
        for c in schema::computed_fields(def.entity_type) {
            assert!(
                seen.insert(c.name),
                "{} computed {} collides",
                def.entity_type,
                c.name
            );
            assert!(!c.description.trim().is_empty());
        }
    }
}

#[test]
fn every_description_is_written() {
    for def in schema::all() {
        for f in def.fields {
            assert!(
                !f.description.trim().is_empty(),
                "{}.{}",
                def.entity_type,
                f.name
            );
        }
    }
    for rt in crate::db::relationships::list_relationship_types() {
        assert!(!rt.label.trim().is_empty(), "{}", rt.name);
        assert!(!rt.description.trim().is_empty(), "{}", rt.name);
        assert!(!rt.inverse_label.trim().is_empty(), "{}", rt.name);
    }
}

#[test]
fn enum_values_are_unique_and_non_empty() {
    for def in schema::all() {
        for f in def.fields {
            if let FieldKind::Enum(values) = f.kind {
                let unique: BTreeSet<_> = values.iter().collect();
                assert_eq!(unique.len(), values.len(), "{}.{}", def.entity_type, f.name);
                assert!(values.iter().all(|v| !v.is_empty()));
            }
        }
    }
}

#[test]
fn required_fields_are_settable_kinds() {
    for def in schema::all() {
        for f in def.fields.iter().filter(|f| f.required_on_create) {
            assert!(
                !matches!(f.kind, FieldKind::Object | FieldKind::DateTime),
                "{}.{} can't be supplied",
                def.entity_type,
                f.name
            );
        }
    }
}

#[test]
fn listed_relationship_types_exist_and_are_unique() {
    let names: BTreeSet<String> = crate::db::relationships::list_relationship_types()
        .into_iter()
        .map(|r| r.name)
        .collect();
    for def in schema::all() {
        let mut seen = BTreeSet::new();
        for r in def.relationship_types {
            assert!(names.contains(*r), "{} lists unknown {r}", def.entity_type);
            assert!(seen.insert(r), "{} lists {r} twice", def.entity_type);
        }
    }
}

#[test]
fn typed_relationship_ends_are_registered_or_embedded_types() {
    for rt in inventory::iter::<crate::db::relationships::RelationshipTypeDef>() {
        for end in [rt.from_type, rt.to_type].into_iter().flatten() {
            let embedded = inventory::iter::<schema::EmbeddedPageDef>().any(|d| d.page_type == end);
            assert!(
                schema::lookup(end).is_some() || embedded,
                "{} names unregistered {end}",
                rt.name
            );
        }
    }
}

#[test]
fn typed_relationship_types_are_listed_in_their_own_describe_output() {
    // Intended: every typed relationship type is listed by both of its ends, so
    // `describe` never hides a feature from agents.
    let mut missing = BTreeSet::new();
    for rt in inventory::iter::<crate::db::relationships::RelationshipTypeDef>() {
        for end in [rt.from_type, rt.to_type].into_iter().flatten() {
            if let Some(def) = schema::lookup(end) {
                if !def.relationship_types.contains(&rt.name) {
                    missing.insert(format!("{end}:{}", rt.name));
                }
            }
        }
    }
    assert!(missing.is_empty(), "hidden from describe: {missing:?}");
}

#[test]
fn course_note_is_the_one_to_one_embedded_page_relationship() {
    // Intended: `course-note` is the 1:1 link from a course to its embedded
    // `course_notes` page.
    let rt = crate::db::relationships::lookup_relationship_type("course-note")
        .expect("course-note relationship type is registered");
    assert_eq!(rt.from_type, Some("course"));
    assert_eq!(rt.to_type, Some("course_notes"));
    assert!(matches!(
        rt.cardinality,
        crate::db::relationships::Cardinality::OneToPerFrom
    ));
}

#[test]
fn course_notes_links_regular_notes_to_a_course_many() {
    // Intended: `course-notes` links any number of regular notes to a course.
    let rt = crate::db::relationships::lookup_relationship_type("course-notes")
        .expect("course-notes relationship type is registered");
    assert_eq!(rt.from_type, Some("course"));
    assert_eq!(rt.to_type, Some("note"));
    assert!(matches!(
        rt.cardinality,
        crate::db::relationships::Cardinality::Unrestricted
    ));
}

#[test]
fn course_notes_page_is_created_through_the_course_note_relationship() {
    let fx = fx();
    let course = cli(
        &fx.conn,
        &["course", "create", "--space", &fx.space, "--title", "C"],
    )
    .unwrap();
    let id = extract_id(&course["data"]).unwrap();
    cli(
        &fx.conn,
        &[
            "course",
            "add-block",
            &id,
            "--type",
            "paragraph",
            "--content",
            "Hi",
        ],
    )
    .unwrap();
    let rels = crate::db::relationships::list_relationships(
        &fx.conn,
        &id,
        crate::db::relationships::Direction::From,
    )
    .unwrap();
    let edge = rels
        .iter()
        .find(|r| r.relationship_type == "course-note")
        .expect("the notes page hangs off a course-note relationship");
    let page = crate::db::entities::get_entity(&fx.conn, &edge.to_entity_id).unwrap();
    assert_eq!(page.entity_type, "course_notes");
    assert!(
        !rels.iter().any(|r| r.relationship_type == "course-notes"),
        "course-notes is reserved for regular notes"
    );
}

#[test]
fn block_commands_appear_exactly_for_block_pages() {
    for def in schema::all() {
        let d = schema::describe_json(def);
        let embedded = schema::embedded_page(def.entity_type).is_some();
        assert_eq!(d["supportsBlocks"], def.supports_blocks || embedded);
        assert_eq!(
            d["blockCommands"].is_object(),
            def.supports_blocks || embedded
        );
        assert_eq!(d["blockPage"].is_object(), embedded);
        if let Some(bc) = d["blockCommands"].as_object() {
            let known = bc["knownBlockTypes"].as_array().unwrap();
            for t in schema::KNOWN_BLOCK_TYPES {
                assert!(known.contains(&json!(t)));
            }
            assert!(bc["add"].as_str().unwrap().contains(def.entity_type));
        }
    }
}

#[test]
fn block_verbs_are_refused_for_types_without_blocks() {
    let fx = fx();
    for def in schema::all() {
        let d = schema::describe_json(def);
        if d["supportsBlocks"] == true {
            continue;
        }
        let e = err_of(cli(&fx.conn, &[def.entity_type, "blocks", "x"]));
        assert!(
            e.to_string().contains("no block content"),
            "{}",
            def.entity_type
        );
    }
}

#[test]
fn child_collections_actions_and_conversions_are_consistent() {
    for def in schema::all() {
        let t = def.entity_type;
        let d = schema::describe_json(def);
        for c in d["childCollections"].as_array().unwrap() {
            assert!(!c["description"].as_str().unwrap().is_empty());
            for cmd in c["commands"].as_object().unwrap().values() {
                assert!(cmd
                    .as_str()
                    .unwrap()
                    .starts_with(&format!("nookly cli {t} ")));
            }
            let mut names = BTreeSet::new();
            for f in c["fields"].as_array().unwrap() {
                assert!(names.insert(f["name"].as_str().unwrap()));
                assert!(valid_kind(&f["kind"]));
            }
        }
        for a in d["entityActions"]
            .as_array()
            .unwrap()
            .iter()
            .chain(d["bulkActions"].as_array().unwrap())
        {
            assert!(!a["description"].as_str().unwrap().is_empty());
            assert!(a["command"]
                .as_str()
                .unwrap()
                .contains(&format!("{t} {}", a["name"].as_str().unwrap())));
        }
        for c in d["convertsTo"].as_array().unwrap() {
            assert!(schema::lookup(c["type"].as_str().unwrap()).is_some());
        }
    }
}

#[test]
fn action_and_child_verbs_do_not_shadow_the_generic_verbs() {
    let generic = [
        "list",
        "get",
        "create",
        "update",
        "duplicate",
        "convert",
        "delete",
        "restore",
        "blocks",
        "grep",
        "add-block",
        "update-block",
        "delete-block",
        "reorder-blocks",
    ];
    for def in schema::all() {
        for a in schema::entity_actions(def.entity_type) {
            assert!(!generic.contains(&a.name), "{}", a.name);
        }
        for a in schema::bulk_actions(def.entity_type) {
            assert!(!generic.contains(&a.name), "{}", a.name);
        }
        for c in schema::child_collections(def.entity_type) {
            assert!(!generic.contains(&c.plural), "{}", c.plural);
        }
    }
}

#[test]
fn schema_relationship_types_are_unique_and_complete() {
    let all = schema_all();
    let names: Vec<&str> = all["relationshipTypes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["name"].as_str().unwrap())
        .collect();
    let unique: BTreeSet<&str> = names.iter().copied().collect();
    assert_eq!(unique.len(), names.len());
    for rt in inventory::iter::<crate::db::relationships::RelationshipTypeDef>() {
        assert!(unique.contains(rt.name));
    }
}

#[test]
fn describe_errors() {
    let conn = crate::db::test_conn();
    let e = err_of(cli(&conn, &["describe", "unicorn"])).to_string();
    for def in schema::all() {
        assert!(e.contains(def.entity_type), "{e}");
    }
    let e = err_of(cli(&conn, &["describe"])).to_string();
    assert!(e.contains("<entity-type>"), "{e}");
    let e = err_of(cli(&conn, &["describe", "task", "--verbose"])).to_string();
    assert!(e.contains("--verbose"), "{e}");
    let e = err_of(cli(&conn, &["unicorn", "list"])).to_string();
    assert!(e.contains("unknown entity type 'unicorn'"), "{e}");
}

// --- argument layer --------------------------------------------------------------------------

fn parse(line: &[&str]) -> Args {
    parse_args(&line.iter().map(|s| s.to_string()).collect::<Vec<_>>()).unwrap()
}

#[test]
fn parse_splits_positionals_flags_and_bool_flags() {
    let a = parse(&[
        "one",
        "--space",
        "S",
        "two",
        "--yes",
        "three",
        "--summary",
        "four",
    ]);
    assert_eq!(a.positional, vec!["one", "two", "three", "four"]);
    assert_eq!(a.flags.get("space").map(String::as_str), Some("S"));
    assert!(a.bool_flags.contains("yes") && a.bool_flags.contains("summary"));
}

#[test]
fn parse_accepts_equals_form() {
    let a = parse(&["--title=Hello world", "--limit=5", "--empty="]);
    assert_eq!(a.flags["title"], "Hello world");
    assert_eq!(a.flags["limit"], "5");
    assert_eq!(a.flags["empty"], "");
}

#[test]
fn parse_treats_a_value_flag_before_another_flag_as_bool() {
    let a = parse(&["--title", "--space", "S"]);
    assert!(a.bool_flags.contains("title"));
    assert_eq!(a.flags["space"], "S");
    // A trailing value flag with nothing after it is bool too.
    assert!(parse(&["--icon"]).bool_flags.contains("icon"));
}

#[test]
fn parse_keeps_dash_leading_values() {
    let a = parse(&["--limit", "-1", "--title", "-x"]);
    assert_eq!(a.flags["limit"], "-1");
    assert_eq!(a.flags["title"], "-x");
}

#[test]
fn a_repeated_flag_is_refused() {
    // Intended: a flag given twice is InvalidInput, not silently last-wins.
    let fx = fx();
    let before = fingerprint(&fx.conn);
    let e = err_of(cli(
        &fx.conn,
        &[
            "task", "create", "--space", &fx.space, "--title", "First", "--title", "Second",
        ],
    ));
    assert_eq!(kind_of(&e), "InvalidInput", "{e}");
    assert_eq!(fingerprint(&fx.conn), before);
}

#[test]
fn parse_field_values_as_json_when_they_parse() {
    let a = parse(&[
        "--field",
        "n=3",
        "--field",
        "f=0.5",
        "--field",
        "b=false",
        "--field",
        "z=null",
        "--field",
        "s=\"3\"",
        "--field",
        "d=2026-01-05",
        "--field",
        "o={\"a\":1}",
        "--field",
        "eq=a=b",
        "--field",
        "e=",
    ]);
    assert_eq!(a.fields["n"], json!(3));
    assert_eq!(a.fields["f"], json!(0.5));
    assert_eq!(a.fields["b"], json!(false));
    assert_eq!(a.fields["z"], Value::Null);
    assert_eq!(a.fields["s"], json!("3"));
    assert_eq!(a.fields["d"], json!("2026-01-05"));
    assert_eq!(a.fields["o"], json!({"a": 1}));
    assert_eq!(a.fields["eq"], json!("a=b"));
    assert_eq!(a.fields["e"], json!(""));
}

#[test]
fn a_field_without_equals_is_refused() {
    // Intended: `--field professor` (no `=`) and a trailing bare `--field` are
    // InvalidInput, never silently dropped while the command succeeds.
    let fx = fx();
    let before = fingerprint(&fx.conn);
    for tail in [vec!["--field", "description"], vec!["--field"]] {
        let mut args = vec![
            "task",
            "create",
            "--space",
            fx.space.as_str(),
            "--title",
            "T",
        ];
        args.extend(tail.iter().copied());
        let e = err_of(cli(&fx.conn, &args));
        assert_eq!(kind_of(&e), "InvalidInput", "{tail:?}: {e}");
    }
    assert_eq!(fingerprint(&fx.conn), before);
}

#[test]
fn parse_collects_attrs_and_rejects_malformed_ones() {
    let a = parse(&[
        "--attr",
        "variant=warning",
        "--attr",
        "caption=A = B",
        "--attr",
        " title =x",
    ]);
    let attrs = a.attrs().unwrap();
    assert_eq!(attrs.get("variant").map(String::as_str), Some("warning"));
    assert_eq!(attrs.get("caption").map(String::as_str), Some("A = B"));
    assert_eq!(attrs.get("title").map(String::as_str), Some("x"));
    assert!(parse(&["--attr", "novalue"]).attrs().is_err());
}

#[test]
fn unknown_flags_are_reported_sorted_and_pluralized() {
    let a = parse(&["--zeta", "1", "--alpha", "--beta=2"]);
    let e = a.check_no_unknown_flags().unwrap_err().to_string();
    assert!(
        e.contains("unknown flags for this command: --alpha, --beta, --zeta"),
        "{e}"
    );
    let a = parse(&["--one", "1"]);
    let e = a.check_no_unknown_flags().unwrap_err().to_string();
    assert!(e.contains("unknown flag for this command: --one"), "{e}");
    let a = parse(&["--dry-run"]);
    assert!(a.check_no_unknown_flags().is_ok());
}

#[test]
fn has_bool_reads_both_forms() {
    assert!(parse(&["--yes"]).has_bool("yes"));
    assert!(parse(&["--yes=true"]).has_bool("yes"));
    assert!(!parse(&["--yes=false"]).has_bool("yes"));
    assert!(!parse(&[]).has_bool("yes"));
}

#[test]
fn usize_flag_and_require_messages() {
    assert_eq!(
        parse(&["--limit", "7"]).usize_flag("limit").unwrap(),
        Some(7)
    );
    assert_eq!(parse(&[]).usize_flag("limit").unwrap(), None);
    assert!(parse(&["--limit", "seven"]).usize_flag("limit").is_err());
    let e = parse(&[])
        .require_positional(0, "id")
        .unwrap_err()
        .to_string();
    assert!(e.contains("missing required argument: <id>"));
    let e = parse(&[]).require_flag("space").unwrap_err().to_string();
    assert!(e.contains("missing required flag: --space"));
    let e = parse(&[]).require_yes().unwrap_err().to_string();
    assert!(e.contains("pass --yes"));
    assert!(parse(&["--dry-run"]).require_yes().is_ok());
}

#[test]
fn a_title_that_looks_like_a_flag_needs_the_equals_form() {
    let fx = fx();
    let e = err_of(cli(
        &fx.conn,
        &["note", "create", "--space", &fx.space, "--title", "--draft"],
    ));
    assert!(e.to_string().contains("--title"), "{e}");
    let res = cli(
        &fx.conn,
        &["note", "create", "--space", &fx.space, "--title=--draft"],
    )
    .unwrap();
    assert_eq!(read(&res["data"], "title"), json!("--draft"));
}

#[test]
fn empty_titles_are_accepted() {
    let fx = fx();
    let res = cli(
        &fx.conn,
        &["note", "create", "--space", &fx.space, "--title="],
    )
    .unwrap();
    assert_eq!(read(&res["data"], "title"), json!(""));
}

#[test]
fn yes_is_refused_on_non_destructive_commands() {
    each_type(|fx, def, c| {
        let e = err_of(cli(
            &fx.conn,
            &[def.entity_type, "update", &c.id, "--title", "x", "--yes"],
        ));
        assert!(e.to_string().contains("--yes"), "{e}");
        assert!(cli(&fx.conn, &[def.entity_type, "get", &c.id, "--yes"]).is_err());
    });
}

#[test]
fn unknown_verbs_list_the_type_specific_verbs() {
    let conn = crate::db::test_conn();
    for def in schema::all() {
        let e = err_of(cli(&conn, &[def.entity_type, "frobnicate"])).to_string();
        assert!(e.contains("unknown verb 'frobnicate'"), "{e}");
        for c in schema::child_collections(def.entity_type) {
            assert!(
                e.contains(c.plural) && e.contains(&format!("add-{}", c.singular)),
                "{e}"
            );
        }
        for a in schema::entity_actions(def.entity_type) {
            assert!(e.contains(a.name), "{e}");
        }
        for a in schema::bulk_actions(def.entity_type) {
            assert!(e.contains(a.name), "{e}");
        }
    }
}

#[test]
fn help_has_one_shape_for_every_spelling() {
    let conn = crate::db::test_conn();
    let help = cli(&conn, &[]).unwrap();
    for spelling in ["help", "--help", "-h"] {
        assert_eq!(cli(&conn, &[spelling]).unwrap(), help);
    }
    let listed: Vec<&str> = help["entityCommands"]["entityTypes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    assert_eq!(
        listed,
        schema::all()
            .iter()
            .map(|d| d.entity_type)
            .collect::<Vec<_>>()
    );
    for key in ["usage", "note", "discovery", "safety", "coreCommands"] {
        assert!(help.get(key).is_some(), "{key}");
    }
}

#[test]
fn agent_instructions_is_json_wrapped_markdown() {
    let res = cli(&crate::db::test_conn(), &["agent-instructions"]).unwrap();
    let md = res["markdown"].as_str().unwrap();
    assert!(md.starts_with("# Nookly CLI agent guide"));
    for kind in [
        "NotFound",
        "UnknownRelationshipType",
        "CardinalityViolation",
        "InvalidInput",
        "Conflict",
        "Db",
        "Io",
        "Remote",
    ] {
        assert!(md.contains(kind), "{kind}");
    }
}

#[test]
fn error_json_shape_carries_kind_and_message() {
    let cases = [
        (AppError::NotFound("x".into()), "NotFound"),
        (
            AppError::UnknownRelationshipType("x".into()),
            "UnknownRelationshipType",
        ),
        (
            AppError::CardinalityViolation("x".into()),
            "CardinalityViolation",
        ),
        (AppError::InvalidInput("x".into()), "InvalidInput"),
        (AppError::Conflict("x".into()), "Conflict"),
        (AppError::Db("x".into()), "Db"),
        (AppError::Io("x".into()), "Io"),
        (AppError::Remote("x".into()), "Remote"),
    ];
    for (err, kind) in cases {
        let v = json!({ "error": err });
        assert_eq!(v["error"]["kind"], kind);
        assert_eq!(v["error"]["message"], "x");
        assert_eq!(v["error"].as_object().unwrap().len(), 2);
    }
}

// --- space, label, search ----------------------------------------------------------------------

#[test]
fn space_command_round_trip() {
    let conn = crate::db::test_conn();
    assert!(cli(&conn, &["space"]).unwrap()["delete"]
        .as_str()
        .unwrap()
        .contains("PERMANENT"));
    let s = cli(
        &conn,
        &[
            "space",
            "create",
            "--name",
            "Uni Ü ✨",
            "--color",
            "#123456",
        ],
    )
    .unwrap();
    let id = s["id"].as_str().unwrap().to_string();
    assert_eq!(s["name"], "Uni Ü ✨");
    assert!(cli(&conn, &["space", "create", "--name", "No color"]).is_err());
    let u = cli(&conn, &["space", "update", &id, "--name", "Renamed"]).unwrap();
    assert_eq!(u["name"], "Renamed");
    let s2 = cli(
        &conn,
        &["space", "create", "--name", "Two", "--color", "#000"],
    )
    .unwrap();
    let id2 = s2["id"].as_str().unwrap().to_string();
    let r = cli(&conn, &["space", "reorder", &id2, &id]).unwrap();
    assert_eq!(r["items"][0]["id"], json!(id2));
    assert!(cli(&conn, &["space", "reorder"]).is_err());
    assert!(cli(&conn, &["space", "delete", &id]).is_err());
    assert_eq!(cli(&conn, &["space", "list"]).unwrap()["count"], 2);
    cli(&conn, &["space", "delete", &id, "--yes"]).unwrap();
    assert_eq!(cli(&conn, &["space", "list"]).unwrap()["count"], 1);
    assert!(cli(&conn, &["space", "teleport"]).is_err());
}

#[test]
fn space_selection_is_by_id_only() {
    // `--space` takes an id; a name lists nothing rather than resolving.
    let fx = fx();
    cli(
        &fx.conn,
        &["note", "create", "--space", &fx.space, "--title", "N"],
    )
    .unwrap();
    assert_eq!(
        cli(&fx.conn, &["note", "list", "--space", &fx.space]).unwrap()["count"],
        1
    );
    assert_eq!(
        cli(&fx.conn, &["note", "list", "--space", "Gen"]).unwrap()["count"],
        0
    );
}

#[test]
fn label_command_attach_is_all_or_nothing() {
    let fx = fx();
    assert!(cli(&fx.conn, &["label"]).unwrap()["note"]
        .as_str()
        .unwrap()
        .contains("space-siloed"));
    let (note, key) = new_note(&fx, "N");
    let l = cli(
        &fx.conn,
        &[
            "label", "create", "--space", &fx.space, "--name", "Red", "--color", "#f00",
        ],
    )
    .unwrap();
    let lid = l["id"].as_str().unwrap().to_string();
    assert_eq!(
        cli(&fx.conn, &["label", "list", "--space", &fx.space]).unwrap()["count"],
        1
    );
    let res = cli(&fx.conn, &["label", "attach", &key, &lid]).unwrap();
    assert_eq!(res["toKey"], json!(key));
    assert_eq!(cli(&fx.conn, &["label", "get", &lid]).unwrap()["count"], 1);
    cli(&fx.conn, &["label", "detach", &note, &lid]).unwrap();
    assert_eq!(cli(&fx.conn, &["label", "get", &lid]).unwrap()["count"], 0);
    assert!(cli(&fx.conn, &["label", "attach", &note]).is_err());
    assert!(cli(&fx.conn, &["label", "delete", &lid]).is_err());
    cli(&fx.conn, &["label", "delete", &lid, "--yes"]).unwrap();
    assert!(cli(&fx.conn, &["label", "recolor"]).is_err());
}

#[test]
fn search_flags_are_validated() {
    let fx = fx();
    cli(
        &fx.conn,
        &[
            "note",
            "create",
            "--space",
            &fx.space,
            "--title",
            "Zebra crossing",
        ],
    )
    .unwrap();
    cli(
        &fx.conn,
        &[
            "task",
            "create",
            "--space",
            &fx.space,
            "--title",
            "Zebra task",
        ],
    )
    .unwrap();
    let all = cli(&fx.conn, &["search", "Zebra"]).unwrap();
    assert_eq!(all["count"], 2);
    let notes = cli(&fx.conn, &["search", "Zebra", "--type", "note"]).unwrap();
    assert_eq!(notes["count"], 1);
    let limited = cli(&fx.conn, &["search", "Zebra", "--limit", "1"]).unwrap();
    assert_eq!(
        (limited["count"].clone(), limited["returned"].clone()),
        (json!(2), json!(1))
    );
    assert_eq!(
        cli(&fx.conn, &["search", "Zebra", "--in", "content"]).unwrap()["count"],
        0
    );
    assert!(cli(&fx.conn, &["search", "Zebra", "--in", "body"]).is_err());
    assert!(cli(&fx.conn, &["search", "Zebra", "--type", "unicorn"]).is_err());
    assert!(cli(&fx.conn, &["search"]).is_err());
}

#[test]
fn search_finds_unicode_titles() {
    let fx = fx();
    cli(
        &fx.conn,
        &[
            "note",
            "create",
            "--space",
            &fx.space,
            "--title",
            "Grüße aus Köln",
        ],
    )
    .unwrap();
    let res = cli(&fx.conn, &["search", "Köln"]).unwrap();
    assert_eq!(res["count"], 1);
}

// --- view.rs ------------------------------------------------------------------------------------

#[test]
fn revision_is_stable_and_changes_with_content() {
    let a = json!({ "a": 1 });
    assert_eq!(view::revision(&a), view::revision(&json!({ "a": 1 })));
    assert_ne!(view::revision(&a), view::revision(&json!({ "a": 2 })));
    assert_eq!(view::revision(&a).len(), 16);
}

#[test]
fn size_hint_rounds_tokens_up() {
    assert_eq!(view::size_hint(0), json!({ "chars": 0, "approxTokens": 0 }));
    assert_eq!(view::size_hint(5), json!({ "chars": 5, "approxTokens": 2 }));
    assert_eq!(view::serialized_len(&json!("ab")), 4);
}

#[test]
fn lookup_prefers_the_top_level_and_follows_dotted_paths() {
    let v = json!({ "title": "top", "entity": { "title": "nested", "deep": { "x": 1 } } });
    assert_eq!(view::lookup(&v, "title"), Some(&json!("top")));
    assert_eq!(view::lookup(&v, "deep.x"), Some(&json!(1)));
    assert_eq!(view::lookup(&v, "entity.deep.x"), Some(&json!(1)));
    assert_eq!(view::lookup(&v, "missing"), None);
}

#[test]
fn summarize_reports_nested_paths_by_index() {
    let mut v = json!({ "items": [ { "body": "y".repeat(20) }, "short" ] });
    let t = view::summarize(&mut v, 5);
    assert_eq!(t["items.0.body"]["chars"], 20);
    assert_eq!(v["items"][1], "short");
    let mut unicode = json!("äöüäöüäöü");
    view::summarize(&mut unicode, 3);
    assert_eq!(unicode, "äöü…");
}

fn block(id: &str, block_type: &str, content: &str) -> crate::db::notes::Block {
    crate::db::notes::Block {
        id: id.into(),
        entity_id: "page".into(),
        position: 0,
        block_type: block_type.into(),
        content: content.into(),
        language: None,
        filename: None,
        attrs: Default::default(),
        created_at: String::new(),
        updated_at: String::new(),
    }
}

#[test]
fn outline_lists_headings_with_their_index() {
    let blocks = [
        block("a", "heading1", "Intro"),
        block("b", "paragraph", "x"),
        block("c", "heading3", "Deep"),
    ];
    let o = view::outline(&blocks);
    assert_eq!(o.len(), 2);
    assert_eq!(o[1]["blockIndex"], 2);
    assert_eq!(o[1]["type"], "heading3");
}

#[test]
fn bulleted_lists_use_bullets_and_empty_lists_have_one_item() {
    let b = block("a", "bulleted_list", "");
    let d = view::list_display(&b, None).unwrap();
    assert_eq!(d["items"].as_array().unwrap().len(), 1);
    let b = block("a", "bulleted_list", "x\ny");
    assert_eq!(
        view::list_display(&b, None).unwrap()["items"][1]["marker"],
        "•"
    );
    assert!(view::list_display(&block("p", "paragraph", "x"), None).is_none());
}

#[test]
fn grep_counts_past_max_and_adds_context() {
    let blocks = [
        block("a", "paragraph", "one\nTwo match\nthree"),
        block("b", "code", "match\nmatch"),
    ];
    let re = view::build_pattern("match", false, false).unwrap();
    let r = view::grep_blocks(&blocks, &re, 1, 2);
    assert_eq!(r.total, 3);
    assert_eq!(r.items.len(), 2);
    assert_eq!(r.items[0]["before"], json!(["one"]));
    assert_eq!(r.items[0]["after"], json!(["three"]));
    assert_eq!(r.items[1]["blockIndex"], 1);
    let none = view::grep_blocks(&blocks, &re, 0, 50);
    assert!(none.items[0].get("before").is_none());
}

#[test]
fn grep_windows_long_lines_around_the_match() {
    let line = format!("{}needle{}", "a".repeat(500), "b".repeat(500));
    let re = view::build_pattern("needle", false, false).unwrap();
    let r = view::grep_blocks(&[block("a", "paragraph", &line)], &re, 0, 5);
    let text = r.items[0]["text"].as_str().unwrap();
    assert!(text.starts_with('…') && text.ends_with('…'));
    assert!(text.contains("needle"));
    assert!(text.chars().count() <= 242);
}

#[test]
fn patterns_are_literal_and_case_insensitive_by_default() {
    let lit = view::build_pattern("a.b", false, false).unwrap();
    assert!(lit.is_match("A.B"));
    assert!(!lit.is_match("axb"));
    assert!(view::build_pattern("a.b", true, false)
        .unwrap()
        .is_match("axb"));
    assert!(!view::build_pattern("A", false, true).unwrap().is_match("a"));
    let e = view::build_pattern("(", true, false).unwrap_err();
    assert!(e.to_string().contains("invalid pattern"));
}

#[test]
fn diff_values_reports_nested_paths_and_line_diffs() {
    let before = json!({ "a": { "b": 1 }, "body": "x\ny", "gone": true });
    let after = json!({ "a": { "b": 2 }, "body": "x\nz", "new": 1 });
    let d = view::diff_values(&before, &after);
    let paths: Vec<&str> = d.iter().map(|c| c["path"].as_str().unwrap()).collect();
    assert_eq!(paths, vec!["a.b", "body", "gone", "new"]);
    assert_eq!(d[1]["diff"], json!(["  x", "- y", "+ z"]));
    assert_eq!(d[2]["after"], Value::Null);
    assert!(view::diff_values(&before, &before).is_empty());
}

#[test]
fn line_diff_of_equal_text_is_empty() {
    assert!(view::line_diff("a\nb", "a\nb").is_empty());
    assert_eq!(view::line_diff("", "a"), vec!["+ a"]);
}

#[test]
fn since_units_and_timestamps() {
    let now = chrono::Utc::now();
    for (raw, secs) in [("30m", 1800), ("2h", 7200), ("1d", 86400), ("1w", 604800)] {
        let ago = (now - view::parse_since(raw).unwrap()).num_seconds();
        assert!((secs - 5..=secs + 5).contains(&ago), "{raw}: {ago}");
    }
    assert!(view::parse_since(" 2026-09-20 ").is_ok());
    for bad in ["", "m", "5y", "2026-02-30", "-"] {
        assert!(view::parse_since(bad).is_err(), "{bad}");
    }
    assert!(view::parse_timestamp("2026-09-20T10:00:00Z").is_some());
    assert!(view::parse_timestamp("2026-09-20").is_none());
}

#[test]
fn get_summary_outline_and_blocks_paging_through_the_cli() {
    let fx = fx();
    let (note, _) = new_note(&fx, "Paged");
    for (t, c) in [
        ("heading1", "Top"),
        ("paragraph", &"long ".repeat(100)),
        ("heading2", "Sub"),
    ] {
        cli(
            &fx.conn,
            &["note", "add-block", &note, "--type", t, "--content", c],
        )
        .unwrap();
    }
    let s = cli(&fx.conn, &["note", "get", &note, "--summary"]).unwrap();
    assert_eq!(s["blockCount"], 3);
    assert_eq!(s["outline"].as_array().unwrap().len(), 2);
    assert!(s["truncated"]["body"].is_object());
    let page = cli(
        &fx.conn,
        &["note", "blocks", &note, "--offset", "1", "--limit", "1"],
    )
    .unwrap();
    assert_eq!(
        (page["count"].clone(), page["returned"].clone()),
        (json!(3), json!(1))
    );
    let g = cli(&fx.conn, &["note", "grep", &note, "SUB"]).unwrap();
    assert_eq!(g["count"], 1);
    assert!(cli(&fx.conn, &["note", "grep", &note, "(", "--regex"]).is_err());
}

/// The `view` attr stored on the only block of `note`, `None` when it has none.
fn stored_view(fx: &Fx, note: &str) -> Option<String> {
    let blocks = cli(&fx.conn, &["note", "blocks", note]).unwrap();
    blocks["items"][0]["attrs"]["view"]
        .as_str()
        .map(str::to_string)
}

#[test]
fn source_blocks_made_through_the_cli_start_on_the_preview() {
    for block_type in ["equation", "math", "diagram", "circuit"] {
        let fx = fx();
        let (note, _) = new_note(&fx, "Preview");
        cli(
            &fx.conn,
            &[
                "note",
                "add-block",
                &note,
                "--type",
                block_type,
                "--content",
                "x",
            ],
        )
        .unwrap();
        assert_eq!(
            stored_view(&fx, &note).as_deref(),
            Some("rendered"),
            "{block_type}"
        );
    }
}

#[test]
fn an_explicit_view_wins_over_the_cli_default() {
    let fx = fx();
    let (note, _) = new_note(&fx, "Source");
    cli(
        &fx.conn,
        &[
            "note",
            "add-block",
            &note,
            "--type",
            "math",
            "--content",
            "x",
            "--attr",
            "view=source",
        ],
    )
    .unwrap();
    assert_eq!(stored_view(&fx, &note).as_deref(), Some("source"));
}

#[test]
fn other_block_types_get_no_view_from_the_cli() {
    let fx = fx();
    let (note, _) = new_note(&fx, "Plain");
    cli(
        &fx.conn,
        &[
            "note",
            "add-block",
            &note,
            "--type",
            "paragraph",
            "--content",
            "x",
        ],
    )
    .unwrap();
    assert_eq!(stored_view(&fx, &note), None);
}

#[test]
fn a_task_repeat_rule_is_set_and_cleared_through_the_generic_update() {
    let fx = fx();
    let created = cli(
        &fx.conn,
        &[
            "task",
            "create",
            "--space",
            &fx.space,
            "--title",
            "Water plants",
        ],
    )
    .unwrap();
    let id = extract_id(&created["data"]).unwrap();
    // A JSON value on the command line, as an agent would write it.
    let set = cli(
        &fx.conn,
        &[
            "task",
            "update",
            &id,
            "--field",
            r#"repeat={"every":2,"unit":"week"}"#,
        ],
    )
    .unwrap();
    assert_eq!(set["data"]["repeat"], json!({ "every": 2, "unit": "week" }));
    let got = cli(&fx.conn, &["task", "get", &id]).unwrap();
    assert_eq!(got["data"]["repeat"], json!({ "every": 2, "unit": "week" }));
    // A rule that is out of range is refused and leaves the stored one alone.
    assert!(cli(
        &fx.conn,
        &[
            "task",
            "update",
            &id,
            "--field",
            r#"repeat={"every":0,"unit":"day"}"#
        ],
    )
    .is_err());
    assert!(cli(
        &fx.conn,
        &[
            "task",
            "update",
            &id,
            "--field",
            r#"repeat={"every":1,"unit":"year"}"#
        ],
    )
    .is_err());
    assert_eq!(
        cli(&fx.conn, &["task", "get", &id]).unwrap()["data"]["repeat"],
        json!({ "every": 2, "unit": "week" })
    );
    let cleared = cli(&fx.conn, &["task", "update", &id, "--field", "repeat=null"]).unwrap();
    assert!(cleared["data"]["repeat"].is_null());
}
