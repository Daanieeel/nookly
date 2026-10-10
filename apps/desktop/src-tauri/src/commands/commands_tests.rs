//! IPC level tests for `commands/`: each command is invoked through Tauri's
//! mock runtime with the exact JSON body the frontend sends, so argument
//! naming (camelCase), optional and `null` handling, and the serialized
//! `AppError` shape are checked end to end, then the database is checked.

use crate::db::{self, DbState};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};

/// Declares the commands the mock app registers, and their names for the
/// coverage cross check against `lib.rs`.
macro_rules! ipc_commands {
    ($($module:ident :: $command:ident),* $(,)?) => {
        const IPC_COMMANDS: &[&str] = &[$(stringify!($command)),*];
        fn handler() -> impl Fn(tauri::ipc::Invoke<MockRuntime>) -> bool + Send + Sync + 'static {
            tauri::generate_handler![$(crate::commands::$module::$command),*]
        }
    };
}

// Every registered command that does not take an `AppHandle` (which is fixed
// to the Wry runtime and so cannot run on the mock runtime).
ipc_commands![
    spaces::create_space,
    spaces::list_spaces,
    spaces::update_space,
    spaces::delete_space,
    spaces::reorder_spaces,
    spaces::list_space_modules,
    spaces::add_space_module,
    spaces::remove_space_module,
    spaces::reorder_space_modules,
    entities::create_entity,
    entities::get_entity,
    entities::update_entity,
    entities::list_entities,
    entities::touch_entity_opened,
    entities::soft_delete_entity,
    entities::restore_entity,
    entities::hard_delete_entity,
    entities::empty_trash,
    entities::duplicate_entity,
    entities::convert_entity,
    relationships::create_relationship,
    relationships::list_relationships,
    relationships::delete_relationship,
    relationships::list_relationship_types,
    search::search,
    search::list_embedded_page_ids,
    labels::create_label,
    labels::list_labels,
    labels::update_label,
    labels::delete_label,
    labels::attach_label,
    labels::detach_label,
    labels::list_labels_for_entity,
    labels::list_entity_label_ids,
    tasks::list_task_statuses,
    tasks::create_task,
    tasks::create_subtask,
    tasks::list_subtasks,
    tasks::subtask_progress,
    tasks::list_tasks,
    tasks::list_tasks_all,
    tasks::get_task,
    tasks::update_task_status,
    tasks::update_task_dates,
    tasks::update_task_effort,
    tasks::set_task_repeat,
    tasks::convert_to_subtask,
    tasks::count_tasks_due_today,
    tasks::count_open_tasks_due_or_overdue,
    tasks::list_open_tasks_due_or_overdue,
    notes::create_note,
    notes::create_jot,
    notes::count_unrefined_jots,
    notes::count_unrefined_jots_all_spaces,
    notes::list_unrefined_jots_all_spaces,
    notes::list_recent_notes,
    notes::list_note_summaries,
    notes::list_jot_summaries,
    notes::list_blocks,
    notes::list_mentioning_entities,
    notes::create_block,
    notes::update_block,
    notes::delete_block,
    notes::reorder_blocks,
    notes::render_page_markdown,
    notes::export_page_markdown,
    notes::export_page_json,
    notes::preview_page_json,
    notes::import_page_json,
    notes::preview_page_text,
    notes::import_page_text,
    notes::get_note_code_language,
    notes::set_note_code_language,
    courses::create_course,
    courses::list_courses,
    courses::create_semester,
    courses::list_semesters,
    courses::get_grade_report,
    courses::update_semester,
    courses::set_current_semester,
    courses::reorder_semesters,
    courses::link_course_to_semester,
    courses::set_course_semester,
    courses::get_course_notes,
    courses::get_semester_notes,
    courses::get_course_grades,
    courses::get_course_details,
    courses::update_course_professor,
    sessions::create_session_template,
    sessions::generate_occurrences,
    sessions::create_one_off_session,
    sessions::override_occurrence,
    sessions::list_sessions,
    sessions::list_sessions_all,
    sessions::list_sessions_today,
    sessions::list_sessions_between,
    sessions::update_session_series,
    sessions::delete_session_series,
    sessions::get_session_pages,
    sessions::create_session_page,
    sessions::link_session_page,
    calendar::create_calendar_entry_template,
    calendar::generate_calendar_entry_occurrences,
    calendar::create_one_off_calendar_entry,
    calendar::override_calendar_entry_occurrence,
    calendar::list_calendar_entries,
    calendar::list_calendar_entries_all,
    calendar::list_calendar_entry_templates,
    calendar::update_calendar_entry_series,
    calendar::delete_calendar_entry_series,
    exams::create_exam,
    exams::list_exams,
    exams::list_exams_all_spaces,
    exams::update_exam,
    exams::update_exam_date,
    exams::update_exam_weight,
    exams::update_exam_grade,
    exams::update_exam_room,
    exams::update_exam_time,
    exams::set_exam_course,
    decks::create_deck,
    decks::list_decks,
    decks::list_deck_summaries,
    decks::set_deck_exam,
    decks::deck_stats,
    decks::create_card,
    decks::update_card,
    decks::delete_card,
    decks::restore_card,
    decks::list_cards,
    decks::study_queue,
    decks::review_card,
    decks::undo_review,
    study_blocks::create_study_block,
    study_blocks::list_study_blocks,
    assignments::create_assignment,
    assignments::list_assignments,
    assignments::list_assignments_all_spaces,
    assignments::update_assignment_status,
    assignments::update_assignment_due_date,
    assignments::update_assignment_due_before_session,
    assignments::update_assignment_weight,
    assignments::set_assignment_course,
    recipes::create_recipe,
    recipes::list_recipes,
    recipes::get_recipe,
    recipes::update_recipe_kind,
    recipes::update_recipe_duration,
    recipes::list_recipe_tags,
    recipes::update_recipe_tags,
    recipes::list_ingredients,
    recipes::create_ingredient,
    recipes::update_ingredient,
    recipes::delete_ingredient,
    recipes::move_ingredient,
    recipes::list_steps,
    recipes::create_step,
    recipes::update_step,
    recipes::delete_step,
    recipes::move_step,
    views::create_view,
    views::list_views,
    views::get_view,
    views::reorder_views,
    views::reorder_overview_views,
    views::update_view_config,
    files::set_file_added_at,
    files::export_file,
    files::list_open_with_apps,
    office::office_converter_available,
    office_install::libreoffice_install_options,
    bookmarks::create_bookmark,
    bookmarks::list_bookmarks,
    bookmarks::get_bookmark,
    bookmarks::fetch_bookmark_metadata,
    bookmarks::update_bookmark_url,
    bookmarks::set_bookmark_preferred_image,
    cli_install::cli_install_status,
    external_calendars::external_calendar_status,
    external_calendars::cancel_google_calendar_connect,
    external_calendars::connect_icloud_calendar,
    external_calendars::set_external_calendar_selected,
    external_calendars::disconnect_external_calendar,
    external_calendars::sync_external_calendars,
    external_calendars::list_external_events,
    backup::list_backups,
    backup::inspect_backup,
];

/// Registered commands that cannot be invoked here, each with the test(s)
/// covering the part that can run without the real runtime, a network, an
/// install or the OS keychain.
const NOT_INVOKED: &[(&str, &str)] = &[
    // `AppHandle` (Wry) parameter: the database part each one delegates to.
    ("import_file", "files_import_underlying_db_call"),
    (
        "import_file_from_url",
        "files_link_imports_reject_bad_urls_offline",
    ),
    (
        "import_file_from_bytes",
        "files_pasted_bytes_underlying_db_call",
    ),
    (
        "download_linked_file",
        "files_link_imports_reject_bad_urls_offline",
    ),
    (
        "replace_file",
        "files_reference_copy_and_replace_underlying_db_calls",
    ),
    (
        "reference_file",
        "files_reference_copy_and_replace_underlying_db_calls",
    ),
    (
        "copy_file_into_storage",
        "files_reference_copy_and_replace_underlying_db_calls",
    ),
    (
        "open_file",
        "files_open_reveal_and_open_with_resolve_the_path",
    ),
    (
        "reveal_file",
        "files_open_reveal_and_open_with_resolve_the_path",
    ),
    (
        "open_file_with",
        "files_open_reveal_and_open_with_resolve_the_path",
    ),
    ("list_files", "files_list_and_get_underlying_db_calls"),
    (
        "reindex_missing_files",
        "files_reindex_missing_matches_the_db_summary",
    ),
    ("get_file", "files_list_and_get_underlying_db_calls"),
    ("set_recipe_banner", "recipes_set_banner_underlying_db_call"),
    (
        "convert_office_to_pdf",
        "office_convert_has_no_link_only_source",
    ),
    ("office_thumbnail", "office_convert_has_no_link_only_source"),
    (
        "install_libreoffice",
        "office_install_options_are_platform_facts",
    ),
    (
        "capture_bookmark_screenshot",
        "bookmarks_screenshot_path_is_recorded",
    ),
    (
        "connect_google_calendar",
        "external_calendars_status_without_connections",
    ),
    (
        "create_backup",
        "backup_create_and_restore_underlying_calls",
    ),
    (
        "restore_backup",
        "backup_create_and_restore_underlying_calls",
    ),
    // `AppHandle` parameter: each resolves the folder, then calls the same functions.
    ("agent_dir_path", "agent_files_underlying_calls"),
    ("list_agent_files", "agent_files_underlying_calls"),
    ("read_agent_file", "agent_files_underlying_calls"),
    ("write_agent_file", "agent_files_underlying_calls"),
    ("delete_agent_file", "agent_files_underlying_calls"),
    ("reveal_agent_dir", "agent_files_underlying_calls"),
    // `AppHandle` parameter, and it opens an app: the part that can run is the file it makes.
    (
        "open_settings_file",
        "settings_file_is_created_without_touching_an_existing_one",
    ),
    // Creates a symlink on the user's PATH: never run from a test.
    ("install_cli", "cli_install_status_reports_this_platform"),
];

/// A temporary directory removed on drop.
struct TempDir(PathBuf);

impl TempDir {
    fn new() -> Self {
        let dir = std::env::temp_dir().join(format!("nookly-commands-test-{}", db::new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }

    fn path(&self) -> &std::path::Path {
        &self.0
    }

    fn file(&self, name: &str, contents: &[u8]) -> PathBuf {
        let path = self.0.join(name);
        std::fs::write(&path, contents).unwrap();
        path
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// A mock app with a fresh migrated in-memory database.
struct Harness {
    app: tauri::App<MockRuntime>,
    webview: WebviewWindow<MockRuntime>,
    dir: TempDir,
}

impl Harness {
    fn new() -> Self {
        Self::with_external_store(None)
    }

    /// `store` is the raw `external-calendars.json` to start from.
    fn with_external_store(store: Option<Value>) -> Self {
        let dir = TempDir::new();
        if let Some(store) = store {
            dir.file("external-calendars.json", store.to_string().as_bytes());
        }
        let app = mock_builder()
            .manage(DbState(Mutex::new(db::test_conn())))
            .manage(crate::external_calendars::ExternalCalendarState::load(
                dir.path(),
            ))
            .invoke_handler(handler())
            .build(mock_context(noop_assets()))
            .unwrap();
        let webview = WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        Self { app, webview, dir }
    }

    /// Invokes `cmd` with `args` as its JSON body, like `invoke(cmd, args)` in
    /// the frontend. `Err` holds the serialized error.
    fn call(&self, cmd: &str, args: Value) -> Result<Value, Value> {
        get_ipc_response(
            &self.webview,
            InvokeRequest {
                cmd: cmd.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: if cfg!(windows) {
                    "http://tauri.localhost"
                } else {
                    "tauri://localhost"
                }
                .parse()
                .unwrap(),
                body: InvokeBody::Json(args),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize::<Value>().unwrap())
    }

    /// `call`, expecting success.
    #[track_caller]
    fn ok(&self, cmd: &str, args: Value) -> Value {
        match self.call(cmd, args) {
            Ok(value) => value,
            Err(err) => panic!("{cmd} failed: {err}"),
        }
    }

    /// `call`, expecting a serialized `AppError` of `kind`; returns its message.
    #[track_caller]
    fn app_err(&self, cmd: &str, args: Value, kind: &str) -> String {
        match self.call(cmd, args) {
            Ok(value) => panic!("{cmd} unexpectedly returned {value}"),
            Err(err) => {
                assert_eq!(err["kind"], kind, "{cmd}: {err}");
                err["message"].as_str().unwrap_or_default().to_string()
            }
        }
    }

    /// `call`, expecting Tauri to reject the arguments before the command runs.
    #[track_caller]
    fn args_err(&self, cmd: &str, args: Value) -> String {
        match self.call(cmd, args) {
            Ok(value) => panic!("{cmd} unexpectedly returned {value}"),
            Err(Value::String(message)) => {
                assert!(message.contains(cmd), "{message}");
                message
            }
            Err(other) => panic!("{cmd}: expected an argument error, got {other}"),
        }
    }

    /// Runs `f` with the database. The lock is released before returning, so
    /// never call a command from inside `f`.
    fn db<T>(&self, f: impl FnOnce(&Connection) -> T) -> T {
        let state = self.app.state::<DbState>();
        let conn = state.0.lock().unwrap();
        f(&conn)
    }

    fn space(&self, name: &str) -> String {
        self.ok(
            "create_space",
            json!({ "name": name, "icon": null, "color": "#123456" }),
        )["id"]
            .as_str()
            .unwrap()
            .to_string()
    }

    fn course(&self, space_id: &str, title: &str) -> String {
        id_of(&self.ok(
            "create_course",
            json!({ "spaceId": space_id, "title": title }),
        ))
    }

    fn note(&self, space_id: &str, title: &str) -> String {
        id_of(&self.ok(
            "create_note",
            json!({ "spaceId": space_id, "title": title }),
        ))
    }
}

/// The id of an `Entity`, or of the `entity` a module record wraps.
fn id_of(value: &Value) -> String {
    value
        .get("entity")
        .unwrap_or(value)
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_else(|| panic!("no id in {value}"))
        .to_string()
}

fn to_json<T: serde::Serialize>(value: T) -> Value {
    serde_json::to_value(value).unwrap()
}

/// Index cards without `next`, the due times each rating would give, which
/// are computed from the current instant on every read.
fn without_next(mut cards: Value) -> Value {
    for card in cards.as_array_mut().unwrap() {
        card.as_object_mut().unwrap().remove("next");
    }
    cards
}

const MISSING: &str = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------- coverage

#[test]
fn every_registered_command_is_covered() {
    let lib = include_str!("../lib.rs");
    let start = lib.find("generate_handler![").unwrap() + "generate_handler![".len();
    let end = start + lib[start..].find("])").unwrap();
    let registered: std::collections::BTreeSet<&str> = lib[start..end]
        .split(',')
        .filter_map(|item| item.trim().strip_prefix("commands::"))
        .map(|path| path.rsplit("::").next().unwrap())
        .collect();
    assert!(registered.len() > 150, "parsed {}", registered.len());

    let mut covered = std::collections::BTreeSet::new();
    for name in IPC_COMMANDS
        .iter()
        .chain(NOT_INVOKED.iter().map(|(name, _)| name))
    {
        assert!(covered.insert(*name), "{name} is listed twice");
    }
    let unregistered: Vec<_> = covered.difference(&registered).collect();
    assert!(unregistered.is_empty(), "not in lib.rs: {unregistered:?}");
    let untested: Vec<_> = registered.difference(&covered).collect();
    assert!(untested.is_empty(), "no test for: {untested:?}");

    // Every IPC command is actually called by name somewhere below the two
    // lists, and every NOT_INVOKED entry names a test that exists.
    let source = include_str!("commands_tests.rs");
    let body = &source[source
        .find("/// A temporary directory removed on drop.")
        .unwrap()..];
    for name in IPC_COMMANDS {
        assert!(
            body.contains(&format!("\"{name}\"")),
            "{name} is registered but never invoked"
        );
    }
    for (_, test) in NOT_INVOKED {
        assert!(
            source.contains(&format!("fn {test}()")),
            "missing test {test}"
        );
    }
}

#[test]
fn unknown_command_is_rejected() {
    let h = Harness::new();
    let err = h.call("no_such_command", json!({})).unwrap_err();
    assert!(err.as_str().unwrap().contains("no_such_command"), "{err}");
}

// ------------------------------------------------------------------ spaces

#[test]
fn spaces_create_and_list_match_the_db() {
    let h = Harness::new();
    let created = h.ok(
        "create_space",
        json!({ "name": "Uni", "icon": "book", "color": "#ff0000" }),
    );
    assert_eq!(created["name"], "Uni");
    assert_eq!(created["icon"], "book");
    assert_eq!(created["color"], "#ff0000");
    let listed = h.ok("list_spaces", json!({}));
    let expected = h.db(|c| to_json(db::spaces::list_spaces(c).unwrap()));
    assert_eq!(listed, expected);
    assert_eq!(listed.as_array().unwrap().len(), 1);
}

#[test]
fn spaces_create_accepts_a_missing_icon_key() {
    let h = Harness::new();
    let created = h.ok("create_space", json!({ "name": "A", "color": "#000" }));
    assert_eq!(created["icon"], Value::Null);
}

#[test]
fn spaces_create_rejects_missing_or_mistyped_args() {
    let h = Harness::new();
    let message = h.args_err("create_space", json!({ "name": "A" }));
    assert!(message.contains("color"), "{message}");
    // snake_case keys are not what the frontend sends and are not accepted.
    h.args_err(
        "create_space",
        json!({ "name": "A", "icon": null, "colour": "#000" }),
    );
    h.args_err(
        "create_space",
        json!({ "name": 5, "icon": null, "color": "#000" }),
    );
}

#[test]
fn spaces_update_applies_a_partial_patch() {
    let h = Harness::new();
    let id = h.space("Old");
    let updated = h.ok(
        "update_space",
        json!({ "id": id, "patch": { "name": "New" } }),
    );
    assert_eq!(updated["name"], "New");
    assert_eq!(updated["color"], "#123456");
    let stored = h.db(|c| db::spaces::list_spaces(c).unwrap());
    assert_eq!(stored[0].name, "New");
}

#[test]
fn spaces_update_unknown_id_is_not_found() {
    let h = Harness::new();
    let message = h.app_err(
        "update_space",
        json!({ "id": MISSING, "patch": {} }),
        "NotFound",
    );
    assert!(message.contains(MISSING), "{message}");
}

#[test]
fn spaces_delete_removes_the_space() {
    let h = Harness::new();
    let id = h.space("Gone");
    h.note(&id, "a note");
    assert_eq!(h.ok("delete_space", json!({ "id": id })), Value::Null);
    assert!(h.db(|c| db::spaces::list_spaces(c).unwrap()).is_empty());
}

#[test]
fn spaces_reorder_follows_the_given_ids() {
    let h = Harness::new();
    let a = h.space("A");
    let b = h.space("B");
    h.ok("reorder_spaces", json!({ "orderedIds": [b, a] }));
    let names: Vec<String> = h.db(|c| {
        db::spaces::list_spaces(c)
            .unwrap()
            .into_iter()
            .map(|s| s.name)
            .collect()
    });
    assert_eq!(names, ["B", "A"]);
}

#[test]
fn spaces_modules_add_list_reorder_remove() {
    let h = Harness::new();
    let space = h.space("S");
    h.ok(
        "add_space_module",
        json!({ "spaceId": space, "moduleKey": "tasks" }),
    );
    h.ok(
        "add_space_module",
        json!({ "spaceId": space, "moduleKey": "notes" }),
    );
    let listed = h.ok("list_space_modules", json!({ "spaceId": space }));
    let expected = h.db(|c| to_json(db::space_modules::list_space_modules(c, &space).unwrap()));
    assert_eq!(listed, expected);
    assert!(listed.as_array().unwrap().contains(&json!("tasks")));

    let mut reversed: Vec<Value> = listed.as_array().unwrap().clone();
    reversed.reverse();
    h.ok(
        "reorder_space_modules",
        json!({ "spaceId": space, "orderedKeys": reversed }),
    );
    assert_eq!(
        h.ok("list_space_modules", json!({ "spaceId": space })),
        Value::Array(reversed)
    );

    h.ok(
        "remove_space_module",
        json!({ "spaceId": space, "moduleKey": "tasks", "deleteContent": false }),
    );
    let after = h.ok("list_space_modules", json!({ "spaceId": space }));
    assert!(!after.as_array().unwrap().contains(&json!("tasks")));
}

#[test]
fn spaces_remove_module_hides_or_trashes_its_content() {
    let h = Harness::new();
    let space = h.space("S");
    let kept = id_of(&h.ok(
        "create_task",
        json!({ "spaceId": space, "title": "t", "startDate": null, "dueDate": null }),
    ));
    h.ok(
        "remove_space_module",
        json!({ "spaceId": space, "moduleKey": "tasks", "deleteContent": false }),
    );
    let hidden_at = |h: &Harness| {
        h.db(|c| {
            c.query_row(
                "SELECT hidden_at FROM entities WHERE id = ?1",
                [&kept],
                |row| row.get::<_, Option<String>>(0),
            )
            .unwrap()
        })
    };
    assert!(hidden_at(&h).is_some(), "hidden, kept for later");
    assert!(h
        .ok("list_tasks", json!({ "spaceId": space }))
        .as_array()
        .unwrap()
        .is_empty());

    h.ok(
        "add_space_module",
        json!({ "spaceId": space, "moduleKey": "tasks" }),
    );
    assert_eq!(
        h.ok("list_tasks", json!({ "spaceId": space }))
            .as_array()
            .unwrap()
            .len(),
        1
    );

    h.ok(
        "remove_space_module",
        json!({ "spaceId": space, "moduleKey": "tasks", "deleteContent": true }),
    );
    let entity = h.db(|c| db::entities::get_entity(c, &kept).unwrap());
    assert!(entity.deleted_at.is_some(), "moved to Trash");
    assert!(hidden_at(&h).is_none(), "a trashed entity is not hidden");
}

#[test]
fn spaces_remove_module_requires_delete_content() {
    let h = Harness::new();
    let space = h.space("S");
    let message = h.args_err(
        "remove_space_module",
        json!({ "spaceId": space, "moduleKey": "tasks" }),
    );
    assert!(message.contains("deleteContent"), "{message}");
}

#[test]
fn spaces_remove_unknown_module_is_invalid_input() {
    let h = Harness::new();
    let space = h.space("S");
    h.app_err(
        "remove_space_module",
        json!({ "spaceId": space, "moduleKey": "nope", "deleteContent": false }),
        "InvalidInput",
    );
}

// ---------------------------------------------------------------- entities

#[test]
fn entities_create_takes_the_type_key() {
    let h = Harness::new();
    let space = h.space("S");
    let created = h.ok(
        "create_entity",
        json!({ "spaceId": space, "type": "note", "title": "Hello", "icon": null }),
    );
    assert_eq!(created["type"], "note");
    assert_eq!(created["spaceId"], space.as_str());
    let fetched = h.ok("get_entity", json!({ "id": created["id"] }));
    let expected =
        h.db(|c| to_json(db::entities::get_entity(c, created["id"].as_str().unwrap()).unwrap()));
    assert_eq!(fetched, expected);
    assert_eq!(fetched, created);
}

#[test]
fn entities_create_in_unknown_space_is_not_found() {
    let h = Harness::new();
    // An unknown Space is a NotFound naming the Space, not a raw SQLite error.
    let message = h.app_err(
        "create_entity",
        json!({ "spaceId": MISSING, "type": "note", "title": "x", "icon": null }),
        "NotFound",
    );
    assert!(message.starts_with("space"), "{message}");
    assert!(h
        .db(|c| db::entities::list_entities(c, None, true).unwrap())
        .is_empty());
}

#[test]
fn entities_get_unknown_is_not_found() {
    let h = Harness::new();
    let message = h.app_err("get_entity", json!({ "id": MISSING }), "NotFound");
    assert!(message.starts_with("entity"), "{message}");
}

#[test]
fn entities_list_with_null_space_lists_every_space() {
    let h = Harness::new();
    let a = h.space("A");
    let b = h.space("B");
    h.note(&a, "one");
    h.note(&b, "two");
    let all = h.ok(
        "list_entities",
        json!({ "spaceId": null, "includeDeleted": false }),
    );
    assert_eq!(
        all,
        h.db(|c| to_json(db::entities::list_entities(c, None, false).unwrap()))
    );
    let only_a = h.ok(
        "list_entities",
        json!({ "spaceId": a, "includeDeleted": false }),
    );
    assert_eq!(
        only_a,
        h.db(|c| to_json(db::entities::list_entities(c, Some(&a), false).unwrap()))
    );
    assert!(only_a.as_array().unwrap().len() < all.as_array().unwrap().len());
}

#[test]
fn entities_list_requires_include_deleted() {
    let h = Harness::new();
    h.args_err("list_entities", json!({ "spaceId": null }));
}

#[test]
fn entities_update_patches_title_and_pinned() {
    let h = Harness::new();
    let space = h.space("S");
    let id = h.note(&space, "Before");
    let updated = h.ok(
        "update_entity",
        json!({ "id": id, "patch": { "title": "After", "pinned": true } }),
    );
    assert_eq!(updated["title"], "After");
    assert_eq!(updated["pinned"], true);
    let stored = h.db(|c| db::entities::get_entity(c, &id).unwrap());
    assert_eq!(stored.title, "After");
    assert!(stored.pinned);
}

#[test]
fn entities_update_moves_to_another_space() {
    let h = Harness::new();
    let a = h.space("A");
    let b = h.space("B");
    let id = h.note(&a, "n");
    h.ok(
        "update_entity",
        json!({ "id": id, "patch": { "spaceId": b } }),
    );
    assert_eq!(
        h.db(|c| db::entities::get_entity(c, &id).unwrap().space_id),
        b
    );
}

#[test]
fn entities_update_unknown_is_not_found() {
    let h = Harness::new();
    h.app_err(
        "update_entity",
        json!({ "id": MISSING, "patch": { "title": "x" } }),
        "NotFound",
    );
}

#[test]
fn entities_touch_opened_succeeds() {
    let h = Harness::new();
    let space = h.space("S");
    let id = h.note(&space, "n");
    assert_eq!(
        h.ok("touch_entity_opened", json!({ "id": id })),
        Value::Null
    );
}

#[test]
fn entities_soft_delete_restore_and_empty_trash() {
    let h = Harness::new();
    let space = h.space("S");
    let keep = h.note(&space, "keep");
    let drop = h.note(&space, "drop");
    h.ok("soft_delete_entity", json!({ "id": keep }));
    assert!(h.db(|c| db::entities::get_entity(c, &keep)
        .unwrap()
        .deleted_at
        .is_some()));
    h.ok("restore_entity", json!({ "id": keep }));
    assert!(h.db(|c| db::entities::get_entity(c, &keep)
        .unwrap()
        .deleted_at
        .is_none()));

    h.ok("soft_delete_entity", json!({ "id": drop }));
    assert_eq!(h.ok("empty_trash", json!({})), json!(1));
    h.app_err("get_entity", json!({ "id": drop }), "NotFound");
    // The live note survives emptying the Trash.
    h.ok("get_entity", json!({ "id": keep }));
}

#[test]
fn entities_soft_delete_unknown_is_not_found() {
    let h = Harness::new();
    h.app_err("soft_delete_entity", json!({ "id": MISSING }), "NotFound");
}

#[test]
fn entities_restore_a_live_entity_is_not_found() {
    let h = Harness::new();
    let space = h.space("S");
    let id = h.note(&space, "live");
    h.app_err("restore_entity", json!({ "id": id }), "NotFound");
}

#[test]
fn entities_hard_delete_only_takes_trashed_entities() {
    let h = Harness::new();
    let space = h.space("S");
    let id = h.note(&space, "n");
    // A live entity is never hard deleted: it has to go through the Trash.
    h.app_err("hard_delete_entity", json!({ "id": id }), "NotFound");
    h.ok("get_entity", json!({ "id": id }));
    h.ok("soft_delete_entity", json!({ "id": id }));
    h.ok("hard_delete_entity", json!({ "id": id }));
    h.app_err("get_entity", json!({ "id": id }), "NotFound");
}

#[test]
fn entities_empty_trash_with_nothing_trashed_is_zero() {
    let h = Harness::new();
    let space = h.space("S");
    h.note(&space, "n");
    assert_eq!(h.ok("empty_trash", json!(null)), json!(0));
}

#[test]
fn entities_duplicate_returns_the_copy() {
    let h = Harness::new();
    let space = h.space("S");
    let id = h.note(&space, "Original");
    let copy = h.ok("duplicate_entity", json!({ "id": id }));
    assert_ne!(copy["id"], json!(id));
    assert_eq!(copy["spaceId"], json!(space));
    assert!(copy["title"].as_str().unwrap().contains("Original"));
    assert_eq!(
        copy,
        h.db(|c| to_json(db::entities::get_entity(c, copy["id"].as_str().unwrap()).unwrap()))
    );
}

#[test]
fn entities_duplicate_unknown_is_not_found() {
    let h = Harness::new();
    h.app_err("duplicate_entity", json!({ "id": MISSING }), "NotFound");
}

#[test]
fn entities_convert_rejects_an_unregistered_conversion() {
    let h = Harness::new();
    let space = h.space("S");
    let id = h.note(&space, "n");
    h.app_err(
        "convert_entity",
        json!({ "id": id, "to": "recipe" }),
        "InvalidInput",
    );
    assert_eq!(
        h.db(|c| db::entities::get_entity(c, &id).unwrap().entity_type),
        "note"
    );
}

#[test]
fn entities_convert_requires_to() {
    let h = Harness::new();
    h.args_err("convert_entity", json!({ "id": MISSING }));
}

// ----------------------------------------------------------- relationships

#[test]
fn relationships_create_list_delete() {
    let h = Harness::new();
    let space = h.space("S");
    let a = h.note(&space, "a");
    let b = h.note(&space, "b");
    let rel = h.ok(
        "create_relationship",
        json!({
            "fromEntityId": a,
            "toEntityId": b,
            "relationshipType": "relates-to",
            "fromBlockId": null,
            "toBlockId": null,
        }),
    );
    assert_eq!(rel["fromEntityId"], json!(a));
    let both = h.ok(
        "list_relationships",
        json!({ "entityId": a, "direction": "both" }),
    );
    assert_eq!(
        both,
        h.db(|c| to_json(
            db::relationships::list_relationships(c, &a, db::relationships::Direction::Both)
                .unwrap()
        ))
    );
    assert_eq!(both.as_array().unwrap().len(), 1);
    let from_b = h.ok(
        "list_relationships",
        json!({ "entityId": b, "direction": "from" }),
    );
    assert!(from_b.as_array().unwrap().is_empty());
    let to_b = h.ok(
        "list_relationships",
        json!({ "entityId": b, "direction": "to" }),
    );
    assert_eq!(to_b.as_array().unwrap().len(), 1);

    h.ok("delete_relationship", json!({ "id": rel["id"] }));
    assert!(h
        .ok(
            "list_relationships",
            json!({ "entityId": a, "direction": "both" })
        )
        .as_array()
        .unwrap()
        .is_empty());
}

#[test]
fn relationships_unknown_direction_means_both() {
    let h = Harness::new();
    let space = h.space("S");
    let a = h.note(&space, "a");
    let b = h.note(&space, "b");
    h.ok(
        "create_relationship",
        json!({ "fromEntityId": b, "toEntityId": a, "relationshipType": "relates-to" }),
    );
    let listed = h.ok(
        "list_relationships",
        json!({ "entityId": a, "direction": "sideways" }),
    );
    assert_eq!(listed.as_array().unwrap().len(), 1);
}

#[test]
fn relationships_unknown_type_is_rejected() {
    let h = Harness::new();
    let space = h.space("S");
    let a = h.note(&space, "a");
    let b = h.note(&space, "b");
    let message = h.app_err(
        "create_relationship",
        json!({ "fromEntityId": a, "toEntityId": b, "relationshipType": "nope" }),
        "UnknownRelationshipType",
    );
    assert_eq!(message, "nope");
}

#[test]
fn relationships_unknown_entity_is_not_found() {
    let h = Harness::new();
    let space = h.space("S");
    let a = h.note(&space, "a");
    h.app_err(
        "create_relationship",
        json!({ "fromEntityId": a, "toEntityId": MISSING, "relationshipType": "relates-to" }),
        "NotFound",
    );
}

#[test]
fn relationships_delete_unknown_is_not_found() {
    let h = Harness::new();
    h.app_err("delete_relationship", json!({ "id": MISSING }), "NotFound");
}

#[test]
fn relationships_types_match_the_registry() {
    let h = Harness::new();
    let types = h.ok("list_relationship_types", json!({}));
    assert_eq!(types, to_json(db::relationships::list_relationship_types()));
    assert!(types
        .as_array()
        .unwrap()
        .iter()
        .any(|t| t["name"] == "relates-to"));
}

// ------------------------------------------------------------------ search

#[test]
fn search_finds_titles_and_null_space_is_global() {
    let h = Harness::new();
    let a = h.space("A");
    let b = h.space("B");
    h.note(&a, "Quantum mechanics");
    h.note(&b, "Quantum computing");
    let global = h.ok("search", json!({ "query": "Quantum", "spaceId": null }));
    assert_eq!(
        global,
        h.db(|c| to_json(db::search::search(c, "Quantum", None).unwrap()))
    );
    assert_eq!(global.as_array().unwrap().len(), 2);
    let scoped = h.ok("search", json!({ "query": "Quantum", "spaceId": a }));
    assert_eq!(scoped.as_array().unwrap().len(), 1);
    // `spaceId` left out entirely behaves like null.
    assert_eq!(h.ok("search", json!({ "query": "Quantum" })), global);
}

#[test]
fn search_empty_query_returns_nothing() {
    let h = Harness::new();
    let a = h.space("A");
    h.note(&a, "Something");
    let hits = h.ok("search", json!({ "query": "", "spaceId": null }));
    assert_eq!(
        hits,
        h.db(|c| to_json(db::search::search(c, "", None).unwrap()))
    );
}

#[test]
fn search_embedded_page_ids_include_course_notes() {
    let h = Harness::new();
    let space = h.space("S");
    let course = h.course(&space, "Algebra");
    let notes = h.ok("get_course_notes", json!({ "courseId": course }));
    let ids = h.ok("list_embedded_page_ids", json!({}));
    assert!(ids.as_array().unwrap().contains(&notes["id"]), "{ids}");
    assert_eq!(
        ids,
        h.db(|c| to_json(db::search::list_embedded_page_ids(c).unwrap()))
    );
}

// ------------------------------------------------------------------ labels

#[test]
fn labels_create_list_update_delete() {
    let h = Harness::new();
    let space = h.space("S");
    let label = h.ok(
        "create_label",
        json!({ "spaceId": space, "name": "urgent", "color": "#f00" }),
    );
    let listed = h.ok("list_labels", json!({ "spaceId": space }));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::labels::list_labels(c, &space).unwrap()))
    );
    assert_eq!(listed.as_array().unwrap().len(), 1);

    // The frontend sends `null` for the field it leaves alone.
    let renamed = h.ok(
        "update_label",
        json!({ "id": label["id"], "name": "later", "color": null }),
    );
    assert_eq!(renamed["name"], "later");
    assert_eq!(renamed["color"], "#f00");

    h.ok("delete_label", json!({ "id": label["id"] }));
    assert!(h
        .ok("list_labels", json!({ "spaceId": space }))
        .as_array()
        .unwrap()
        .is_empty());
}

#[test]
fn labels_update_unknown_is_not_found() {
    let h = Harness::new();
    h.app_err(
        "update_label",
        json!({ "id": MISSING, "name": "x", "color": null }),
        "NotFound",
    );
}

#[test]
fn labels_attach_detach_and_lookups() {
    let h = Harness::new();
    let space = h.space("S");
    let note = h.note(&space, "n");
    let label = id_of(&h.ok(
        "create_label",
        json!({ "spaceId": space, "name": "x", "color": "#000" }),
    ));
    h.ok(
        "attach_label",
        json!({ "entityId": note, "labelId": label }),
    );
    let for_entity = h.ok("list_labels_for_entity", json!({ "entityId": note }));
    assert_eq!(
        for_entity,
        h.db(|c| to_json(db::labels::list_labels_for_entity(c, &note).unwrap()))
    );
    assert_eq!(for_entity.as_array().unwrap().len(), 1);
    let by_entity = h.ok("list_entity_label_ids", json!({ "spaceId": space }));
    assert_eq!(by_entity[&note], json!([label]));

    h.ok(
        "detach_label",
        json!({ "entityId": note, "labelId": label }),
    );
    assert!(h
        .ok("list_labels_for_entity", json!({ "entityId": note }))
        .as_array()
        .unwrap()
        .is_empty());
}

#[test]
fn labels_attach_requires_both_ids() {
    let h = Harness::new();
    let message = h.args_err("attach_label", json!({ "entityId": MISSING }));
    assert!(message.contains("labelId"), "{message}");
}

// ------------------------------------------------------------------- tasks

impl Harness {
    fn task(&self, space_id: &str, title: &str) -> String {
        id_of(&self.ok(
            "create_task",
            json!({ "spaceId": space_id, "title": title, "startDate": null, "dueDate": null }),
        ))
    }
}

#[test]
fn tasks_statuses_match_the_db() {
    let h = Harness::new();
    let statuses = h.ok("list_task_statuses", json!({}));
    assert_eq!(
        statuses,
        h.db(|c| to_json(db::tasks::list_task_statuses(c).unwrap()))
    );
    assert!(statuses
        .as_array()
        .unwrap()
        .iter()
        .any(|s| s["id"] == "done"));
}

#[test]
fn tasks_create_with_dates_and_list() {
    let h = Harness::new();
    let space = h.space("S");
    let task = h.ok(
        "create_task",
        json!({ "spaceId": space, "title": "Write", "startDate": "2026-01-01", "dueDate": "2026-01-10" }),
    );
    assert_eq!(task["startDate"], "2026-01-01");
    assert_eq!(task["dueDate"], "2026-01-10");
    let listed = h.ok("list_tasks", json!({ "spaceId": space }));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::tasks::list_tasks(c, &space).unwrap()))
    );
    let all = h.ok("list_tasks_all", json!({}));
    assert_eq!(
        all,
        h.db(|c| to_json(db::tasks::list_tasks_all(c).unwrap()))
    );
    assert_eq!(all.as_array().unwrap().len(), 1);
}

#[test]
fn tasks_create_null_dates_stay_null() {
    let h = Harness::new();
    let space = h.space("S");
    let id = h.task(&space, "t");
    let task = h.ok("get_task", json!({ "entityId": id }));
    assert_eq!(task["startDate"], Value::Null);
    assert_eq!(task["dueDate"], Value::Null);
    assert_eq!(
        task,
        h.db(|c| to_json(db::tasks::get_task_with_labels(c, &id).unwrap()))
    );
}

#[test]
fn tasks_get_unknown_is_not_found() {
    let h = Harness::new();
    h.app_err("get_task", json!({ "entityId": MISSING }), "NotFound");
}

#[test]
fn tasks_subtasks_and_progress() {
    let h = Harness::new();
    let space = h.space("S");
    let parent = h.task(&space, "parent");
    assert_eq!(
        h.ok("subtask_progress", json!({ "parentEntityId": parent })),
        Value::Null
    );
    let sub = h.ok(
        "create_subtask",
        json!({ "parentEntityId": parent, "title": "child" }),
    );
    assert_eq!(sub["entity"]["type"], "sub_task");
    h.task(&space, "other");
    let subs = h.ok("list_subtasks", json!({ "parentEntityId": parent }));
    assert_eq!(
        subs,
        h.db(|c| to_json(db::tasks::list_subtasks(c, &parent).unwrap()))
    );
    assert_eq!(subs.as_array().unwrap().len(), 1);
    h.ok(
        "update_task_status",
        json!({ "entityId": id_of(&sub), "statusId": "done" }),
    );
    assert_eq!(
        h.ok("subtask_progress", json!({ "parentEntityId": parent })),
        json!(h.db(|c| db::tasks::subtask_progress(c, &parent).unwrap()))
    );
}

#[test]
fn tasks_subtask_of_a_subtask_is_a_cardinality_violation() {
    let h = Harness::new();
    let space = h.space("S");
    let parent = h.task(&space, "parent");
    let sub = id_of(&h.ok(
        "create_subtask",
        json!({ "parentEntityId": parent, "title": "child" }),
    ));
    h.app_err(
        "create_subtask",
        json!({ "parentEntityId": sub, "title": "grandchild" }),
        "CardinalityViolation",
    );
}

#[test]
fn tasks_update_status_changes_the_row() {
    let h = Harness::new();
    let space = h.space("S");
    let id = h.task(&space, "t");
    h.ok(
        "update_task_status",
        json!({ "entityId": id, "statusId": "in_progress" }),
    );
    assert_eq!(
        h.db(|c| db::tasks::get_task_with_labels(c, &id).unwrap().status_id),
        "in_progress"
    );
}

#[test]
fn tasks_update_status_unknown_status_is_not_found() {
    let h = Harness::new();
    let space = h.space("S");
    let id = h.task(&space, "t");
    let message = h.app_err(
        "update_task_status",
        json!({ "entityId": id, "statusId": "bogus" }),
        "NotFound",
    );
    assert!(message.contains("bogus"), "{message}");
}

#[test]
fn tasks_update_dates_sets_and_clears() {
    let h = Harness::new();
    let space = h.space("S");
    let id = h.task(&space, "t");
    h.ok(
        "update_task_dates",
        json!({ "entityId": id, "startDate": "2026-02-01", "dueDate": "2026-02-03" }),
    );
    let task = h.db(|c| db::tasks::get_task_with_labels(c, &id).unwrap());
    assert_eq!(task.due_date.as_deref(), Some("2026-02-03"));
    h.ok(
        "update_task_dates",
        json!({ "entityId": id, "startDate": null, "dueDate": null }),
    );
    let task = h.db(|c| db::tasks::get_task_with_labels(c, &id).unwrap());
    assert_eq!(task.start_date, None);
    assert_eq!(task.due_date, None);
}

#[test]
fn tasks_update_effort_validates_steps() {
    let h = Harness::new();
    let space = h.space("S");
    let id = h.task(&space, "t");
    h.ok("update_task_effort", json!({ "entityId": id, "effort": 5 }));
    assert_eq!(
        h.db(|c| db::tasks::get_task_with_labels(c, &id).unwrap().effort),
        Some(5)
    );
    h.app_err(
        "update_task_effort",
        json!({ "entityId": id, "effort": 4 }),
        "InvalidInput",
    );
    h.ok(
        "update_task_effort",
        json!({ "entityId": id, "effort": null }),
    );
    assert_eq!(
        h.db(|c| db::tasks::get_task_with_labels(c, &id).unwrap().effort),
        None
    );
    h.app_err(
        "update_task_effort",
        json!({ "entityId": MISSING, "effort": 3 }),
        "NotFound",
    );
}

#[test]
fn tasks_set_repeat_validates_the_rule_and_creates_the_next_task_when_done() {
    let h = Harness::new();
    let space = h.space("S");
    let id = h.task(&space, "t");
    h.ok(
        "set_task_repeat",
        json!({ "entityId": id, "repeat": { "every": 2, "unit": "week" } }),
    );
    assert_eq!(
        h.ok("list_tasks", json!({ "spaceId": space }))[0]["repeat"],
        json!({ "every": 2, "unit": "week" })
    );
    h.app_err(
        "set_task_repeat",
        json!({ "entityId": id, "repeat": { "every": 0, "unit": "day" } }),
        "InvalidInput",
    );
    // An unknown unit never reaches the backend.
    h.args_err(
        "set_task_repeat",
        json!({ "entityId": id, "repeat": { "every": 1, "unit": "year" } }),
    );
    h.app_err(
        "set_task_repeat",
        json!({ "entityId": MISSING, "repeat": null }),
        "NotFound",
    );

    h.ok(
        "update_task_status",
        json!({ "entityId": id, "statusId": "done" }),
    );
    assert_eq!(
        h.ok("list_tasks", json!({ "spaceId": space }))
            .as_array()
            .unwrap()
            .len(),
        2
    );

    h.ok("set_task_repeat", json!({ "entityId": id, "repeat": null }));
    assert_eq!(h.db(|c| db::tasks::get_task(c, &id).unwrap().repeat), None);
}

#[test]
fn tasks_update_effort_rejects_a_fraction_before_running() {
    let h = Harness::new();
    h.args_err(
        "update_task_effort",
        json!({ "entityId": MISSING, "effort": 2.5 }),
    );
}

#[test]
fn tasks_convert_to_subtask() {
    let h = Harness::new();
    let space = h.space("S");
    let parent = h.task(&space, "parent");
    let child = h.task(&space, "child");
    let converted = h.ok(
        "convert_to_subtask",
        json!({ "entityId": child, "parentEntityId": parent }),
    );
    assert_eq!(converted["entity"]["type"], "sub_task");
    assert_eq!(
        h.db(|c| db::tasks::list_subtasks(c, &parent).unwrap())
            .len(),
        1
    );
    h.app_err(
        "convert_to_subtask",
        json!({ "entityId": parent, "parentEntityId": parent }),
        "CardinalityViolation",
    );
}

#[test]
fn tasks_due_counts_and_lists_match_the_db() {
    let h = Harness::new();
    let space = h.space("S");
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    h.ok(
        "create_task",
        json!({ "spaceId": space, "title": "due", "startDate": null, "dueDate": today }),
    );
    h.ok(
        "create_task",
        json!({ "spaceId": space, "title": "late", "startDate": null, "dueDate": "2000-01-01" }),
    );
    assert_eq!(
        h.ok("count_tasks_due_today", json!({})),
        h.db(|c| to_json(db::tasks::count_tasks_due_today(c).unwrap()))
    );
    let count = h.ok("count_open_tasks_due_or_overdue", json!({}));
    assert_eq!(
        count,
        json!(h.db(|c| db::tasks::count_open_tasks_due_or_overdue(c).unwrap()))
    );
    let listed = h.ok("list_open_tasks_due_or_overdue", json!({}));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::tasks::list_open_tasks_due_or_overdue(c).unwrap()))
    );
    assert_eq!(
        listed.as_array().unwrap().len() as i64,
        count.as_i64().unwrap()
    );
    assert!(count.as_i64().unwrap() >= 1);
}

// ------------------------------------------------------------------- notes

impl Harness {
    fn block(&self, entity_id: &str, content: &str) -> Value {
        self.ok(
            "create_block",
            json!({
                "entityId": entity_id,
                "blockType": "paragraph",
                "content": content,
                "position": null,
                "language": null,
                "filename": null,
                "attrs": null,
            }),
        )
    }
}

#[test]
fn notes_create_note_and_jot_types() {
    let h = Harness::new();
    let space = h.space("S");
    let note = h.ok("create_note", json!({ "spaceId": space, "title": "N" }));
    let jot = h.ok("create_jot", json!({ "spaceId": space, "title": "J" }));
    assert_eq!(note["type"], "note");
    assert_eq!(jot["type"], "jot");
}

#[test]
fn notes_jot_counts_and_lists_match_the_db() {
    let h = Harness::new();
    let space = h.space("S");
    h.ok("create_jot", json!({ "spaceId": space, "title": "J1" }));
    h.ok("create_jot", json!({ "spaceId": space, "title": "J2" }));
    assert_eq!(
        h.ok("count_unrefined_jots", json!({ "spaceId": space })),
        json!(2)
    );
    assert_eq!(h.ok("count_unrefined_jots_all_spaces", json!({})), json!(2));
    let listed = h.ok("list_unrefined_jots_all_spaces", json!({ "limit": 1 }));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::notes::list_unrefined_jots_all_spaces(c, 1).unwrap()))
    );
    assert_eq!(listed.as_array().unwrap().len(), 1);
    let summaries = h.ok("list_jot_summaries", json!({ "spaceId": space }));
    assert_eq!(
        summaries,
        h.db(|c| to_json(db::notes::list_jot_summaries(c, &space).unwrap()))
    );
}

#[test]
fn notes_recent_and_summaries_match_the_db() {
    let h = Harness::new();
    let space = h.space("S");
    for title in ["a", "b", "c"] {
        h.note(&space, title);
    }
    let recent = h.ok("list_recent_notes", json!({ "spaceId": space, "limit": 2 }));
    assert_eq!(
        recent,
        h.db(|c| to_json(db::notes::list_recent_notes(c, &space, 2).unwrap()))
    );
    assert_eq!(recent.as_array().unwrap().len(), 2);
    let summaries = h.ok("list_note_summaries", json!({ "spaceId": space }));
    assert_eq!(
        summaries,
        h.db(|c| to_json(db::notes::list_note_summaries(c, &space).unwrap()))
    );
    assert_eq!(summaries.as_array().unwrap().len(), 3);
}

#[test]
fn notes_limit_must_be_an_integer() {
    let h = Harness::new();
    h.args_err(
        "list_recent_notes",
        json!({ "spaceId": MISSING, "limit": "5" }),
    );
    h.args_err("list_unrefined_jots_all_spaces", json!({}));
}

#[test]
fn notes_blocks_create_list_update_delete() {
    let h = Harness::new();
    let space = h.space("S");
    let page = h.note(&space, "Page");
    let first = h.block(&page, "first");
    let second = h.block(&page, "second");
    assert_eq!(first["position"], 0);
    assert_eq!(second["position"], 1);
    let listed = h.ok("list_blocks", json!({ "entityId": page }));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::notes::list_blocks(c, &page).unwrap()))
    );

    let updated = h.ok(
        "update_block",
        json!({ "blockId": first["id"], "patch": { "content": "changed" } }),
    );
    assert_eq!(updated["content"], "changed");
    assert_eq!(updated["blockType"], "paragraph");

    h.ok("delete_block", json!({ "blockId": second["id"] }));
    let remaining = h.db(|c| db::notes::list_blocks(c, &page).unwrap());
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].content, "changed");
}

#[test]
fn notes_create_block_with_omitted_optionals() {
    let h = Harness::new();
    let space = h.space("S");
    let page = h.note(&space, "Page");
    // `createBlock` defaults: keys can also be left out entirely.
    let block = h.ok(
        "create_block",
        json!({ "entityId": page, "blockType": "code", "content": "fn main() {}", "language": "rust" }),
    );
    assert_eq!(block["language"], "rust");
    assert_eq!(block["filename"], Value::Null);
}

#[test]
fn notes_create_block_validates_attrs() {
    let h = Harness::new();
    let space = h.space("S");
    let page = h.note(&space, "Page");
    let callout = h.ok(
        "create_block",
        json!({ "entityId": page, "blockType": "callout", "content": "hi", "attrs": { "variant": "tip" } }),
    );
    assert_eq!(callout["attrs"]["variant"], "tip");
    h.app_err(
        "create_block",
        json!({ "entityId": page, "blockType": "callout", "content": "hi", "attrs": { "variant": "loud" } }),
        "InvalidInput",
    );
    h.app_err(
        "create_block",
        json!({ "entityId": page, "blockType": "paragraph", "content": "hi", "attrs": { "nope": "x" } }),
        "InvalidInput",
    );
    assert_eq!(h.db(|c| db::notes::list_blocks(c, &page).unwrap()).len(), 1);
}

#[test]
fn notes_create_block_attrs_must_be_strings() {
    let h = Harness::new();
    h.args_err(
        "create_block",
        json!({ "entityId": MISSING, "blockType": "callout", "content": "", "attrs": { "variant": 1 } }),
    );
}

#[test]
fn notes_update_unknown_block_is_not_found() {
    let h = Harness::new();
    h.app_err(
        "update_block",
        json!({ "blockId": MISSING, "patch": { "content": "x" } }),
        "NotFound",
    );
}

#[test]
fn notes_reorder_blocks() {
    let h = Harness::new();
    let space = h.space("S");
    let page = h.note(&space, "Page");
    let a = h.block(&page, "a");
    let b = h.block(&page, "b");
    h.ok(
        "reorder_blocks",
        json!({ "entityId": page, "orderedBlockIds": [b["id"], a["id"]] }),
    );
    let order: Vec<String> = h.db(|c| {
        db::notes::list_blocks(c, &page)
            .unwrap()
            .into_iter()
            .map(|b| b.content)
            .collect()
    });
    assert_eq!(order, ["b", "a"]);
}

#[test]
fn notes_mentioning_entities_matches_the_db() {
    let h = Harness::new();
    let space = h.space("S");
    let page = h.note(&space, "Page");
    let listed = h.ok("list_mentioning_entities", json!({ "entityId": page }));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::notes::list_mentioning_entities(c, &page).unwrap()))
    );
}

#[test]
fn notes_render_and_export_markdown() {
    let h = Harness::new();
    let space = h.space("S");
    let page = h.note(&space, "Page");
    h.block(&page, "Hello world");
    let markdown = h.ok("render_page_markdown", json!({ "entityId": page }));
    assert_eq!(
        markdown,
        json!(h.db(|c| db::notes::render_page_markdown(c, &page).unwrap()))
    );
    assert!(markdown.as_str().unwrap().contains("Hello world"));

    let out = h.dir.path().join("page.md");
    h.ok(
        "export_page_markdown",
        json!({ "entityId": page, "path": out.to_string_lossy() }),
    );
    assert_eq!(
        std::fs::read_to_string(&out).unwrap(),
        markdown.as_str().unwrap()
    );
}

#[test]
fn notes_export_and_import_a_page_file_through_the_commands() {
    let h = Harness::new();
    let space = h.space("S");
    let other = h.space("Other");
    let page = h.note(&space, "Shared");
    h.ok(
        "create_block",
        json!({ "entityId": page, "blockType": "paragraph", "content": "Hello" }),
    );
    let out = h.dir.path().join("shared.nookly.json");
    h.ok(
        "export_page_json",
        json!({ "entityId": page, "path": out.to_string_lossy() }),
    );
    assert_eq!(
        std::fs::read_to_string(&out).unwrap(),
        h.db(|c| db::page_json::export_page_json(c, &page).unwrap())
    );
    let imported = h.ok(
        "import_page_json",
        json!({ "spaceId": other, "path": out.to_string_lossy() }),
    );
    assert_eq!(imported["title"], "Shared");
    assert_eq!(imported["spaceId"], other.as_str());
    let blocks = h.ok("list_blocks", json!({ "entityId": imported["id"] }));
    assert_eq!(blocks[0]["content"], "Hello");
}

#[test]
fn notes_preview_reads_a_page_file_and_refuses_bad_ones() {
    let h = Harness::new();
    let space = h.space("S");
    let page = h.note(&space, "Preview me");
    let out = h.dir.path().join("preview.nookly.json");
    h.ok(
        "export_page_json",
        json!({ "entityId": page, "path": out.to_string_lossy() }),
    );
    let before = h.db(|c| db::entities::list_entities(c, None, false).unwrap().len());
    let preview = h.ok(
        "preview_page_json",
        json!({ "path": out.to_string_lossy() }),
    );
    assert_eq!(preview["kind"], "note");
    assert_eq!(preview["title"], "Preview me");
    assert_eq!(preview["blockCount"], 0);
    assert_eq!(preview["convertedBlocks"], 0);
    let broken = h.dir.file("broken.json", b"{ nope");
    h.app_err(
        "preview_page_json",
        json!({ "path": broken.to_string_lossy() }),
        "InvalidInput",
    );
    h.app_err(
        "preview_page_json",
        json!({ "path": h.dir.path().join("missing.json").to_string_lossy() }),
        "Io",
    );
    assert_eq!(
        h.db(|c| db::entities::list_entities(c, None, false).unwrap().len()),
        before
    );
}

#[test]
fn notes_text_variants_match_the_path_commands() {
    let h = Harness::new();
    let space = h.space("S");
    let other = h.space("Other");
    let page = h.note(&space, "Dropped");
    h.ok(
        "create_block",
        json!({ "entityId": page, "blockType": "paragraph", "content": "Hello" }),
    );
    let text = h.db(|c| db::page_json::export_page_json(c, &page).unwrap());
    let preview = h.ok("preview_page_text", json!({ "text": text }));
    assert_eq!(preview["title"], "Dropped");
    assert_eq!(preview["blocks"][0]["firstLine"], "Hello");
    let imported = h.ok(
        "import_page_text",
        json!({ "spaceId": other, "text": text }),
    );
    assert_eq!(imported["title"], "Dropped");
    assert_eq!(imported["spaceId"], other.as_str());
    // A refused text creates nothing.
    let before = h.db(|c| db::entities::list_entities(c, None, false).unwrap().len());
    h.app_err(
        "preview_page_text",
        json!({ "text": "{ nope" }),
        "InvalidInput",
    );
    h.app_err(
        "import_page_text",
        json!({ "spaceId": space, "text": "{ nope" }),
        "InvalidInput",
    );
    assert_eq!(
        h.db(|c| db::entities::list_entities(c, None, false).unwrap().len()),
        before
    );
}

#[test]
fn notes_import_refuses_bad_and_missing_files_and_creates_nothing() {
    let h = Harness::new();
    let space = h.space("S");
    let before = h.db(|c| db::entities::list_entities(c, None, false).unwrap().len());
    let broken = h.dir.file("broken.json", b"{ nope");
    h.app_err(
        "import_page_json",
        json!({ "spaceId": space, "path": broken.to_string_lossy() }),
        "InvalidInput",
    );
    h.app_err(
        "import_page_json",
        json!({ "spaceId": space, "path": h.dir.path().join("missing.json").to_string_lossy() }),
        "Io",
    );
    h.args_err("import_page_json", json!({ "space": space }));
    assert_eq!(
        h.db(|c| db::entities::list_entities(c, None, false).unwrap().len()),
        before
    );
    // An export of a page that is not there writes no file.
    let out = h.dir.path().join("nothing.json");
    h.app_err(
        "export_page_json",
        json!({ "entityId": MISSING, "path": out.to_string_lossy() }),
        "NotFound",
    );
    assert!(!out.exists());
}

#[test]
fn notes_export_to_an_unwritable_path_is_an_io_error() {
    let h = Harness::new();
    let space = h.space("S");
    let page = h.note(&space, "Page");
    let out = h.dir.path().join("missing-dir").join("page.md");
    h.app_err(
        "export_page_markdown",
        json!({ "entityId": page, "path": out.to_string_lossy() }),
        "Io",
    );
    assert!(!out.exists());
}

#[test]
fn notes_code_language_round_trips_and_rejects_jots() {
    let h = Harness::new();
    let space = h.space("S");
    let page = h.note(&space, "Page");
    assert_eq!(
        h.ok("get_note_code_language", json!({ "entityId": page })),
        json!(null)
    );
    h.ok(
        "set_note_code_language",
        json!({ "entityId": page, "language": "rust" }),
    );
    assert_eq!(
        h.ok("get_note_code_language", json!({ "entityId": page })),
        json!("rust")
    );
    h.ok(
        "set_note_code_language",
        json!({ "entityId": page, "language": null }),
    );
    assert_eq!(
        h.ok("get_note_code_language", json!({ "entityId": page })),
        json!(null)
    );
    h.app_err(
        "set_note_code_language",
        json!({ "entityId": MISSING, "language": "rust" }),
        "NotFound",
    );
}

#[test]
fn notes_render_unknown_page_is_not_found() {
    let h = Harness::new();
    // An unknown page is NotFound, so `export_page_markdown` never writes an
    // empty file for it.
    h.app_err(
        "render_page_markdown",
        json!({ "entityId": MISSING }),
        "NotFound",
    );
}

// ----------------------------------------------------------------- courses

impl Harness {
    fn semester(&self, space_id: &str, title: &str) -> String {
        id_of(&self.ok(
            "create_semester",
            json!({
                "spaceId": space_id,
                "title": title,
                "startDate": null,
                "endDate": null,
                "termType": null,
                "year": null,
            }),
        ))
    }
}

#[test]
fn courses_create_and_list_match_the_db() {
    let h = Harness::new();
    let space = h.space("S");
    h.course(&space, "Algebra");
    let listed = h.ok("list_courses", json!({ "spaceId": space }));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::courses::list_courses(c, &space).unwrap()))
    );
    assert_eq!(listed[0]["type"], "course");
}

#[test]
fn courses_semesters_create_update_list() {
    let h = Harness::new();
    let space = h.space("S");
    let created = h.ok(
        "create_semester",
        json!({
            "spaceId": space,
            "title": "Winter",
            "startDate": "2026-10-01",
            "endDate": "2027-03-31",
            "termType": "winter",
            "year": 2026,
        }),
    );
    assert_eq!(created["year"], 2026);
    let id = id_of(&created);
    h.ok(
        "update_semester",
        json!({ "entityId": id, "startDate": null, "endDate": null, "termType": null, "year": 2027 }),
    );
    let listed = h.ok("list_semesters", json!({ "spaceId": space }));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::courses::list_semesters(c, &space).unwrap()))
    );
    assert_eq!(listed[0]["year"], 2027);
}

#[test]
fn courses_current_semester_and_reorder() {
    let h = Harness::new();
    let space = h.space("S");
    let a = h.semester(&space, "A");
    let b = h.semester(&space, "B");
    h.ok(
        "set_current_semester",
        json!({ "spaceId": space, "entityId": b }),
    );
    let current: Vec<bool> = h.db(|c| {
        db::courses::list_semesters(c, &space)
            .unwrap()
            .into_iter()
            .filter(|s| s.entity.id == b)
            .map(|s| s.is_current)
            .collect()
    });
    assert_eq!(current, [true]);
    h.ok("reorder_semesters", json!({ "orderedIds": [b, a] }));
    let listed = h.ok("list_semesters", json!({ "spaceId": space }));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::courses::list_semesters(c, &space).unwrap()))
    );
}

#[test]
fn courses_link_and_set_semester() {
    let h = Harness::new();
    let space = h.space("S");
    let course = h.course(&space, "C");
    let a = h.semester(&space, "A");
    let b = h.semester(&space, "B");
    h.ok(
        "link_course_to_semester",
        json!({ "courseId": course, "semesterId": a }),
    );
    h.ok(
        "set_course_semester",
        json!({ "courseId": course, "semesterId": b }),
    );
    let rels = h.db(|c| {
        db::relationships::list_relationships(c, &course, db::relationships::Direction::Both)
            .unwrap()
    });
    let linked: Vec<_> = rels
        .iter()
        .filter(|r| {
            r.from_entity_id == a
                || r.to_entity_id == a
                || r.from_entity_id == b
                || r.to_entity_id == b
        })
        .collect();
    assert_eq!(linked.len(), 1, "{rels:?}");
    assert!(linked[0].from_entity_id == b || linked[0].to_entity_id == b);
}

#[test]
fn courses_notes_pages_are_created_once() {
    let h = Harness::new();
    let space = h.space("S");
    let course = h.course(&space, "C");
    let first = h.ok("get_course_notes", json!({ "courseId": course }));
    let again = h.ok("get_course_notes", json!({ "courseId": course }));
    assert_eq!(first["id"], again["id"]);
    let semester = h.semester(&space, "Sem");
    let sem_notes = h.ok("get_semester_notes", json!({ "semesterId": semester }));
    assert_eq!(
        sem_notes["id"],
        h.ok("get_semester_notes", json!({ "semesterId": semester }))["id"]
    );
}

#[test]
fn courses_notes_for_unknown_course_fails() {
    let h = Harness::new();
    h.call("get_course_notes", json!({ "courseId": MISSING }))
        .unwrap_err();
}

#[test]
fn courses_grades_and_details_match_the_db() {
    let h = Harness::new();
    let space = h.space("S");
    let course = h.course(&space, "C");
    h.ok(
        "update_course_professor",
        json!({ "entityId": course, "professor": "Dr. X" }),
    );
    let details = h.ok("get_course_details", json!({ "courseId": course }));
    assert_eq!(details["professor"], "Dr. X");
    assert_eq!(
        details,
        h.db(|c| to_json(db::courses::get_course_details(c, &course).unwrap()))
    );
    let grades = h.ok("get_course_grades", json!({ "courseId": course }));
    assert_eq!(
        grades,
        h.db(|c| to_json(db::courses::get_course_grades(c, &course).unwrap()))
    );
    h.ok(
        "update_course_professor",
        json!({ "entityId": course, "professor": null }),
    );
    assert_eq!(
        h.ok("get_course_details", json!({ "courseId": course }))["professor"],
        Value::Null
    );
}

#[test]
fn courses_details_unknown_is_not_found() {
    let h = Harness::new();
    h.app_err(
        "get_course_details",
        json!({ "courseId": MISSING }),
        "NotFound",
    );
}

// ------------------------------------------------------------------- exams

impl Harness {
    fn exam(&self, space_id: &str, course_id: &str) -> String {
        id_of(&self.ok(
            "create_exam",
            json!({ "spaceId": space_id, "title": "Final", "courseId": course_id, "examDate": "2026-07-01", "weight": 0.5 }),
        ))
    }
}

#[test]
fn exams_create_and_lists_match_the_db() {
    let h = Harness::new();
    let space = h.space("S");
    let course = h.course(&space, "C");
    let id = h.exam(&space, &course);
    let listed = h.ok("list_exams", json!({ "spaceId": space }));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::exams::list_exams(c, &space).unwrap()))
    );
    assert_eq!(id_of(&listed[0]), id);
    assert_eq!(listed[0]["weight"], 0.5);
    assert_eq!(
        h.ok("list_exams_all_spaces", json!({})),
        h.db(|c| to_json(db::exams::list_exams_all_spaces(c).unwrap()))
    );
}

#[test]
fn exams_create_with_unknown_course_leaves_nothing_behind() {
    let h = Harness::new();
    let space = h.space("S");
    h.call(
        "create_exam",
        json!({ "spaceId": space, "title": "x", "courseId": MISSING, "examDate": null, "weight": null }),
    )
    .unwrap_err();
    let leftovers = h.db(|c| db::entities::list_entities(c, Some(&space), false).unwrap());
    assert_eq!(
        leftovers.iter().filter(|e| e.entity_type == "exam").count(),
        0
    );
}

#[test]
fn exams_field_setters_update_the_row() {
    let h = Harness::new();
    let space = h.space("S");
    let course = h.course(&space, "C");
    let id = h.exam(&space, &course);
    h.ok(
        "update_exam_date",
        json!({ "entityId": id, "examDate": "2026-08-01" }),
    );
    h.ok(
        "update_exam_weight",
        json!({ "entityId": id, "weight": 0.25 }),
    );
    h.ok("update_exam_grade", json!({ "entityId": id, "grade": 1.7 }));
    h.ok("update_exam_room", json!({ "entityId": id, "room": "H1" }));
    h.ok(
        "update_exam_time",
        json!({ "entityId": id, "examTime": "09:30" }),
    );
    let exam = h.db(|c| db::exams::list_exams(c, &space).unwrap().remove(0));
    assert_eq!(exam.exam_date.as_deref(), Some("2026-08-01"));
    assert_eq!(exam.weight, Some(0.25));
    assert_eq!(exam.grade, Some(1.7));
    assert_eq!(exam.room.as_deref(), Some("H1"));
    assert_eq!(exam.exam_time.as_deref(), Some("09:30"));

    for (cmd, key) in [
        ("update_exam_date", "examDate"),
        ("update_exam_weight", "weight"),
        ("update_exam_grade", "grade"),
        ("update_exam_room", "room"),
        ("update_exam_time", "examTime"),
    ] {
        h.ok(cmd, json!({ "entityId": id, key: null }));
    }
    let exam = h.db(|c| db::exams::list_exams(c, &space).unwrap().remove(0));
    assert_eq!(exam.exam_date, None);
    assert_eq!(exam.weight, None);
    assert_eq!(exam.grade, None);
    assert_eq!(exam.room, None);
    assert_eq!(exam.exam_time, None);
}

#[test]
fn exams_update_exam_null_grade_keeps_the_grade() {
    let h = Harness::new();
    let space = h.space("S");
    let course = h.course(&space, "C");
    let id = h.exam(&space, &course);
    h.ok(
        "update_exam",
        json!({ "entityId": id, "grade": 2.0, "status": "done" }),
    );
    h.ok(
        "update_exam",
        json!({ "entityId": id, "grade": null, "status": null }),
    );
    let exam = h.db(|c| db::exams::list_exams(c, &space).unwrap().remove(0));
    assert_eq!(exam.grade, Some(2.0));
    assert_eq!(exam.status, "done");
}

#[test]
fn exams_update_unknown_exam_is_not_found() {
    let h = Harness::new();
    h.app_err(
        "update_exam",
        json!({ "entityId": MISSING, "grade": 1.0, "status": "done" }),
        "NotFound",
    );
}

#[test]
fn exams_set_course_moves_the_exam() {
    let h = Harness::new();
    let space = h.space("S");
    let a = h.course(&space, "A");
    let b = h.course(&space, "B");
    let id = h.exam(&space, &a);
    h.ok("set_exam_course", json!({ "entityId": id, "courseId": b }));
    let rels = h.db(|c| {
        db::relationships::list_relationships(c, &id, db::relationships::Direction::From).unwrap()
    });
    let courses: Vec<_> = rels
        .iter()
        .filter(|r| r.relationship_type == "exam-course")
        .map(|r| r.to_entity_id.clone())
        .collect();
    assert_eq!(courses, [b]);
}

#[test]
fn exams_weight_must_be_a_number() {
    let h = Harness::new();
    h.args_err(
        "update_exam_weight",
        json!({ "entityId": MISSING, "weight": "half" }),
    );
}

// ------------------------------------------------------------- assignments

#[test]
fn assignments_create_list_and_update() {
    let h = Harness::new();
    let space = h.space("S");
    let course = h.course(&space, "C");
    let created = h.ok(
        "create_assignment",
        json!({ "spaceId": space, "title": "HW1", "courseId": course, "dueDate": null }),
    );
    let id = id_of(&created);
    assert_eq!(created["dueDate"], Value::Null);
    let listed = h.ok("list_assignments", json!({ "spaceId": space }));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::assignments::list_assignments(c, &space).unwrap()))
    );
    assert_eq!(
        h.ok("list_assignments_all_spaces", json!({})),
        h.db(|c| to_json(db::assignments::list_assignments_all_spaces(c).unwrap()))
    );

    h.ok(
        "update_assignment_status",
        json!({ "entityId": id, "status": "graded", "grade": 1.3 }),
    );
    h.ok(
        "update_assignment_due_date",
        json!({ "entityId": id, "dueDate": "2026-05-05" }),
    );
    let stored = h.db(|c| {
        db::assignments::list_assignments(c, &space)
            .unwrap()
            .remove(0)
    });
    assert_eq!(stored.status, "graded");
    assert_eq!(stored.grade, Some(1.3));
    assert_eq!(stored.due_date.as_deref(), Some("2026-05-05"));

    h.ok(
        "update_assignment_due_before_session",
        json!({ "entityId": id, "offsetDays": 2 }),
    );
    let stored = h.db(|c| db::assignments::get_assignment(c, &id).unwrap());
    assert_eq!(stored.due_session_offset_days, Some(2));

    h.ok(
        "update_assignment_weight",
        json!({ "entityId": id, "weight": 0.25 }),
    );
    let stored = h.db(|c| db::assignments::get_assignment(c, &id).unwrap());
    assert_eq!(stored.weight, Some(0.25));

    // A null grade on a status change clears the grade.
    h.ok(
        "update_assignment_status",
        json!({ "entityId": id, "status": "in_progress", "grade": null }),
    );
    let stored = h.db(|c| {
        db::assignments::list_assignments(c, &space)
            .unwrap()
            .remove(0)
    });
    assert_eq!(stored.grade, None);
}

#[test]
fn courses_get_grade_report() {
    let h = Harness::new();
    let space = h.space("S");
    let course = h.course(&space, "Algo");
    let exam = id_of(&h.ok(
        "create_exam",
        json!({ "spaceId": space, "title": "Final", "courseId": course, "examDate": "2026-02-01", "weight": 0.5 }),
    ));
    h.ok(
        "update_exam_grade",
        json!({ "entityId": exam, "grade": 1.7 }),
    );

    let report = h.ok("get_grade_report", json!({ "spaceId": space }));
    assert_eq!(
        report,
        h.db(|c| to_json(db::grade_report::get_grade_report(c, &space).unwrap()))
    );
    assert_eq!(report["gpa"], json!(1.7));
    assert_eq!(report["semesters"][0]["semester"], Value::Null);
    assert_eq!(
        report["semesters"][0]["courses"][0]["items"][0]["kind"],
        "exam"
    );
}

#[test]
fn assignments_set_course() {
    let h = Harness::new();
    let space = h.space("S");
    let a = h.course(&space, "A");
    let b = h.course(&space, "B");
    let id = id_of(&h.ok(
        "create_assignment",
        json!({ "spaceId": space, "title": "HW", "courseId": a, "dueDate": "2026-01-01" }),
    ));
    h.ok(
        "set_assignment_course",
        json!({ "entityId": id, "courseId": b }),
    );
    let rels = h.db(|c| {
        db::relationships::list_relationships(c, &id, db::relationships::Direction::From).unwrap()
    });
    assert!(rels.iter().any(|r| r.to_entity_id == b));
    assert!(!rels.iter().any(|r| r.to_entity_id == a));
}

#[test]
fn assignments_status_is_required() {
    let h = Harness::new();
    let message = h.args_err(
        "update_assignment_status",
        json!({ "entityId": MISSING, "grade": null }),
    );
    assert!(message.contains("status"), "{message}");
}

#[test]
fn assignments_update_unknown_is_not_found() {
    let h = Harness::new();
    h.app_err(
        "update_assignment_status",
        json!({ "entityId": MISSING, "status": "graded", "grade": null }),
        "NotFound",
    );
}

// ------------------------------------------------------------ study blocks

#[test]
fn study_blocks_create_and_list() {
    let h = Harness::new();
    let space = h.space("S");
    let course = h.course(&space, "C");
    let exam = h.exam(&space, &course);
    let block = h.ok(
        "create_study_block",
        json!({
            "spaceId": space,
            "title": "Review",
            "examId": exam,
            "date": "2026-06-01",
            "startTime": "09:00",
            "endTime": "10:00",
        }),
    );
    assert_eq!(block["date"], "2026-06-01");
    let listed = h.ok("list_study_blocks", json!({ "spaceId": space }));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::study_blocks::list_study_blocks(c, &space).unwrap()))
    );
    assert_eq!(listed.as_array().unwrap().len(), 1);
}

#[test]
fn study_blocks_require_every_field() {
    let h = Harness::new();
    let message = h.args_err(
        "create_study_block",
        json!({ "spaceId": MISSING, "title": "x", "examId": MISSING, "date": "2026-01-01", "startTime": "09:00" }),
    );
    assert!(message.contains("endTime"), "{message}");
}

// ------------------------------------------------------------------- decks

impl Harness {
    fn deck(&self, space_id: &str) -> String {
        id_of(&self.ok(
            "create_deck",
            json!({ "spaceId": space_id, "title": "Deck", "examId": null }),
        ))
    }

    fn card(&self, deck: &str) -> Value {
        self.ok(
            "create_card",
            json!({ "deckEntityId": deck, "front": "Q", "back": "A" }),
        )
    }
}

#[test]
fn decks_create_list_and_summaries() {
    let h = Harness::new();
    let space = h.space("S");
    let deck = h.deck(&space);
    let listed = h.ok("list_decks", json!({ "spaceId": space }));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::decks::list_decks(c, &space).unwrap()))
    );
    assert_eq!(id_of(&listed[0]), deck);
    let summaries = h.ok("list_deck_summaries", json!({ "spaceId": space }));
    assert_eq!(
        summaries,
        h.db(|c| to_json(db::decks::list_deck_summaries(c, &space).unwrap()))
    );
}

#[test]
fn decks_set_exam_validates_the_target() {
    let h = Harness::new();
    let space = h.space("S");
    let course = h.course(&space, "C");
    let exam = h.exam(&space, &course);
    let deck = h.deck(&space);
    h.ok(
        "set_deck_exam",
        json!({ "deckEntityId": deck, "examId": exam }),
    );
    let summary = h.ok("list_deck_summaries", json!({ "spaceId": space }));
    assert_eq!(summary[0]["examId"], json!(exam));
    h.app_err(
        "set_deck_exam",
        json!({ "deckEntityId": deck, "examId": course }),
        "InvalidInput",
    );
    h.ok(
        "set_deck_exam",
        json!({ "deckEntityId": deck, "examId": null }),
    );
    let summary = h.ok("list_deck_summaries", json!({ "spaceId": space }));
    assert_eq!(summary[0]["examId"], Value::Null);
}

#[test]
fn decks_cards_create_update_delete_restore() {
    let h = Harness::new();
    let space = h.space("S");
    let deck = h.deck(&space);
    let card = h.card(&deck);
    let card_id = card["id"].as_str().unwrap().to_string();
    // `updateCard` spreads the patch, so an omitted side is a missing key.
    let updated = h.ok("update_card", json!({ "cardId": card_id, "front": "Q2" }));
    assert_eq!(updated["front"], "Q2");
    assert_eq!(updated["back"], "A");
    let listed = h.ok("list_cards", json!({ "deckEntityId": deck }));
    assert_eq!(
        without_next(listed),
        without_next(h.db(|c| to_json(db::decks::list_cards(c, &deck, false).unwrap())))
    );

    h.ok("delete_card", json!({ "cardId": card_id }));
    assert!(h
        .ok("list_cards", json!({ "deckEntityId": deck }))
        .as_array()
        .unwrap()
        .is_empty());
    h.ok("restore_card", json!({ "cardId": card_id }));
    assert_eq!(
        h.ok("list_cards", json!({ "deckEntityId": deck }))
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn decks_update_unknown_card_is_not_found() {
    let h = Harness::new();
    h.app_err(
        "update_card",
        json!({ "cardId": MISSING, "front": "x", "back": null }),
        "NotFound",
    );
}

#[test]
fn decks_stats_and_queue_match_the_db() {
    let h = Harness::new();
    let space = h.space("S");
    let deck = h.deck(&space);
    h.card(&deck);
    h.card(&deck);
    let stats = h.ok("deck_stats", json!({ "deckEntityId": deck }));
    assert_eq!(
        stats,
        h.db(|c| to_json(db::decks::deck_stats(c, &deck).unwrap()))
    );
    assert_eq!(stats["total"], 2);
    let queue = h.ok("study_queue", json!({ "deckEntityId": deck }));
    assert_eq!(
        without_next(queue),
        without_next(h.db(|c| to_json(db::decks::study_queue(c, &deck).unwrap())))
    );
}

#[test]
fn decks_review_and_undo() {
    let h = Harness::new();
    let space = h.space("S");
    let deck = h.deck(&space);
    let card = h.card(&deck);
    let reviewed = h.ok(
        "review_card",
        json!({ "cardId": card["id"], "rating": "good" }),
    );
    assert_eq!(reviewed["reps"], 1);
    let undone = h.ok("undo_review", json!({ "cardId": card["id"] }));
    assert_eq!(undone["reps"], 0);
    assert_eq!(undone["state"], card["state"]);
    h.app_err(
        "undo_review",
        json!({ "cardId": card["id"] }),
        "InvalidInput",
    );
}

#[test]
fn decks_review_accepts_numeric_ratings_and_rejects_others() {
    let h = Harness::new();
    let space = h.space("S");
    let deck = h.deck(&space);
    let card = h.card(&deck);
    h.ok(
        "review_card",
        json!({ "cardId": card["id"], "rating": "3" }),
    );
    let message = h.app_err(
        "review_card",
        json!({ "cardId": card["id"], "rating": "perfect" }),
        "InvalidInput",
    );
    assert!(message.contains("perfect"), "{message}");
    // A JSON number is not a string rating.
    h.args_err("review_card", json!({ "cardId": card["id"], "rating": 3 }));
}

#[test]
fn decks_review_unknown_card_is_not_found() {
    let h = Harness::new();
    h.app_err(
        "review_card",
        json!({ "cardId": MISSING, "rating": "again" }),
        "NotFound",
    );
}

// ---------------------------------------------------------------- sessions

/// A Monday lecture series anchored on 2026-01-05 (a Monday), with three
/// occurrences generated through 2026-01-19. Returns (space, course, template,
/// occurrences).
fn lecture_series(h: &Harness) -> (String, String, String, Vec<Value>) {
    let space = h.space("S");
    let course = h.course(&space, "Algorithms");
    let template = id_of(&h.ok(
        "create_session_template",
        json!({
            "spaceId": space,
            "title": "Lecture",
            "courseId": course,
            "weekday": 0,
            "startTime": "10:00",
            "endTime": "12:00",
            "location": "H1",
            "anchorDate": "2026-01-05",
        }),
    ));
    let occurrences = h.ok(
        "generate_occurrences",
        json!({ "templateId": template, "untilDate": "2026-01-19" }),
    );
    let occurrences = occurrences.as_array().unwrap().clone();
    (space, course, template, occurrences)
}

fn session_by_id(h: &Harness, space: &str, id: &str) -> Value {
    h.ok("list_sessions", json!({ "spaceId": space }))
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["entity"]["id"] == id)
        .cloned()
        .unwrap_or_else(|| panic!("no session {id}"))
}

#[test]
fn sessions_template_generates_weekly_occurrences() {
    let h = Harness::new();
    let (space, _, template, occurrences) = lecture_series(&h);
    let dates: Vec<&str> = occurrences
        .iter()
        .map(|o| o["date"].as_str().unwrap())
        .collect();
    assert_eq!(dates, ["2026-01-05", "2026-01-12", "2026-01-19"]);
    assert!(occurrences
        .iter()
        .all(|o| o["templateId"] == json!(template)));
    assert!(occurrences.iter().all(|o| o["location"] == "H1"));
    let listed = h.ok("list_sessions", json!({ "spaceId": space }));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::sessions::list_sessions(c, Some(&space)).unwrap()))
    );
    assert_eq!(
        h.ok("list_sessions_all", json!({})),
        h.db(|c| to_json(db::sessions::list_sessions(c, None).unwrap()))
    );
}

#[test]
fn sessions_template_validation_errors() {
    let h = Harness::new();
    let space = h.space("S");
    let course = h.course(&space, "C");
    let base = json!({
        "spaceId": space,
        "title": "L",
        "courseId": course,
        "weekday": 0,
        "startTime": "10:00",
        "endTime": "12:00",
        "location": null,
        "anchorDate": "2026-01-05",
    });
    let with = |key: &str, value: Value| {
        let mut args = base.clone();
        args[key] = value;
        args
    };
    h.app_err(
        "create_session_template",
        with("weekday", json!(7)),
        "InvalidInput",
    );
    h.app_err(
        "create_session_template",
        with("endTime", json!("09:00")),
        "InvalidInput",
    );
    h.app_err(
        "create_session_template",
        with("anchorDate", json!("05.01.2026")),
        "InvalidInput",
    );
    // An unknown course leaves no template behind (atomic).
    h.call("create_session_template", with("courseId", json!(MISSING)))
        .unwrap_err();
    assert!(h
        .db(|c| db::entities::list_entities(c, Some(&space), true).unwrap())
        .iter()
        .all(|e| e.entity_type != "session_template"));
    h.args_err("create_session_template", with("weekday", json!("monday")));
}

#[test]
fn sessions_generate_unknown_template_and_bad_until_date() {
    let h = Harness::new();
    h.app_err(
        "generate_occurrences",
        json!({ "templateId": MISSING, "untilDate": "2026-01-01" }),
        "NotFound",
    );
    let (_, _, template, _) = lecture_series(&h);
    // A malformed untilDate is InvalidInput, like the other date checks.
    h.app_err(
        "generate_occurrences",
        json!({ "templateId": template, "untilDate": "soon" }),
        "InvalidInput",
    );
}

#[test]
fn sessions_one_off_and_today_and_between() {
    let h = Harness::new();
    let space = h.space("S");
    let course = h.course(&space, "C");
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let one_off = h.ok(
        "create_one_off_session",
        json!({
            "spaceId": space,
            "title": "Tutorial",
            "courseId": course,
            "date": today,
            "startTime": "08:00",
            "endTime": "09:00",
            "location": null,
        }),
    );
    assert_eq!(one_off["templateId"], Value::Null);
    assert_eq!(one_off["location"], Value::Null);
    let todays = h.ok("list_sessions_today", json!({}));
    assert_eq!(
        todays,
        h.db(|c| to_json(db::sessions::list_sessions_today(c).unwrap()))
    );
    let between = h.ok(
        "list_sessions_between",
        json!({ "from": today, "to": today }),
    );
    assert_eq!(
        between,
        h.db(|c| to_json(db::sessions::list_sessions_between(c, &today, &today).unwrap()))
    );
    assert_eq!(between.as_array().unwrap().len(), 1);
    assert!(h
        .ok(
            "list_sessions_between",
            json!({ "from": "1999-01-01", "to": "1999-01-02" })
        )
        .as_array()
        .unwrap()
        .is_empty());
}

#[test]
fn sessions_one_off_rejects_backwards_times() {
    let h = Harness::new();
    let space = h.space("S");
    let course = h.course(&space, "C");
    h.app_err(
        "create_one_off_session",
        json!({
            "spaceId": space, "title": "x", "courseId": course, "date": "2026-01-01",
            "startTime": "10:00", "endTime": "09:00", "location": null,
        }),
        "InvalidInput",
    );
}

#[test]
fn sessions_override_patch_with_omitted_and_null_fields() {
    let h = Harness::new();
    let (space, _, _, occurrences) = lecture_series(&h);
    let id = occurrences[1]["entity"]["id"].as_str().unwrap().to_string();
    // Omitted keys stay as they are.
    let moved = h.ok(
        "override_occurrence",
        json!({ "entityId": id, "patch": { "startTime": "11:00", "notes": "bring laptop" } }),
    );
    assert_eq!(moved["startTime"], "11:00");
    assert_eq!(moved["endTime"], "12:00");
    assert_eq!(moved["location"], "H1");
    assert_eq!(moved["notes"], "bring laptop");
    // `null` clears a nullable field; leaving it out does not.
    let cleared = h.ok(
        "override_occurrence",
        json!({ "entityId": id, "patch": { "location": null } }),
    );
    assert_eq!(cleared["location"], Value::Null);
    assert_eq!(cleared["notes"], "bring laptop");
    assert_eq!(session_by_id(&h, &space, &id)["location"], Value::Null);
    // Other occurrences are untouched.
    let other = occurrences[0]["entity"]["id"].as_str().unwrap();
    assert_eq!(session_by_id(&h, &space, other)["location"], "H1");
}

#[test]
fn sessions_override_cancel_and_errors() {
    let h = Harness::new();
    let (_, _, _, occurrences) = lecture_series(&h);
    let id = occurrences[0]["entity"]["id"].clone();
    let cancelled = h.ok(
        "override_occurrence",
        json!({ "entityId": id, "patch": { "cancelled": true } }),
    );
    assert_eq!(cancelled["cancelled"], true);
    h.app_err(
        "override_occurrence",
        json!({ "entityId": MISSING, "patch": {} }),
        "NotFound",
    );
    // Non-nullable fields cannot be cleared with null.
    h.args_err(
        "override_occurrence",
        json!({ "entityId": id, "patch": { "cancelled": "yes" } }),
    );
}

#[test]
fn sessions_update_series_from_date_with_anchor() {
    let h = Harness::new();
    let (space, _, template, occurrences) = lecture_series(&h);
    let first = occurrences[0]["entity"]["id"].as_str().unwrap().to_string();
    let second = occurrences[1]["entity"]["id"].as_str().unwrap().to_string();
    let third = occurrences[2]["entity"]["id"].as_str().unwrap().to_string();
    // The second occurrence overrode its location; the third did too.
    for id in [&second, &third] {
        h.ok(
            "override_occurrence",
            json!({ "entityId": id, "patch": { "location": "Own room" } }),
        );
    }
    // Opened on the second occurrence: it takes the patch even though it
    // overrode the field, the third keeps its own override.
    h.ok(
        "update_session_series",
        json!({
            "templateId": template,
            "fromDate": "2026-01-12",
            "patch": { "location": "H2", "title": "Lecture B" },
            "anchorId": second,
        }),
    );
    assert_eq!(session_by_id(&h, &space, &first)["location"], "H1");
    assert_eq!(session_by_id(&h, &space, &second)["location"], "H2");
    assert_eq!(session_by_id(&h, &space, &third)["location"], "Own room");
    assert_eq!(
        session_by_id(&h, &space, &first)["entity"]["title"],
        "Lecture"
    );
    assert_eq!(
        session_by_id(&h, &space, &third)["entity"]["title"],
        "Lecture B"
    );
}

#[test]
fn sessions_update_series_with_null_anchor_and_null_location() {
    let h = Harness::new();
    let (space, _, template, occurrences) = lecture_series(&h);
    // The frontend sends `anchorId: null` when no occurrence was opened.
    h.ok(
        "update_session_series",
        json!({ "templateId": template, "fromDate": "2026-01-01", "patch": { "location": null }, "anchorId": null }),
    );
    for o in &occurrences {
        let id = o["entity"]["id"].as_str().unwrap();
        assert_eq!(session_by_id(&h, &space, id)["location"], Value::Null);
    }
    // `anchorId` may also be left out entirely.
    h.ok(
        "update_session_series",
        json!({ "templateId": template, "fromDate": "2026-01-01", "patch": { "startTime": "09:00" } }),
    );
    let id = occurrences[0]["entity"]["id"].as_str().unwrap();
    assert_eq!(session_by_id(&h, &space, id)["startTime"], "09:00");
}

#[test]
fn sessions_update_series_errors() {
    let h = Harness::new();
    h.call(
        "update_session_series",
        json!({ "templateId": MISSING, "fromDate": "2026-01-01", "patch": {}, "anchorId": null }),
    )
    .unwrap_err();
    let message = h.args_err(
        "update_session_series",
        json!({ "templateId": MISSING, "fromDate": "2026-01-01" }),
    );
    assert!(message.contains("patch"), "{message}");
}

#[test]
fn sessions_delete_series_from_date() {
    let h = Harness::new();
    let (space, _, template, occurrences) = lecture_series(&h);
    let deleted = h.ok(
        "delete_session_series",
        json!({ "templateId": template, "fromDate": "2026-01-12" }),
    );
    assert_eq!(deleted, json!(2));
    let first = occurrences[0]["entity"]["id"].as_str().unwrap();
    assert!(h.db(|c| db::entities::get_entity(c, first)
        .unwrap()
        .deleted_at
        .is_none()));
    let third = occurrences[2]["entity"]["id"].as_str().unwrap();
    assert!(h.db(|c| db::entities::get_entity(c, third)
        .unwrap()
        .deleted_at
        .is_some()));
    assert_eq!(
        h.ok("list_sessions", json!({ "spaceId": space }))
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn sessions_pages_create_get_and_link() {
    let h = Harness::new();
    let (space, _, _, occurrences) = lecture_series(&h);
    let session = occurrences[0]["entity"]["id"].as_str().unwrap().to_string();
    let empty = h.ok("get_session_pages", json!({ "sessionId": session }));
    assert_eq!(empty, json!({ "jot": null, "note": null }));
    let jot = h.ok(
        "create_session_page",
        json!({ "sessionId": session, "kind": "jot", "title": "Jot" }),
    );
    assert_eq!(jot["type"], "jot");
    // Asking again returns the existing page.
    let again = h.ok(
        "create_session_page",
        json!({ "sessionId": session, "kind": "jot", "title": "Other" }),
    );
    assert_eq!(again["id"], jot["id"]);
    let note = h.note(&space, "Refined");
    assert_eq!(
        h.ok(
            "link_session_page",
            json!({ "sessionId": session, "kind": "note", "pageId": note }),
        ),
        json!(true)
    );
    assert_eq!(
        h.ok(
            "link_session_page",
            json!({ "sessionId": session, "kind": "note", "pageId": note }),
        ),
        json!(false)
    );
    let pages = h.ok("get_session_pages", json!({ "sessionId": session }));
    assert_eq!(
        pages,
        h.db(|c| to_json(db::sessions::get_session_pages(c, &session).unwrap()))
    );
    assert_eq!(pages["note"]["id"], json!(note));
}

#[test]
fn sessions_pages_reject_unknown_kind() {
    let h = Harness::new();
    let (_, _, _, occurrences) = lecture_series(&h);
    let session = occurrences[0]["entity"]["id"].clone();
    h.app_err(
        "create_session_page",
        json!({ "sessionId": session, "kind": "essay", "title": "x" }),
        "InvalidInput",
    );
    h.app_err(
        "link_session_page",
        json!({ "sessionId": session, "kind": "essay", "pageId": MISSING }),
        "InvalidInput",
    );
}

// ---------------------------------------------------------------- calendar

/// A weekly timed calendar series anchored on 2026-03-02 with three
/// occurrences through 2026-03-16. Returns (space, template, occurrences).
fn calendar_series(h: &Harness) -> (String, String, Vec<Value>) {
    let space = h.space("S");
    let template = id_of(&h.ok(
        "create_calendar_entry_template",
        json!({
            "spaceId": space,
            "title": "Standup",
            "recurrence": "weekly",
            "startTime": "09:00",
            "endTime": "09:15",
            "allDay": false,
            "location": "Zoom",
            "description": "daily sync",
            "anchorDate": "2026-03-02",
        }),
    ));
    let occurrences = h.ok(
        "generate_calendar_entry_occurrences",
        json!({ "templateId": template, "untilDate": "2026-03-16" }),
    );
    (space, template, occurrences.as_array().unwrap().clone())
}

fn entry_by_id(h: &Harness, space: &str, id: &str) -> Value {
    h.ok("list_calendar_entries", json!({ "spaceId": space }))
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["entity"]["id"] == id)
        .cloned()
        .unwrap_or_else(|| panic!("no calendar entry {id}"))
}

#[test]
fn calendar_template_generates_and_lists() {
    let h = Harness::new();
    let (space, template, occurrences) = calendar_series(&h);
    let dates: Vec<&str> = occurrences
        .iter()
        .map(|o| o["date"].as_str().unwrap())
        .collect();
    assert_eq!(dates, ["2026-03-02", "2026-03-09", "2026-03-16"]);
    let listed = h.ok("list_calendar_entries", json!({ "spaceId": space }));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::calendar::list_calendar_entries(c, Some(&space)).unwrap()))
    );
    assert_eq!(
        h.ok("list_calendar_entries_all", json!({})),
        h.db(|c| to_json(db::calendar::list_calendar_entries(c, None).unwrap()))
    );
    let templates = h.ok("list_calendar_entry_templates", json!({ "spaceId": space }));
    assert_eq!(
        templates,
        h.db(|c| to_json(db::calendar::list_calendar_entry_templates(c, &space).unwrap()))
    );
    assert_eq!(id_of(&templates[0]), template);
    assert_eq!(templates[0]["recurrence"], "weekly");
}

#[test]
fn calendar_template_validation_errors() {
    let h = Harness::new();
    let space = h.space("S");
    let base = json!({
        "spaceId": space, "title": "x", "recurrence": "weekly", "startTime": null,
        "endTime": null, "allDay": true, "location": null, "description": null,
        "anchorDate": "2026-03-02",
    });
    let with = |key: &str, value: Value| {
        let mut args = base.clone();
        args[key] = value;
        args
    };
    h.ok("create_calendar_entry_template", base.clone());
    let message = h.app_err(
        "create_calendar_entry_template",
        with("recurrence", json!("yearly")),
        "InvalidInput",
    );
    assert!(message.contains("daily"), "{message}");
    h.app_err(
        "create_calendar_entry_template",
        with("anchorDate", json!("2026-02-30")),
        "InvalidInput",
    );
    h.args_err(
        "create_calendar_entry_template",
        with("allDay", json!(null)),
    );
}

#[test]
fn calendar_one_off_with_and_without_end_date() {
    let h = Harness::new();
    let space = h.space("S");
    let single = h.ok(
        "create_one_off_calendar_entry",
        json!({
            "spaceId": space, "title": "Dentist", "date": "2026-04-01",
            "startTime": "14:00", "endTime": "15:00", "allDay": false,
            "location": null, "description": null,
        }),
    );
    assert_eq!(single["endDate"], Value::Null);
    let trip = h.ok(
        "create_one_off_calendar_entry",
        json!({
            "spaceId": space, "title": "Trip", "date": "2026-04-10", "endDate": "2026-04-12",
            "startTime": null, "endTime": null, "allDay": true,
            "location": "Rome", "description": null,
        }),
    );
    assert_eq!(trip["endDate"], "2026-04-12");
    assert_eq!(trip["allDay"], true);
    h.app_err(
        "create_one_off_calendar_entry",
        json!({
            "spaceId": space, "title": "Bad", "date": "2026-04-10", "endDate": "2026-04-09",
            "startTime": null, "endTime": null, "allDay": true,
            "location": null, "description": null,
        }),
        "InvalidInput",
    );
    assert_eq!(
        h.ok("list_calendar_entries", json!({ "spaceId": space }))
            .as_array()
            .unwrap()
            .len(),
        2
    );
}

#[test]
fn calendar_override_patch_null_clears_and_omitted_keeps() {
    let h = Harness::new();
    let (space, _, occurrences) = calendar_series(&h);
    let id = occurrences[1]["entity"]["id"].as_str().unwrap().to_string();
    let patched = h.ok(
        "override_calendar_entry_occurrence",
        json!({ "entityId": id, "patch": { "location": null, "description": "moved" } }),
    );
    assert_eq!(patched["location"], Value::Null);
    assert_eq!(patched["description"], "moved");
    assert_eq!(patched["startTime"], "09:00");
    // Turning it into an all day entry with null times.
    let all_day = h.ok(
        "override_calendar_entry_occurrence",
        json!({ "entityId": id, "patch": { "allDay": true, "startTime": null, "endTime": null } }),
    );
    assert_eq!(all_day["allDay"], true);
    assert_eq!(all_day["startTime"], Value::Null);
    assert_eq!(entry_by_id(&h, &space, &id)["allDay"], true);
    let first = occurrences[0]["entity"]["id"].as_str().unwrap();
    assert_eq!(entry_by_id(&h, &space, first)["location"], "Zoom");
}

#[test]
fn calendar_override_unknown_is_not_found() {
    let h = Harness::new();
    h.app_err(
        "override_calendar_entry_occurrence",
        json!({ "entityId": MISSING, "patch": { "cancelled": true } }),
        "NotFound",
    );
}

#[test]
fn calendar_update_series_with_template_from_date_patch_anchor() {
    let h = Harness::new();
    let (space, template, occurrences) = calendar_series(&h);
    let ids: Vec<String> = occurrences
        .iter()
        .map(|o| o["entity"]["id"].as_str().unwrap().to_string())
        .collect();
    for id in &ids[1..] {
        h.ok(
            "override_calendar_entry_occurrence",
            json!({ "entityId": id, "patch": { "description": "own" } }),
        );
    }
    h.ok(
        "update_calendar_entry_series",
        json!({
            "templateId": template,
            "fromDate": "2026-03-09",
            "patch": { "description": null, "location": "Room 2" },
            "anchorId": ids[1],
        }),
    );
    let first = entry_by_id(&h, &space, &ids[0]);
    assert_eq!(first["location"], "Zoom");
    assert_eq!(first["description"], "daily sync");
    let anchored = entry_by_id(&h, &space, &ids[1]);
    assert_eq!(anchored["location"], "Room 2");
    assert_eq!(
        anchored["description"],
        Value::Null,
        "the anchor takes every patched field"
    );
    let later = entry_by_id(&h, &space, &ids[2]);
    assert_eq!(later["location"], "Room 2");
    assert_eq!(later["description"], "own", "a later override survives");
    let templates = h.ok("list_calendar_entry_templates", json!({ "spaceId": space }));
    assert_eq!(templates[0]["location"], "Room 2");
}

#[test]
fn calendar_update_series_without_anchor() {
    let h = Harness::new();
    let (space, template, occurrences) = calendar_series(&h);
    h.ok(
        "update_calendar_entry_series",
        json!({ "templateId": template, "fromDate": "2026-03-01", "patch": { "title": "Sync" }, "anchorId": null }),
    );
    for o in &occurrences {
        let id = o["entity"]["id"].as_str().unwrap();
        assert_eq!(entry_by_id(&h, &space, id)["entity"]["title"], "Sync");
    }
    h.args_err(
        "update_calendar_entry_series",
        json!({ "templateId": template, "fromDate": "2026-03-01", "patch": { "allDay": "no" } }),
    );
}

#[test]
fn calendar_delete_series_from_date() {
    let h = Harness::new();
    let (space, template, _) = calendar_series(&h);
    assert_eq!(
        h.ok(
            "delete_calendar_entry_series",
            json!({ "templateId": template, "fromDate": "2026-03-16" }),
        ),
        json!(1)
    );
    assert_eq!(
        h.ok("list_calendar_entries", json!({ "spaceId": space }))
            .as_array()
            .unwrap()
            .len(),
        2
    );
}

#[test]
fn calendar_generate_unknown_template_is_not_found() {
    let h = Harness::new();
    h.app_err(
        "generate_calendar_entry_occurrences",
        json!({ "templateId": MISSING, "untilDate": "2026-01-01" }),
        "NotFound",
    );
}

// ----------------------------------------------------------------- recipes

impl Harness {
    fn recipe(&self, space_id: &str) -> String {
        id_of(&self.ok(
            "create_recipe",
            json!({ "spaceId": space_id, "title": "Soup" }),
        ))
    }
}

#[test]
fn recipes_create_get_list() {
    let h = Harness::new();
    let space = h.space("S");
    let id = h.recipe(&space);
    let recipe = h.ok("get_recipe", json!({ "entityId": id }));
    assert_eq!(
        recipe,
        h.db(|c| to_json(db::recipes::get_recipe(c, &id).unwrap()))
    );
    let listed = h.ok("list_recipes", json!({ "spaceId": space }));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::recipes::list_recipes(c, &space).unwrap()))
    );
    h.app_err("get_recipe", json!({ "entityId": MISSING }), "NotFound");
}

#[test]
fn recipes_kind_duration_and_tags() {
    let h = Harness::new();
    let space = h.space("S");
    let id = h.recipe(&space);
    let updated = h.ok(
        "update_recipe_kind",
        json!({ "entityId": id, "kind": "dinner" }),
    );
    assert_eq!(updated["kind"], "dinner");
    h.app_err(
        "update_recipe_kind",
        json!({ "entityId": id, "kind": "brunch" }),
        "InvalidInput",
    );
    let timed = h.ok(
        "update_recipe_duration",
        json!({ "entityId": id, "durationMinutes": 45 }),
    );
    assert_eq!(timed["durationMinutes"], 45);
    let cleared = h.ok(
        "update_recipe_duration",
        json!({ "entityId": id, "durationMinutes": null }),
    );
    assert_eq!(cleared["durationMinutes"], Value::Null);

    let tags = h.ok("list_recipe_tags", json!({}));
    assert_eq!(
        tags,
        h.db(|c| to_json(db::recipes::list_recipe_tags(c).unwrap()))
    );
    let tagged = h.ok(
        "update_recipe_tags",
        json!({ "entityId": id, "tagIds": ["soup", "vegan"] }),
    );
    assert_eq!(tagged["tags"].as_array().unwrap().len(), 2);
    h.app_err(
        "update_recipe_tags",
        json!({ "entityId": id, "tagIds": ["soup", "nope"] }),
        "InvalidInput",
    );
    // A rejected tag list leaves the previous tags in place.
    assert_eq!(
        h.db(|c| db::recipes::get_recipe(c, &id).unwrap().tags.len()),
        2
    );
}

#[test]
fn recipes_ingredients_crud_and_move() {
    let h = Harness::new();
    let space = h.space("S");
    let id = h.recipe(&space);
    let a = h.ok(
        "create_ingredient",
        json!({ "recipeId": id, "text": "salt" }),
    );
    let b = h.ok(
        "create_ingredient",
        json!({ "recipeId": id, "text": "water" }),
    );
    let updated = h.ok(
        "update_ingredient",
        json!({ "ingredientId": a["id"], "text": "sea salt" }),
    );
    assert_eq!(updated["text"], "sea salt");
    h.ok(
        "move_ingredient",
        json!({ "ingredientId": b["id"], "position": 0 }),
    );
    let listed = h.ok("list_ingredients", json!({ "recipeId": id }));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::recipes::list_ingredients(c, &id, false).unwrap()))
    );
    assert_eq!(listed[0]["text"], "water");
    h.ok("delete_ingredient", json!({ "ingredientId": a["id"] }));
    assert_eq!(
        h.ok("list_ingredients", json!({ "recipeId": id }))
            .as_array()
            .unwrap()
            .len(),
        1
    );
    h.app_err(
        "update_ingredient",
        json!({ "ingredientId": MISSING, "text": "x" }),
        "NotFound",
    );
}

#[test]
fn recipes_steps_crud_and_move() {
    let h = Harness::new();
    let space = h.space("S");
    let id = h.recipe(&space);
    let a = h.ok(
        "create_step",
        json!({ "recipeId": id, "text": "boil", "durationMinutes": 10 }),
    );
    // `durationMinutes` defaults to null in the frontend; a missing key works too.
    let b = h.ok("create_step", json!({ "recipeId": id, "text": "serve" }));
    assert_eq!(b["durationMinutes"], Value::Null);
    // `update_step` always sets both: a null duration clears it.
    let updated = h.ok(
        "update_step",
        json!({ "stepId": a["id"], "text": "simmer", "durationMinutes": null }),
    );
    assert_eq!(updated["text"], "simmer");
    assert_eq!(updated["durationMinutes"], Value::Null);
    h.ok("move_step", json!({ "stepId": b["id"], "position": 0 }));
    let listed = h.ok("list_steps", json!({ "recipeId": id }));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::recipes::list_steps(c, &id, false).unwrap()))
    );
    assert_eq!(listed[0]["text"], "serve");
    h.ok("delete_step", json!({ "stepId": a["id"] }));
    assert_eq!(
        h.ok("list_steps", json!({ "recipeId": id }))
            .as_array()
            .unwrap()
            .len(),
        1
    );
    h.app_err("delete_step", json!({ "stepId": MISSING }), "NotFound");
}

#[test]
fn recipes_set_banner_underlying_db_call() {
    // `set_recipe_banner` takes an `AppHandle` for the banners folder; this is
    // the database call it makes with that folder.
    let h = Harness::new();
    let space = h.space("S");
    let id = h.recipe(&space);
    let source = h.dir.file("banner.png", b"not really a png");
    let banners = h.dir.path().join("recipe-banners");
    let (recipe, previous) =
        h.db(|c| db::recipes::set_recipe_banner(c, &banners, &id, &source).unwrap());
    assert_eq!(previous, None);
    let path = recipe.banner_path.unwrap();
    assert!(path.starts_with(banners.to_string_lossy().as_ref()));
    assert_eq!(std::fs::read(&path).unwrap(), b"not really a png");
    let missing = h.dir.path().join("nope.png");
    let err = h.db(|c| db::recipes::set_recipe_banner(c, &banners, &id, &missing).unwrap_err());
    assert!(matches!(err, crate::error::AppError::Io(_)));
}

// ------------------------------------------------------------------- views

#[test]
fn views_create_get_list_update_reorder() {
    let h = Harness::new();
    let space = h.space("S");
    let a = h.ok(
        "create_view",
        json!({ "spaceId": space, "title": "Mine", "module": "tasks", "config": "{}", "icon": null }),
    );
    let b = h.ok(
        "create_view",
        json!({ "spaceId": space, "title": "Theirs", "module": "tasks", "config": "{}", "icon": "star" }),
    );
    let a_id = id_of(&a);
    let b_id = id_of(&b);
    assert_eq!(
        h.ok("get_view", json!({ "entityId": a_id })),
        h.db(|c| to_json(db::views::get_view(c, &a_id).unwrap()))
    );
    let listed = h.ok("list_views", json!({ "spaceId": space, "module": "tasks" }));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::views::list_views(c, &space, Some("tasks")).unwrap()))
    );
    let any_module = h.ok("list_views", json!({ "spaceId": space, "module": null }));
    assert_eq!(any_module.as_array().unwrap().len(), 2);
    h.ok(
        "reorder_views",
        json!({ "spaceId": space, "module": "tasks", "ids": [b_id, a_id] }),
    );
    let order: Vec<String> = h.db(|c| {
        db::views::list_views(c, &space, Some("tasks"))
            .unwrap()
            .into_iter()
            .map(|v| v.entity.id)
            .collect()
    });
    assert_eq!(order, [b_id.clone(), a_id.clone()]);
    let updated = h.ok(
        "update_view_config",
        json!({ "entityId": a_id, "config": "{\"groupBy\":\"status\"}" }),
    );
    assert_eq!(updated["config"], "{\"groupBy\":\"status\"}");
}

#[test]
fn views_validate_module_and_config() {
    let h = Harness::new();
    let space = h.space("S");
    h.app_err(
        "create_view",
        json!({ "spaceId": space, "title": "x", "module": "recipes", "config": "{}", "icon": null }),
        "InvalidInput",
    );
    h.app_err(
        "create_view",
        json!({ "spaceId": space, "title": "x", "module": "tasks", "config": "[]", "icon": null }),
        "InvalidInput",
    );
    let view = id_of(&h.ok(
        "create_view",
        json!({ "spaceId": space, "title": "x", "module": "tasks", "config": "{}", "icon": null }),
    ));
    h.app_err(
        "update_view_config",
        json!({ "entityId": view, "config": "not json" }),
        "InvalidInput",
    );
    h.app_err("get_view", json!({ "entityId": MISSING }), "NotFound");
}

#[test]
fn views_reorder_overview_across_spaces() {
    let h = Harness::new();
    let a = h.space("A");
    let b = h.space("B");
    let va = id_of(&h.ok(
        "create_view",
        json!({ "spaceId": a, "title": "A", "module": "tasks-overview", "config": "{}", "icon": null }),
    ));
    let vb = id_of(&h.ok(
        "create_view",
        json!({ "spaceId": b, "title": "B", "module": "tasks-overview", "config": "{}", "icon": null }),
    ));
    h.ok(
        "reorder_overview_views",
        json!({ "module": "tasks-overview", "ids": [vb, va] }),
    );
    let pa = h.ok("get_view", json!({ "entityId": va }))["position"]
        .as_i64()
        .unwrap();
    let pb = h.ok("get_view", json!({ "entityId": vb }))["position"]
        .as_i64()
        .unwrap();
    assert!(pb < pa, "{pb} {pa}");
}

// ------------------------------------------------------------------- files

impl Harness {
    fn files_dir(&self) -> PathBuf {
        self.dir.path().join("files")
    }

    /// An imported File, through the database call `import_file` makes.
    fn stored_file(&self, space: &str, name: &str, contents: &[u8]) -> db::files::FileEntity {
        let source = self.dir.file(name, contents);
        let dir = self.files_dir();
        self.db(|c| db::files::import_file(c, &dir, space.to_string(), &source).unwrap())
    }
}

#[test]
fn files_import_underlying_db_call() {
    let h = Harness::new();
    let space = h.space("S");
    let file = h.stored_file(&space, "notes.txt", b"hello");
    let local = file.local_path.clone().unwrap();
    assert!(local.starts_with(h.files_dir().to_string_lossy().as_ref()));
    assert_eq!(std::fs::read(&local).unwrap(), b"hello");
    assert_eq!(file.original_filename.as_deref(), Some("notes.txt"));
}

#[test]
fn files_pasted_bytes_underlying_db_call() {
    let h = Harness::new();
    let space = h.space("S");
    let dir = h.files_dir();
    // The webview sends the filename percent encoded in `x-filename`.
    let file = h.db(|c| {
        db::files::store_pasted_file(c, &dir, space.clone(), "my%20image.png", b"png").unwrap()
    });
    assert_eq!(file.original_filename.as_deref(), Some("my image.png"));
    let unusable =
        h.db(|c| db::files::store_pasted_file(c, &dir, space.clone(), "%2F%2E%2E", b"x").unwrap());
    assert!(unusable.original_filename.is_some());
}

#[test]
fn files_link_imports_reject_bad_urls_offline() {
    // `import_file_from_url` and `download_linked_file` start with this
    // download; a malformed URL fails before any request is made.
    assert!(db::files::download("not a url").is_err());
    // `download_linked_file` first requires a stored link.
    let h = Harness::new();
    let space = h.space("S");
    let file = h.stored_file(&space, "a.txt", b"a");
    assert_eq!(
        h.db(|c| db::files::get_file(c, &file.entity.id).unwrap().url),
        None
    );
}

#[test]
fn files_reference_copy_and_replace_underlying_db_calls() {
    let h = Harness::new();
    let space = h.space("S");
    let original = h.dir.file("ref.txt", b"v1");
    let referenced = h.db(|c| db::files::reference_file(c, space.clone(), &original).unwrap());
    assert_eq!(referenced.local_path, None);
    assert_eq!(
        referenced.source_path.as_deref(),
        Some(original.to_string_lossy().as_ref())
    );
    let missing = h.dir.path().join("missing.txt");
    let err = h.db(|c| db::files::reference_file(c, space.clone(), &missing).unwrap_err());
    assert!(matches!(err, crate::error::AppError::InvalidInput(_)));

    let dir = h.files_dir();
    let copied = h.db(|c| db::files::copy_into_storage(c, &dir, &referenced.entity.id).unwrap());
    let stored = copied.local_path.clone().unwrap();
    assert_eq!(std::fs::read(&stored).unwrap(), b"v1");
    assert!(original.exists(), "the original is left where it was");

    let newer = h.dir.file("ref-v2.txt", b"v2");
    let (replaced, previous) =
        h.db(|c| db::files::replace_file(c, &dir, &referenced.entity.id, &newer).unwrap());
    assert_eq!(std::fs::read(replaced.local_path.unwrap()).unwrap(), b"v2");
    assert_eq!(previous.as_deref(), Some(stored.as_str()));
}

#[test]
fn files_list_and_get_underlying_db_calls() {
    let h = Harness::new();
    let space = h.space("S");
    let file = h.stored_file(&space, "a.txt", b"a");
    let listed = h.db(|c| db::files::list_files(c, &space).unwrap());
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].entity.id, file.entity.id);
    let err = h.db(|c| db::files::get_file(c, MISSING).unwrap_err());
    assert!(matches!(err, crate::error::AppError::NotFound(_)));
}

#[test]
fn files_open_reveal_and_open_with_resolve_the_path() {
    // These three hand the stored copy (or the referenced original) to the
    // OS. `list_open_with_apps` resolves the path the same way and is
    // invokable, so the path rules are checked through it.
    let h = Harness::new();
    h.app_err(
        "list_open_with_apps",
        json!({ "entityId": MISSING }),
        "NotFound",
    );
    let space = h.space("S");
    let file = h.stored_file(&space, "a.txt", b"a");
    let apps = h.ok("list_open_with_apps", json!({ "entityId": file.entity.id }));
    assert!(apps.is_array());
}

#[test]
fn files_set_added_at() {
    let h = Harness::new();
    let space = h.space("S");
    let file = h.stored_file(&space, "a.txt", b"a");
    let updated = h.ok(
        "set_file_added_at",
        json!({ "entityId": file.entity.id, "addedAt": "2020-02-02" }),
    );
    assert_eq!(updated["entity"]["createdAt"], "2020-02-02T00:00:00+00:00");
    h.app_err(
        "set_file_added_at",
        json!({ "entityId": MISSING, "addedAt": "2020-02-02" }),
        "NotFound",
    );
}

#[test]
fn files_set_added_at_rejects_invalid_dates() {
    let h = Harness::new();
    let space = h.space("S");
    let file = h.stored_file(&space, "a.txt", b"a");
    let before = h.ok("get_entity", json!({ "id": file.entity.id }));
    // Anything that is not a valid date or RFC 3339 timestamp is InvalidInput
    // and leaves created_at untouched.
    for bad in ["tomorrow", "2020-13-45", "2020-02-30", ""] {
        h.app_err(
            "set_file_added_at",
            json!({ "entityId": file.entity.id, "addedAt": bad }),
            "InvalidInput",
        );
    }
    assert_eq!(
        h.ok("get_entity", json!({ "id": file.entity.id }))["createdAt"],
        before["createdAt"]
    );
}

#[test]
fn files_reindex_missing_matches_the_db_summary() {
    let h = Harness::new();
    let space = h.space("S");
    h.stored_file(&space, "a.txt", b"searchable words");
    // `reindex_missing_files` takes an `AppHandle`, so it can't run on the mock
    // runtime; it lists `reindex_jobs` and stores what `extract_file_text` finds.
    let jobs = h.db(|c| db::files::reindex_jobs(c, Some(&space)).unwrap());
    assert_eq!(jobs.len(), 0, "a plain text file is indexed on import");
    let summary = h.db(|c| db::files::reindex_missing(c, Some(&space)).unwrap());
    assert_eq!(summary.reindexed, 0);
}

#[test]
fn files_export_copies_the_stored_file() {
    let h = Harness::new();
    let space = h.space("S");
    let file = h.stored_file(&space, "a.txt", b"exported");
    let destination = h.dir.path().join("out.txt");
    h.ok(
        "export_file",
        json!({ "entityId": file.entity.id, "destination": destination.to_string_lossy() }),
    );
    assert_eq!(std::fs::read(&destination).unwrap(), b"exported");
    h.app_err(
        "export_file",
        json!({ "entityId": file.entity.id, "destination": h.dir.path().join("no/such/dir.txt").to_string_lossy() }),
        "Io",
    );
    h.app_err(
        "export_file",
        json!({ "entityId": MISSING, "destination": destination.to_string_lossy() }),
        "NotFound",
    );
}

// ------------------------------------------------------------------ office

#[test]
fn office_converter_available_is_a_bool() {
    let h = Harness::new();
    assert!(h.ok("office_converter_available", json!({})).is_boolean());
}

#[test]
fn office_install_options_are_platform_facts() {
    // `install_libreoffice` runs brew or downloads a disk image: never run here.
    let h = Harness::new();
    let options = h.ok("libreoffice_install_options", json!({}));
    assert!(options["brew"].is_boolean());
    assert_eq!(options["direct"], cfg!(target_os = "macos"));
}

#[test]
fn office_convert_has_no_link_only_source() {
    // `convert_office_to_pdf` takes an `AppHandle`. Its first step reads the
    // File's local copy or referenced original; an unknown File stops there.
    let h = Harness::new();
    let err = h.db(|c| db::files::get_file(c, MISSING).unwrap_err());
    assert!(matches!(err, crate::error::AppError::NotFound(_)));
}

// --------------------------------------------------------------- bookmarks

#[test]
fn bookmarks_create_get_list_update() {
    let h = Harness::new();
    let space = h.space("S");
    let created = h.ok(
        "create_bookmark",
        json!({ "spaceId": space, "url": "https://example.com" }),
    );
    let id = id_of(&created);
    assert_eq!(created["url"], "https://example.com");
    assert_eq!(
        h.ok("get_bookmark", json!({ "entityId": id })),
        h.db(|c| to_json(db::bookmarks::get_bookmark(c, &id).unwrap()))
    );
    let listed = h.ok("list_bookmarks", json!({ "spaceId": space }));
    assert_eq!(
        listed,
        h.db(|c| to_json(db::bookmarks::list_bookmarks(c, &space).unwrap()))
    );
    let updated = h.ok(
        "update_bookmark_url",
        json!({ "entityId": id, "url": "https://example.org" }),
    );
    assert_eq!(updated["url"], "https://example.org");
    h.app_err("get_bookmark", json!({ "entityId": MISSING }), "NotFound");
}

#[test]
fn bookmarks_preferred_image_set_and_clear() {
    let h = Harness::new();
    let space = h.space("S");
    let id = id_of(&h.ok(
        "create_bookmark",
        json!({ "spaceId": space, "url": "https://example.com" }),
    ));
    let set = h.ok(
        "set_bookmark_preferred_image",
        json!({ "entityId": id, "preferredImage": "screenshot" }),
    );
    assert_eq!(set["preferredImage"], "screenshot");
    let cleared = h.ok(
        "set_bookmark_preferred_image",
        json!({ "entityId": id, "preferredImage": null }),
    );
    assert_eq!(cleared["preferredImage"], Value::Null);
}

#[test]
fn bookmarks_preferred_image_is_validated_over_ipc() {
    let h = Harness::new();
    let space = h.space("S");
    let id = id_of(&h.ok(
        "create_bookmark",
        json!({ "spaceId": space, "url": "https://example.com" }),
    ));
    // The command and the CLI agree: only "screenshot", "preview" or null
    // (clear) are accepted; anything else is InvalidInput and changes nothing.
    h.app_err(
        "set_bookmark_preferred_image",
        json!({ "entityId": id, "preferredImage": "banana" }),
        "InvalidInput",
    );
    let unchanged = h.db(|c| db::bookmarks::get_bookmark(c, &id).unwrap());
    assert_eq!(unchanged.preferred_image, None);
    for ok in ["screenshot", "preview"] {
        let set = h.ok(
            "set_bookmark_preferred_image",
            json!({ "entityId": id, "preferredImage": ok }),
        );
        assert_eq!(set["preferredImage"], ok);
    }
}

#[test]
fn bookmarks_fetch_metadata_with_a_malformed_url_fails_offline() {
    let h = Harness::new();
    let space = h.space("S");
    let id = id_of(&h.ok(
        "create_bookmark",
        json!({ "spaceId": space, "url": "https://example.com" }),
    ));
    let message = h.app_err(
        "fetch_bookmark_metadata",
        json!({ "entityId": id, "url": "not a url" }),
        "Db",
    );
    assert!(message.starts_with("fetch failed"), "{message}");
    let bookmark = h.db(|c| db::bookmarks::get_bookmark(c, &id).unwrap());
    assert_eq!(bookmark.metadata_fetched_at, None);
}

#[test]
fn bookmarks_screenshot_path_is_recorded() {
    // `capture_bookmark_screenshot` renders the page in a real webview; this
    // is the database call it ends with.
    let h = Harness::new();
    let space = h.space("S");
    let id = id_of(&h.ok(
        "create_bookmark",
        json!({ "spaceId": space, "url": "https://example.com" }),
    ));
    let shot = h.dir.file("shot.jpg", b"jpg");
    let bookmark =
        h.db(|c| db::bookmarks::set_screenshot(c, &id, &shot.to_string_lossy()).unwrap());
    assert_eq!(
        bookmark.screenshot_path.as_deref(),
        Some(shot.to_string_lossy().as_ref())
    );
    let err = h.db(|c| db::bookmarks::set_screenshot(c, MISSING, "x").unwrap_err());
    assert!(matches!(err, crate::error::AppError::NotFound(_)));
}

// --------------------------------------------------------------------- cli

#[test]
fn cli_install_status_reports_this_platform() {
    // `install_cli` creates a symlink on the PATH: never run here. The status
    // check only reads (and probes writability with a removed temp file).
    let h = Harness::new();
    let status = h.ok("cli_install_status", json!({}));
    assert_eq!(status["supported"], cfg!(unix));
    assert!(status["installed"].is_boolean());
}

// ------------------------------------------------------- external calendars

fn icloud_store() -> Value {
    json!({
        "connections": [{
            "provider": "icloud",
            "account": "me@icloud.com",
            "calendars": [
                { "id": "home", "name": "Home", "color": null, "selected": true },
                { "id": "work", "name": "Work", "color": "#f00", "selected": false },
            ],
            "lastSyncedAt": null,
            "lastError": null,
        }],
        "events": [{
            "id": "e1", "provider": "icloud", "calendarId": "home", "calendarName": "Home",
            "color": null, "title": "Dinner", "location": null, "allDay": true,
            "start": "2026-05-01", "end": "2026-05-02",
        }],
    })
}

#[test]
fn external_calendars_status_without_connections() {
    // `connect_google_calendar` takes an `AppHandle` and opens a browser; the
    // status it reports into is checked instead.
    let h = Harness::new();
    let status = h.ok("external_calendar_status", json!({}));
    assert_eq!(status["connections"], json!([]));
    assert_eq!(
        status["googleAvailable"],
        crate::external_calendars::google::available()
    );
    assert_eq!(
        h.ok("cancel_google_calendar_connect", json!({})),
        Value::Null
    );
    assert_eq!(h.ok("sync_external_calendars", json!({})), json!([]));
    assert_eq!(
        h.ok(
            "list_external_events",
            json!({ "from": "2026-01-01", "to": "2026-12-31" })
        ),
        json!([])
    );
}

#[test]
fn external_calendars_cached_events_and_selection() {
    let h = Harness::with_external_store(Some(icloud_store()));
    let status = h.ok("external_calendar_status", json!({}));
    assert_eq!(status["connections"][0]["account"], "me@icloud.com");
    let events = h.ok(
        "list_external_events",
        json!({ "from": "2026-05-01", "to": "2026-05-01" }),
    );
    assert_eq!(events.as_array().unwrap().len(), 1);
    assert!(h
        .ok(
            "list_external_events",
            json!({ "from": "2026-06-01", "to": "2026-06-30" })
        )
        .as_array()
        .unwrap()
        .is_empty());

    let updated = h.ok(
        "set_external_calendar_selected",
        json!({ "provider": "icloud", "calendarId": "home", "selected": false }),
    );
    assert_eq!(updated["calendars"][0]["selected"], false);
    // Deselecting drops that calendar's cached events, and it is persisted.
    assert!(h
        .ok(
            "list_external_events",
            json!({ "from": "2026-05-01", "to": "2026-05-01" })
        )
        .as_array()
        .unwrap()
        .is_empty());
    let saved: Value = serde_json::from_str(
        &std::fs::read_to_string(h.dir.path().join("external-calendars.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(saved["connections"][0]["calendars"][0]["selected"], false);
}

#[test]
fn external_calendars_selection_errors() {
    let h = Harness::with_external_store(Some(icloud_store()));
    h.app_err(
        "set_external_calendar_selected",
        json!({ "provider": "google", "calendarId": "home", "selected": true }),
        "NotFound",
    );
    h.app_err(
        "set_external_calendar_selected",
        json!({ "provider": "icloud", "calendarId": "nope", "selected": true }),
        "NotFound",
    );
    let message = h.args_err(
        "set_external_calendar_selected",
        json!({ "provider": "outlook", "calendarId": "home", "selected": true }),
    );
    assert!(message.contains("provider"), "{message}");
}

#[test]
fn external_calendars_argument_errors_never_reach_the_network_or_keychain() {
    let h = Harness::new();
    // Both would contact iCloud or the keychain if their arguments parsed.
    let message = h.args_err(
        "connect_icloud_calendar",
        json!({ "appleId": "me@icloud.com" }),
    );
    assert!(message.contains("appPassword"), "{message}");
    h.args_err(
        "disconnect_external_calendar",
        json!({ "provider": "Google" }),
    );
    h.args_err("disconnect_external_calendar", json!({}));
}

#[test]
fn external_calendars_corrupt_store_loads_empty() {
    let h = Harness::new();
    let dir = TempDir::new();
    dir.file("external-calendars.json", b"{ not json");
    let state = crate::external_calendars::ExternalCalendarState::load(dir.path());
    let connections = tauri::async_runtime::block_on(state.connections());
    assert!(connections.is_empty());
    drop(h);
}

// ------------------------------------------------------------------ backup

#[test]
fn backup_list_of_a_missing_folder_is_empty() {
    let h = Harness::new();
    let folder = h.dir.path().join("never-created");
    assert_eq!(
        h.ok(
            "list_backups",
            json!({ "folder": folder.to_string_lossy() })
        ),
        json!([])
    );
}

#[test]
fn backup_inspect_rejects_a_non_backup() {
    let h = Harness::new();
    let bogus = h.dir.file("bogus.zip", b"not a zip");
    let err = h
        .call("inspect_backup", json!({ "path": bogus.to_string_lossy() }))
        .unwrap_err();
    assert!(err["kind"].is_string(), "{err}");
    h.args_err("inspect_backup", json!({ "file": "x" }));
}

#[test]
fn backup_create_and_restore_underlying_calls() {
    // `create_backup` and `restore_backup` take an `AppHandle` for the data
    // folder; these are the calls they make, against a temp data folder. The
    // result is then read back through the invokable commands.
    let h = Harness::new();
    let space = h.space("Backed up");
    h.note(&space, "keep me");
    let data_dir = h.dir.path().join("data");
    std::fs::create_dir_all(&data_dir).unwrap();
    let dest = h.dir.path().join("backups");
    let info = {
        let snapshot = h.db(|c| crate::backup::snapshot(c).unwrap());
        crate::backup::create_backup(snapshot, &data_dir, &dest, 3).unwrap()
    };
    let listed = h.ok("list_backups", json!({ "folder": dest.to_string_lossy() }));
    assert_eq!(listed, to_json(crate::backup::list_backups(&dest).unwrap()));
    assert_eq!(listed.as_array().unwrap().len(), 1);
    let manifest = h.ok("inspect_backup", json!({ "path": info.path }));
    assert_eq!(
        manifest["schemaVersion"],
        json!(db::latest_schema_version())
    );

    let restore_into = h.dir.path().join("restore-data");
    std::fs::create_dir_all(&restore_into).unwrap();
    let staged =
        crate::backup::stage_restore(&restore_into, std::path::Path::new(&info.path)).unwrap();
    assert_eq!(to_json(staged), manifest);
}

#[test]
fn agent_files_underlying_calls() {
    // The agent file commands take an `AppHandle` for the app data folder; these are
    // the calls they make, against a temp folder. `reveal_agent_dir` only opens it.
    use crate::commands::agent_files as agent;
    let h = Harness::new();
    let dir = h.dir.path().join("agent");
    let listed = agent::list(&dir).unwrap();
    assert_eq!(listed[0].name, "AGENTS.md");
    agent::write(&dir, "PROFILE.md", "hello").unwrap();
    assert_eq!(agent::read(&dir, "PROFILE.md").unwrap(), "hello");
    agent::delete(&dir, "PROFILE.md").unwrap();
    assert_eq!(agent::list(&dir).unwrap().len(), 1);
    assert!(agent::validate_name("../x.md").is_err());
}

#[test]
fn settings_file_is_created_without_touching_an_existing_one() {
    // `open_settings_file` takes an `AppHandle` and hands the file to the OS; this is
    // the file it makes first.
    use crate::commands::settings_file::ensure_settings_file;
    let h = Harness::new();
    let dir = h.dir.path().join("settings-data");
    let path = ensure_settings_file(&dir).unwrap();
    assert_eq!(std::fs::read_to_string(&path).unwrap().trim(), "{}");
    std::fs::write(&path, "{\"a\": 1}").unwrap();
    ensure_settings_file(&dir).unwrap();
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\"a\": 1}");
}
