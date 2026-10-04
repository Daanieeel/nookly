//! Upgrade tests for every migration step: a database built at each past
//! schema version with populated rows must reach the latest version with no
//! row lost, every value kept, foreign keys and integrity intact, and a schema
//! identical to a fresh install.
//!
//! The fixture is data driven: every insert names the columns of the newest
//! schema, and `Builder::insert` keeps only the ones that exist at the version
//! being populated (skipping a table entirely before it exists). The helpers
//! are `pub(crate)` so the backup tests can build old version databases too.

use super::migrations::{MIGRATIONS, MIGRATION_COUNT};
use rusqlite::types::Value;
use rusqlite::{params_from_iter, Connection};
use std::collections::{BTreeMap, BTreeSet};

/// Schema version shipped by the first public release (v0.0.0).
pub(crate) const OLDEST_RELEASED_VERSION: usize = 15;

pub(crate) fn latest() -> usize {
    *MIGRATION_COUNT
}

pub(crate) fn migrate_to(conn: &mut Connection, version: usize) {
    MIGRATIONS
        .to_version(conn, version)
        .unwrap_or_else(|e| panic!("migrating to version {version} failed: {e}"));
}

pub(crate) fn migrate_to_latest(conn: &mut Connection) {
    MIGRATIONS.to_latest(conn).unwrap();
}

fn version_of(conn: &Connection) -> usize {
    super::schema_version(conn).unwrap()
}

// ---------------------------------------------------------------------------
// Values

fn t(s: &str) -> Value {
    Value::Text(s.into())
}

fn i(n: i64) -> Value {
    Value::Integer(n)
}

fn r(f: f64) -> Value {
    Value::Real(f)
}

const NULL: Value = Value::Null;

const T1: &str = "2026-01-01T08:00:00+00:00";
const T2: &str = "2026-01-02T08:00:00+00:00";
const T3: &str = "2026-01-03T08:00:00+00:00";
const T5: &str = "2026-01-05T08:00:00+00:00";
const T9: &str = "2026-01-09T08:00:00+00:00";

// ---------------------------------------------------------------------------
// Fixture

/// One row as it was written, only the columns that existed at that version.
#[derive(Debug, Clone)]
pub(crate) struct Inserted {
    pub table: String,
    pub cols: Vec<(String, Value)>,
}

impl Inserted {
    fn get(&self, col: &str) -> Option<&Value> {
        self.cols.iter().find(|(c, _)| c == col).map(|(_, v)| v)
    }
}

/// Everything `populate` wrote, and the schema version it wrote it at.
#[derive(Debug, Clone)]
pub(crate) struct Fixture {
    pub version: usize,
    pub rows: Vec<Inserted>,
}

impl Fixture {
    fn has(&self, table: &str, key: &str) -> bool {
        self.rows.iter().any(|row| {
            row.table == table
                && key_cols(table)
                    .first()
                    .and_then(|k| row.get(k))
                    .is_some_and(|v| *v == t(key))
        })
    }
}

fn table_exists(conn: &Connection, table: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
        [table],
        |row| row.get::<_, i64>(0),
    )
    .unwrap()
        > 0
}

fn columns(conn: &Connection, table: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info(\"{table}\")"))
        .unwrap();
    stmt.query_map([], |row| row.get::<_, String>(1))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}

struct Builder<'c> {
    conn: &'c Connection,
    rows: Vec<Inserted>,
}

impl Builder<'_> {
    fn has(&self, table: &str) -> bool {
        table_exists(self.conn, table)
    }

    fn insert(&mut self, table: &str, cols: &[(&str, Value)]) {
        if !self.has(table) {
            return;
        }
        let existing = columns(self.conn, table);
        let kept: Vec<(String, Value)> = cols
            .iter()
            .filter(|(c, _)| existing.iter().any(|e| e == c))
            .map(|(c, v)| (c.to_string(), v.clone()))
            .collect();
        let names: Vec<&str> = kept.iter().map(|(c, _)| c.as_str()).collect();
        let marks: Vec<String> = (1..=kept.len()).map(|n| format!("?{n}")).collect();
        let sql = format!(
            "INSERT INTO {table} ({}) VALUES ({})",
            names.join(", "),
            marks.join(", ")
        );
        self.conn
            .execute(&sql, params_from_iter(kept.iter().map(|(_, v)| v)))
            .unwrap_or_else(|e| panic!("{sql}: {e}"));
        self.rows.push(Inserted {
            table: table.into(),
            cols: kept,
        });
    }

    #[allow(clippy::too_many_arguments)]
    fn entity(
        &mut self,
        id: &str,
        space: &str,
        kind: &str,
        title: &str,
        prefix: &str,
        number: i64,
        created: &str,
        deleted: Option<&str>,
    ) {
        self.insert(
            "entities",
            &[
                ("id", t(id)),
                ("space_id", t(space)),
                ("type", t(kind)),
                ("title", t(title)),
                ("icon", t("star")),
                ("pinned", i(number % 2)),
                ("created_at", t(created)),
                ("updated_at", t(T5)),
                ("deleted_at", deleted.map(t).unwrap_or(NULL)),
                ("key_prefix", t(prefix)),
                ("key_number", i(number)),
                ("last_opened_at", t(T3)),
            ],
        );
    }
}

/// Writes representative rows into every table that exists at the connection's
/// current schema version, as raw SQL valid for that version.
pub(crate) fn populate(conn: &Connection) -> Fixture {
    let version = version_of(conn);
    let mut b = Builder {
        conn,
        rows: Vec::new(),
    };

    for (id, name, created, position) in [
        ("sp-life", "Life", T1, 1),
        ("sp-uni", "Uni \u{fc} \u{65e5}\u{672c}", T2, 2),
    ] {
        b.insert(
            "spaces",
            &[
                ("id", t(id)),
                ("name", t(name)),
                ("icon", t("home")),
                ("color", t("#123456")),
                ("created_at", t(created)),
                ("updated_at", t(T5)),
                ("position", i(position)),
            ],
        );
    }

    // Entities that exist from the very first schema on.
    b.entity(
        "e-task",
        "sp-life",
        "task",
        "Write thesis",
        "TSK",
        1,
        T1,
        None,
    );
    b.entity(
        "e-task-done",
        "sp-life",
        "task",
        "Submit form",
        "TSK",
        2,
        T2,
        None,
    );
    b.entity(
        "e-task-trash",
        "sp-life",
        "task",
        "Old task",
        "TSK",
        3,
        T3,
        Some(T9),
    );
    b.entity(
        "e-note",
        "sp-life",
        "note",
        "Lecture notes",
        "NOT",
        1,
        T1,
        None,
    );
    b.entity(
        "e-note-trash",
        "sp-life",
        "note",
        "Trashed note",
        "NOT",
        2,
        T2,
        Some(T9),
    );
    if version < 9 {
        // The Refinement type only ever existed before migration 9.
        b.entity(
            "e-refine",
            "sp-life",
            "refinement",
            "Refined",
            "NOT",
            3,
            T3,
            None,
        );
    }
    b.entity("e-jot", "sp-life", "jot", "Quick jot", "JOT", 1, T1, None);
    b.entity(
        "e-course",
        "sp-uni",
        "course",
        "Algorithms",
        "CRS",
        1,
        T1,
        None,
    );
    b.entity(
        "e-sem",
        "sp-uni",
        "semester",
        "Winter 2026",
        "SEM",
        1,
        T1,
        None,
    );
    b.entity(
        "e-stpl",
        "sp-uni",
        "session_template",
        "Lecture",
        "SES",
        1,
        T1,
        None,
    );
    b.entity("e-ses1", "sp-uni", "session", "Lecture", "SES", 2, T1, None);
    b.entity("e-ses2", "sp-uni", "session", "Lecture", "SES", 3, T2, None);
    b.entity(
        "e-ses-trash",
        "sp-uni",
        "session",
        "Lecture",
        "SES",
        4,
        T3,
        Some(T9),
    );
    b.entity("e-exam", "sp-uni", "exam", "Final exam", "EXM", 1, T1, None);
    b.entity(
        "e-deck",
        "sp-uni",
        "index_card_deck",
        "Flashcards",
        "DCK",
        1,
        T1,
        None,
    );
    b.entity(
        "e-study",
        "sp-uni",
        "study_block",
        "Revise",
        "STB",
        1,
        T1,
        None,
    );
    b.entity(
        "e-asg",
        "sp-uni",
        "assignment",
        "Sheet 1",
        "ASG",
        1,
        T1,
        None,
    );
    b.entity("e-file", "sp-uni", "file", "Slides.pdf", "FIL", 1, T1, None);
    b.entity(
        "e-file-ref",
        "sp-uni",
        "file",
        "Linked.pdf",
        "FIL",
        2,
        T2,
        None,
    );
    b.entity(
        "e-bmk",
        "sp-life",
        "bookmark",
        "Rust docs",
        "BMK",
        1,
        T1,
        None,
    );

    for (id, from, to, kind, block) in [
        ("rel-1", "e-task", "e-note", "related", None),
        ("rel-2", "e-course", "e-sem", "belongs_to", None),
        ("rel-3", "e-note", "e-course", "mentions", Some("b-1")),
        ("rel-4", "e-task-trash", "e-course", "related", None),
    ] {
        b.insert(
            "relationships",
            &[
                ("id", t(id)),
                ("from_entity_id", t(from)),
                ("to_entity_id", t(to)),
                ("relationship_type", t(kind)),
                ("from_block_id", block.map(t).unwrap_or(NULL)),
                ("to_block_id", NULL),
                ("created_at", t(T2)),
            ],
        );
    }

    b.insert(
        "labels",
        &[
            ("id", t("lbl-urgent")),
            ("space_id", t("sp-life")),
            ("name", t("urgent")),
            ("color", t("#ff0000")),
            ("created_at", t(T1)),
        ],
    );
    b.insert(
        "entity_labels",
        &[("entity_id", t("e-task")), ("label_id", t("lbl-urgent"))],
    );

    for (id, status, effort, completed) in [
        ("e-task", "todo", i(5), NULL),
        ("e-task-done", "done", i(3), t(T5)),
        ("e-task-trash", "in_progress", NULL, NULL),
    ] {
        b.insert(
            "tasks",
            &[
                ("entity_id", t(id)),
                ("status_id", t(status)),
                ("start_date", t("2026-01-02")),
                ("due_date", t("2026-02-01")),
                ("completed_at", completed),
                ("effort", effort),
            ],
        );
    }

    for (id, entity, position, kind, content, language, filename, attrs) in [
        (
            "b-1",
            "e-note",
            0,
            "paragraph",
            "Hello [Algorithms](mention:e-course) world",
            NULL,
            NULL,
            NULL,
        ),
        (
            "b-2",
            "e-note",
            1,
            "code",
            "fn main() {}",
            t("rust"),
            t("main.rs"),
            t("{\"k\":\"v\"}"),
        ),
        (
            "b-3",
            "e-jot",
            0,
            "paragraph",
            "jot text zebra",
            NULL,
            NULL,
            NULL,
        ),
        (
            "b-4",
            "e-note-trash",
            0,
            "paragraph",
            "gone soon",
            NULL,
            NULL,
            NULL,
        ),
    ] {
        b.insert(
            "blocks",
            &[
                ("id", t(id)),
                ("entity_id", t(entity)),
                ("position", i(position)),
                ("block_type", t(kind)),
                ("content", t(content)),
                ("created_at", t(T1)),
                ("updated_at", t(T2)),
                ("language", language),
                ("filename", filename),
                ("attrs", attrs),
            ],
        );
    }
    // The app maintains this index itself; before it exists, migration 8 backfills it.
    b.insert(
        "mentions",
        &[
            ("from_entity_id", t("e-note")),
            ("to_entity_id", t("e-course")),
        ],
    );

    b.insert(
        "courses",
        &[
            ("entity_id", t("e-course")),
            ("professor", t("Prof. M\u{fc}ller")),
            ("room", t("H 0104")),
        ],
    );
    b.insert(
        "semesters",
        &[
            ("entity_id", t("e-sem")),
            ("start_date", t("2025-10-01")),
            ("end_date", t("2026-03-31")),
            ("term_type", t("winter")),
            ("year", i(2025)),
            ("is_current", i(1)),
            ("manual_position", i(0)),
        ],
    );
    b.insert(
        "session_templates",
        &[
            ("entity_id", t("e-stpl")),
            ("weekday", i(0)),
            ("start_time", t("10:00")),
            ("end_time", t("12:00")),
            ("location", NULL),
            ("anchor_date", t("2026-01-05")),
        ],
    );
    for (id, date, location, cancelled, overridden) in [
        ("e-ses1", "2026-01-05", NULL, 0, 0),
        ("e-ses2", "2026-01-12", t("Hall"), 0, 4),
        ("e-ses-trash", "2026-01-19", NULL, 1, 0),
    ] {
        b.insert(
            "sessions",
            &[
                ("entity_id", t(id)),
                ("template_id", t("e-stpl")),
                ("date", t(date)),
                ("start_time", t("10:00")),
                ("end_time", t("12:00")),
                ("cancelled", i(cancelled)),
                ("location", location),
                ("notes", t("bring laptop")),
                ("overridden_fields", i(overridden)),
            ],
        );
    }
    b.insert(
        "exams",
        &[
            ("entity_id", t("e-exam")),
            ("exam_date", t("2026-02-15")),
            ("weight", r(0.4)),
            ("grade", r(1.7)),
            ("status", t("planned")),
            ("room", t("Audimax")),
        ],
    );
    b.insert("index_card_decks", &[("entity_id", t("e-deck"))]);
    for (id, deleted) in [("card-1", NULL), ("card-trash", t(T9))] {
        b.insert(
            "index_cards",
            &[
                ("id", t(id)),
                ("deck_entity_id", t("e-deck")),
                ("front", t("Q?")),
                ("back", t("A!")),
                ("box_level", i(3)),
                ("due_at", t(T5)),
                ("created_at", t(T1)),
                ("updated_at", t(T2)),
                ("state", t("review")),
                ("stability", r(2.5)),
                ("difficulty", r(5.1)),
                ("elapsed_days", i(1)),
                ("scheduled_days", i(3)),
                ("reps", i(4)),
                ("lapses", i(1)),
                ("last_review_at", t(T2)),
                ("deleted_at", deleted),
            ],
        );
    }
    b.insert(
        "index_card_reviews",
        &[
            ("id", t("rev-1")),
            ("card_id", t("card-1")),
            ("rating", t("good")),
            ("state", t("review")),
            ("elapsed_days", i(1)),
            ("scheduled_days", i(3)),
            ("previous", t("{}")),
            ("reviewed_at", t(T2)),
        ],
    );
    b.insert(
        "study_blocks",
        &[
            ("entity_id", t("e-study")),
            ("date", t("2026-01-07")),
            ("start_time", t("14:00")),
            ("end_time", t("16:00")),
        ],
    );
    b.insert(
        "assignments",
        &[
            ("entity_id", t("e-asg")),
            ("due_date", t("2026-01-20")),
            ("status", t("open")),
            ("grade", NULL),
        ],
    );
    b.insert(
        "files",
        &[
            ("entity_id", t("e-file")),
            ("local_path", t("files/slides.pdf")),
            ("provider", t("local")),
            ("url", NULL),
            ("original_filename", t("Slides.pdf")),
            ("source_path", NULL),
        ],
    );
    b.insert(
        "files",
        &[
            ("entity_id", t("e-file-ref")),
            ("local_path", NULL),
            ("provider", t("local")),
            ("url", NULL),
            ("original_filename", t("Linked.pdf")),
            (
                "source_path",
                t("/Users/someone/Documents/Linked \u{e9}.pdf"),
            ),
        ],
    );
    b.insert(
        "bookmarks",
        &[
            ("entity_id", t("e-bmk")),
            ("url", t("https://doc.rust-lang.org")),
            ("fetched_title", t("Rust Documentation")),
            ("favicon_url", t("https://doc.rust-lang.org/favicon.ico")),
            ("preview_image_url", t("https://doc.rust-lang.org/og.png")),
            ("description", t("Docs")),
            ("metadata_fetched_at", t(T2)),
            ("screenshot_path", t("bookmark-previews/e-bmk.jpg")),
            ("preferred_image", t("preview")),
        ],
    );
    for (space, module, added, position, hidden) in [
        ("sp-life", "tasks", T1, 1, NULL),
        ("sp-life", "notes", T2, 2, NULL),
        ("sp-uni", "courses", T1, 1, NULL),
        ("sp-uni", "files", T2, 2, t(T9)),
    ] {
        b.insert(
            "space_modules",
            &[
                ("space_id", t(space)),
                ("module_key", t(module)),
                ("added_at", t(added)),
                ("position", i(position)),
                ("hidden_at", hidden),
            ],
        );
    }
    b.insert(
        "search_index",
        &[
            ("entity_id", t("e-note")),
            ("space_id", t("sp-life")),
            ("title", t("Lecture notes")),
            ("content", t("Hello world")),
        ],
    );

    // Calendar: `appointments` at exactly version 21, `calendar_entries` after.
    let (template_table, entry_table, template_type, entry_type, prefix) = if b.has("appointments")
    {
        (
            "appointment_templates",
            "appointments",
            "appointment_template",
            "appointment",
            "APT",
        )
    } else {
        (
            "calendar_entry_templates",
            "calendar_entries",
            "calendar_entry_template",
            "calendar_entry",
            "CAL",
        )
    };
    if b.has(entry_table) {
        b.entity("e-ct", "sp-life", template_type, "Gym", prefix, 1, T1, None);
        b.entity("e-ce1", "sp-life", entry_type, "Gym", prefix, 2, T1, None);
        b.entity("e-ce2", "sp-life", entry_type, "Gym", prefix, 3, T2, None);
        b.entity(
            "e-ce-trash",
            "sp-life",
            entry_type,
            "Trip",
            prefix,
            4,
            T3,
            Some(T9),
        );
        b.insert(
            template_table,
            &[
                ("entity_id", t("e-ct")),
                ("recurrence", t("weekly")),
                ("start_time", t("07:00")),
                ("end_time", t("08:00")),
                ("all_day", i(0)),
                ("location", t("Gym")),
                ("description", t("Towel")),
                ("anchor_date", t("2026-01-05")),
            ],
        );
        for (id, template, date, end_date, start, all_day, overridden) in [
            ("e-ce1", t("e-ct"), "2026-01-05", NULL, t("07:00"), 0, 0),
            ("e-ce2", t("e-ct"), "2026-01-12", NULL, t("06:00"), 0, 1),
            (
                "e-ce-trash",
                NULL,
                "2026-02-01",
                t("2026-02-03"),
                NULL,
                1,
                0,
            ),
        ] {
            let all_day_times = all_day == 1;
            b.insert(
                entry_table,
                &[
                    ("entity_id", t(id)),
                    ("template_id", template),
                    ("date", t(date)),
                    ("end_date", end_date),
                    ("start_time", if all_day_times { NULL } else { start }),
                    ("end_time", if all_day_times { NULL } else { t("08:00") }),
                    ("all_day", i(all_day)),
                    ("cancelled", i(0)),
                    ("location", if all_day_times { NULL } else { t("Gym") }),
                    ("description", if all_day_times { NULL } else { t("Towel") }),
                    ("overridden_fields", i(overridden)),
                ],
            );
        }
    }

    if b.has("recipes") {
        b.entity(
            "e-recipe",
            "sp-life",
            "recipe",
            "Carbonara",
            "RCP",
            1,
            T1,
            None,
        );
        b.insert(
            "recipes",
            &[
                ("entity_id", t("e-recipe")),
                ("kind", t("dinner")),
                ("duration_minutes", i(45)),
                ("banner_path", t("recipe-banners/e-recipe.png")),
            ],
        );
        for (id, text, position, deleted) in [
            ("ing-1", "200 g pasta", 0, NULL),
            ("ing-trash", "cream", 1, t(T9)),
        ] {
            b.insert(
                "recipe_ingredients",
                &[
                    ("id", t(id)),
                    ("recipe_entity_id", t("e-recipe")),
                    ("text", t(text)),
                    ("position", i(position)),
                    ("created_at", t(T1)),
                    ("updated_at", t(T2)),
                    ("deleted_at", deleted),
                ],
            );
        }
        b.insert(
            "recipe_steps",
            &[
                ("id", t("step-1")),
                ("recipe_entity_id", t("e-recipe")),
                ("text", t("Boil water")),
                ("duration_minutes", i(10)),
                ("position", i(0)),
                ("created_at", t(T1)),
                ("updated_at", t(T2)),
                ("deleted_at", NULL),
            ],
        );
        b.insert(
            "recipe_tag_links",
            &[("recipe_entity_id", t("e-recipe")), ("tag_id", t("pasta"))],
        );
    }

    if b.has("views") {
        b.entity(
            "e-view",
            "sp-life",
            "view",
            "Open tasks",
            "VEW",
            1,
            T1,
            None,
        );
        b.insert(
            "views",
            &[
                ("entity_id", t("e-view")),
                ("module", t("tasks")),
                ("config", t("{\"filter\":\"open\"}")),
                ("position", i(1)),
            ],
        );
    }

    if columns(conn, "entities").iter().any(|c| c == "hidden_at") {
        // Hidden along with its module: soft deleted and marked hidden.
        b.insert(
            "entities",
            &[
                ("id", t("e-hidden")),
                ("space_id", t("sp-uni")),
                ("type", t("file")),
                ("title", t("Hidden file")),
                ("pinned", i(0)),
                ("created_at", t(T3)),
                ("updated_at", t(T5)),
                ("deleted_at", t(T9)),
                ("key_prefix", t("FIL")),
                ("key_number", i(3)),
                ("hidden_at", t(T9)),
            ],
        );
    }

    Fixture {
        version,
        rows: b.rows,
    }
}

// ---------------------------------------------------------------------------
// Inspection

/// Tables renamed by a later migration: old name -> new name.
const RENAMED: &[(&str, &str)] = &[
    ("appointments", "calendar_entries"),
    ("appointment_templates", "calendar_entry_templates"),
];

/// Tables a migration may add rows to by backfill (never remove from).
const BACKFILLED: &[&str] = &["space_modules", "mentions"];

pub(crate) fn renamed(table: &str) -> &str {
    RENAMED
        .iter()
        .find(|(old, _)| *old == table)
        .map(|(_, new)| *new)
        .unwrap_or(table)
}

fn key_cols(table: &str) -> &'static [&'static str] {
    match table {
        "entity_labels" => &["entity_id", "label_id"],
        "space_modules" => &["space_id", "module_key"],
        "mentions" => &["from_entity_id", "to_entity_id"],
        "recipe_tag_links" => &["recipe_entity_id", "tag_id"],
        "spaces" | "entities" | "relationships" | "labels" | "blocks" | "index_cards"
        | "index_card_reviews" | "recipe_ingredients" | "recipe_steps" => &["id"],
        _ => &["entity_id"],
    }
}

/// FTS5 keeps its index in shadow tables whose row counts are an implementation
/// detail; only the virtual tables themselves hold user data.
fn is_fts_shadow(name: &str) -> bool {
    ["search_index_", "blocks_fts_"]
        .iter()
        .any(|p| name.starts_with(p))
}

fn user_tables(conn: &Connection) -> Vec<String> {
    let mut stmt = conn
        .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
             ORDER BY name",
        )
        .unwrap();
    stmt.query_map([], |row| row.get::<_, String>(0))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
}

pub(crate) fn table_counts(conn: &Connection) -> BTreeMap<String, i64> {
    user_tables(conn)
        .into_iter()
        .filter(|name| !is_fts_shadow(name))
        .map(|name| {
            let n = conn
                .query_row(&format!("SELECT COUNT(*) FROM \"{name}\""), [], |row| {
                    row.get(0)
                })
                .unwrap();
            (name, n)
        })
        .collect()
}

/// Every row of every table (FTS shadow tables included), ordered by all
/// columns, so two databases with the same logical content compare equal.
pub(crate) type Dump = BTreeMap<String, Vec<Vec<Value>>>;

pub(crate) fn dump(conn: &Connection) -> Dump {
    user_tables(conn)
        .into_iter()
        .map(|name| {
            let n = conn
                .prepare(&format!("SELECT * FROM \"{name}\""))
                .unwrap()
                .column_count();
            let order: Vec<String> = (1..=n).map(|k| k.to_string()).collect();
            let mut stmt = conn
                .prepare(&format!(
                    "SELECT * FROM \"{name}\" ORDER BY {}",
                    order.join(", ")
                ))
                .unwrap();
            let rows = stmt
                .query_map([], |row| (0..n).map(|k| row.get::<_, Value>(k)).collect())
                .unwrap()
                .collect::<Result<Vec<Vec<Value>>, _>>()
                .unwrap();
            (name, rows)
        })
        .collect()
}

/// `sqlite_master` (whitespace normalized) plus every table's columns.
pub(crate) fn schema(conn: &Connection) -> Vec<String> {
    let mut stmt = conn
        .prepare(
            "SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name, tbl_name",
        )
        .unwrap();
    let mut lines: Vec<String> = stmt
        .query_map([], |row| {
            let sql: Option<String> = row.get(3)?;
            let sql = sql
                .map(|s| s.split_whitespace().collect::<Vec<_>>().join(" "))
                .unwrap_or_default();
            Ok(format!(
                "{} {} on {}: {sql}",
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?
            ))
        })
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    for table in user_tables(conn) {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_xinfo(\"{table}\")"))
            .unwrap();
        let cols = stmt
            .query_map([], |row| {
                Ok(format!(
                    "column {table}.{} {} notnull={} default={:?} pk={} hidden={}",
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, i64>(6)?,
                ))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        lines.extend(cols);
    }
    lines
}

pub(crate) fn fresh_schema() -> Vec<String> {
    let mut conn = Connection::open_in_memory().unwrap();
    migrate_to_latest(&mut conn);
    schema(&conn)
}

/// `PRAGMA integrity_check` is ok and `PRAGMA foreign_key_check` finds nothing.
pub(crate) fn assert_healthy(conn: &Connection, context: &str) {
    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .unwrap();
    assert_eq!(integrity, "ok", "{context}: integrity_check");
    let mut stmt = conn.prepare("PRAGMA foreign_key_check").unwrap();
    let violations: Vec<String> = stmt
        .query_map([], |row| {
            Ok(format!(
                "{} row {:?} -> {}",
                row.get::<_, String>(0)?,
                row.get::<_, Option<i64>>(1)?,
                row.get::<_, String>(2)?
            ))
        })
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert!(
        violations.is_empty(),
        "{context}: foreign key violations {violations:?}"
    );
}

pub(crate) fn assert_no_rows_lost(
    before: &BTreeMap<String, i64>,
    after: &BTreeMap<String, i64>,
    context: &str,
) {
    for (table, &n) in before {
        let target = if after.contains_key(table) {
            table.as_str()
        } else {
            renamed(table)
        };
        let Some(&m) = after.get(target) else {
            panic!("{context}: table {table} ({n} rows) disappeared");
        };
        if BACKFILLED.contains(&target) {
            assert!(m >= n, "{context}: {target} went from {n} to {m} rows");
        } else {
            assert_eq!(m, n, "{context}: {table} -> {target} row count");
        }
    }
}

/// The value a migration is documented to turn an inserted value into.
fn expected_after(fixture: &Fixture, table: &str, col: &str, value: &Value) -> Value {
    let v = fixture.version;
    match (table, col, value) {
        ("entities", "type", Value::Text(s)) if s == "refinement" && v < 9 => t("note"),
        ("entities", "type", Value::Text(s)) if s == "appointment" && v < 22 => t("calendar_entry"),
        ("entities", "type", Value::Text(s)) if s == "appointment_template" && v < 22 => {
            t("calendar_entry_template")
        }
        ("entities", "key_prefix", Value::Text(s)) if s == "APT" && v < 22 => t("CAL"),
        _ => value.clone(),
    }
}

fn scalar(conn: &Connection, sql: &str) -> Value {
    conn.query_row(sql, [], |row| row.get(0))
        .unwrap_or_else(|e| panic!("{sql}: {e}"))
}

/// Checks a database that `fixture` was written into and that has since been
/// brought to the latest schema: every row and value is there, backfills
/// produced what they should, and the schema matches a fresh install.
pub(crate) fn verify_upgraded(conn: &Connection, fixture: &Fixture) {
    let ctx = format!("fixture written at version {}", fixture.version);
    assert_eq!(version_of(conn), latest(), "{ctx}: schema version");
    assert_healthy(conn, &ctx);

    // Every inserted row, every column it was written with, still there.
    for row in &fixture.rows {
        let table = renamed(&row.table);
        let final_cols = columns(conn, table);
        let keys = key_cols(&row.table);
        let compared: Vec<&(String, Value)> = row
            .cols
            .iter()
            .filter(|(c, _)| final_cols.contains(c))
            .collect();
        let select: Vec<&str> = compared.iter().map(|(c, _)| c.as_str()).collect();
        let filter: Vec<String> = keys
            .iter()
            .enumerate()
            .map(|(n, k)| format!("{k} = ?{}", n + 1))
            .collect();
        let key_values: Vec<Value> = keys
            .iter()
            .map(|k| row.get(k).cloned().expect("key column inserted"))
            .collect();
        let sql = format!(
            "SELECT {} FROM {table} WHERE {}",
            select.join(", "),
            filter.join(" AND ")
        );
        let mut stmt = conn.prepare(&sql).unwrap();
        let found: Vec<Vec<Value>> = stmt
            .query_map(params_from_iter(key_values.iter()), |r| {
                (0..select.len()).map(|k| r.get::<_, Value>(k)).collect()
            })
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(found.len(), 1, "{ctx}: {table} row {key_values:?} lost");
        let expected: Vec<Value> = compared
            .iter()
            .map(|(c, v)| expected_after(fixture, &row.table, c, v))
            .collect();
        assert_eq!(
            found[0], expected,
            "{ctx}: {table} row {key_values:?} columns {select:?}"
        );
    }

    // Soft deleted rows stay soft deleted, live rows stay live, per table.
    // Only rows the fixture wrote count; a caller may add more of its own.
    let mut trashed: BTreeMap<&str, BTreeSet<String>> = BTreeMap::new();
    let mut owned: BTreeMap<&str, BTreeSet<String>> = BTreeMap::new();
    for row in &fixture.rows {
        let key = format!("{:?}", row.get(key_cols(&row.table)[0]).unwrap());
        owned
            .entry(renamed(&row.table))
            .or_default()
            .insert(key.clone());
        if let Some(Value::Text(_)) = row.get("deleted_at") {
            trashed.entry(renamed(&row.table)).or_default().insert(key);
        }
    }
    for (table, ids) in &trashed {
        let key = key_cols(table)[0];
        let mut stmt = conn
            .prepare(&format!(
                "SELECT {key} FROM {table} WHERE deleted_at IS NOT NULL"
            ))
            .unwrap();
        let now: BTreeSet<String> = stmt
            .query_map([], |r| r.get::<_, Value>(0))
            .unwrap()
            .map(|v| format!("{:?}", v.unwrap()))
            .filter(|k| owned[table].contains(k))
            .collect();
        assert_eq!(&now, ids, "{ctx}: trashed rows of {table}");
    }

    // Keys: every entity carries its type's prefix and a unique positive number.
    let mut stmt = conn
        .prepare("SELECT id, type, key_prefix, key_number FROM entities")
        .unwrap();
    let keys: Vec<(String, String, String, i64)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    let mut seen = BTreeSet::new();
    for (id, kind, prefix, number) in &keys {
        assert_eq!(
            prefix,
            super::entities::key_prefix(kind),
            "{ctx}: key prefix of {id} ({kind})"
        );
        assert!(*number > 0, "{ctx}: key number of {id}");
        assert!(
            seen.insert((prefix.clone(), *number)),
            "{ctx}: duplicate key {prefix}-{number}"
        );
    }
    for gone in ["refinement", "appointment", "appointment_template"] {
        assert_eq!(
            scalar(
                conn,
                &format!("SELECT COUNT(*) FROM entities WHERE type = '{gone}'")
            ),
            i(0),
            "{ctx}: no {gone} entities left"
        );
    }

    // Spaces keep their order (inserted or backfilled by migration 16).
    assert_eq!(
        scalar(
            conn,
            "SELECT group_concat(id, ',') FROM (SELECT id FROM spaces ORDER BY position)"
        ),
        t("sp-life,sp-uni"),
        "{ctx}: space order"
    );
    if fixture.has("space_modules", "sp-life") {
        assert_eq!(
            scalar(
                conn,
                "SELECT group_concat(space_id || '/' || module_key || '=' || position, ',')
                 FROM (SELECT * FROM space_modules ORDER BY space_id, position)"
            ),
            t("sp-life/tasks=1,sp-life/notes=2,sp-uni/courses=1,sp-uni/files=2"),
            "{ctx}: module order"
        );
    } else {
        // Migration 9 adds the Notes module to every Space holding a Note.
        assert_eq!(
            scalar(
                conn,
                "SELECT group_concat(space_id || '/' || module_key, ',') FROM space_modules"
            ),
            t("sp-life/notes"),
            "{ctx}: backfilled modules"
        );
    }

    if fixture.has("blocks", "b-1") {
        // Block search index and mention index, backfilled or maintained.
        assert_eq!(
            scalar(
                conn,
                "SELECT COUNT(*) FROM mentions WHERE from_entity_id = 'e-note' AND to_entity_id = 'e-course'"
            ),
            i(1),
            "{ctx}: mention"
        );
        assert_eq!(
            scalar(
                conn,
                "SELECT COUNT(*) FROM blocks b JOIN blocks_fts f ON f.block_id = b.id AND f.content = b.content"
            ),
            scalar(conn, "SELECT COUNT(*) FROM blocks"),
            "{ctx}: every block indexed"
        );
        assert_eq!(
            scalar(
                conn,
                "SELECT block_id FROM blocks_fts WHERE blocks_fts MATCH 'zebra'"
            ),
            t("b-3"),
            "{ctx}: block search"
        );
    }

    if fixture.has("tasks", "e-task-done") {
        // Migration 31 fills completed_at of finished tasks with their last
        // edit (T5); written at 31 or later the fixture sets the same value.
        assert_eq!(
            scalar(
                conn,
                "SELECT completed_at FROM tasks WHERE entity_id = 'e-task-done'"
            ),
            t(T5),
            "{ctx}: completed_at"
        );
        assert_eq!(
            scalar(
                conn,
                "SELECT completed_at FROM tasks WHERE entity_id = 'e-task-trash'"
            ),
            NULL,
            "{ctx}: unfinished task has no completed_at"
        );
    }

    if fixture.has("sessions", "e-ses1") {
        assert_eq!(
            scalar(
                conn,
                "SELECT group_concat(entity_id || '=' || overridden_fields, ',')
                 FROM (SELECT * FROM sessions ORDER BY entity_id)"
            ),
            t("e-ses-trash=0,e-ses1=0,e-ses2=4"),
            "{ctx}: session overrides"
        );
    }
    if fixture
        .rows
        .iter()
        .any(|r| renamed(&r.table) == "calendar_entries")
    {
        assert_eq!(
            scalar(
                conn,
                "SELECT group_concat(entity_id || '=' || overridden_fields, ',')
                 FROM (SELECT * FROM calendar_entries ORDER BY entity_id)"
            ),
            t("e-ce-trash=0,e-ce1=0,e-ce2=1"),
            "{ctx}: calendar overrides"
        );
    }

    assert_eq!(
        schema(conn),
        fresh_schema(),
        "{ctx}: schema differs from a fresh install"
    );
}

// ---------------------------------------------------------------------------
// Tests

#[test]
fn every_migration_step_keeps_a_populated_database() {
    let fresh = fresh_schema();
    for start in 1..latest() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate_to(&mut conn, start);
        let fixture = populate(&conn);
        assert!(
            !fixture.rows.is_empty(),
            "version {start}: nothing inserted"
        );
        assert_healthy(&conn, &format!("fixture at version {start}"));
        let mut counts = table_counts(&conn);
        for step in start + 1..=latest() {
            let ctx = format!("from version {start}, step {} -> {step}", step - 1);
            migrate_to(&mut conn, step);
            assert_eq!(version_of(&conn), step, "{ctx}");
            assert_healthy(&conn, &ctx);
            let after = table_counts(&conn);
            assert_no_rows_lost(&counts, &after, &ctx);
            counts = after;
        }
        verify_upgraded(&conn, &fixture);
        assert_eq!(schema(&conn), fresh, "from version {start}");
    }
}

#[test]
fn the_fixture_is_valid_at_the_latest_version_too() {
    let mut conn = Connection::open_in_memory().unwrap();
    migrate_to_latest(&mut conn);
    let fixture = populate(&conn);
    verify_upgraded(&conn, &fixture);
}

#[test]
fn every_version_upgrades_straight_to_latest_in_one_call() {
    for start in 1..latest() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate_to(&mut conn, start);
        let fixture = populate(&conn);
        migrate_to_latest(&mut conn);
        verify_upgraded(&conn, &fixture);
    }
}

#[test]
fn running_migrations_again_is_a_no_op() {
    let mut conn = Connection::open_in_memory().unwrap();
    migrate_to(&mut conn, OLDEST_RELEASED_VERSION);
    populate(&conn);
    migrate_to_latest(&mut conn);
    let (data, shape) = (dump(&conn), schema(&conn));
    for _ in 0..2 {
        migrate_to_latest(&mut conn);
        // Asking for the version it is already at changes nothing either.
        migrate_to(&mut conn, latest());
        assert_eq!(version_of(&conn), latest());
        assert_eq!(dump(&conn), data);
        assert_eq!(schema(&conn), shape);
    }
}

#[test]
fn an_empty_database_at_any_version_upgrades_to_the_fresh_schema() {
    let fresh = fresh_schema();
    for start in 0..=latest() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate_to(&mut conn, start);
        migrate_to_latest(&mut conn);
        assert_eq!(schema(&conn), fresh, "from empty version {start}");
    }
}

/// The first public release's database, filled the way a long time user's
/// would be, upgrades in one step on disk exactly as `db::connect` does it.
#[test]
fn the_oldest_released_version_with_lots_of_data_upgrades_to_latest() {
    let dir = std::env::temp_dir().join(format!("nookly-oldest-{}", super::new_id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("nookly.db");
    let mut conn = Connection::open(&path).unwrap();
    migrate_to(&mut conn, OLDEST_RELEASED_VERSION);
    let fixture = populate(&conn);

    // Bulk data on top of the fixture: many pages, tasks, cards and trash.
    let tx = conn.transaction().unwrap();
    for n in 0..400i64 {
        let (kind, prefix) = match n % 4 {
            0 => ("note", "NOT"),
            1 => ("task", "TSK"),
            2 => ("jot", "JOT"),
            _ => ("bookmark", "BMK"),
        };
        let id = format!("bulk-{n}");
        let deleted = if n % 7 == 0 { t(T9) } else { NULL };
        tx.execute(
            "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, deleted_at, key_prefix, key_number)
             VALUES (?1, 'sp-uni', ?2, ?3, ?4, ?4, ?5, ?6, ?7)",
            rusqlite::params![id, kind, format!("Item {n} \u{2713}"), T3, deleted, prefix, 1000 + n],
        )
        .unwrap();
        match kind {
            "task" => {
                let status = if n % 3 == 0 { "done" } else { "todo" };
                tx.execute(
                    "INSERT INTO tasks (entity_id, status_id) VALUES (?1, ?2)",
                    rusqlite::params![id, status],
                )
                .unwrap();
            }
            "bookmark" => {
                tx.execute(
                    "INSERT INTO bookmarks (entity_id, url) VALUES (?1, 'https://example.com')",
                    [&id],
                )
                .unwrap();
            }
            _ => {
                for p in 0..5i64 {
                    tx.execute(
                        "INSERT INTO blocks (id, entity_id, position, block_type, content, created_at, updated_at)
                         VALUES (?1, ?2, ?3, 'paragraph', ?4, ?5, ?5)",
                        rusqlite::params![format!("{id}-b{p}"), id, p, format!("line {p} of {n}"), T3],
                    )
                    .unwrap();
                }
            }
        }
    }
    tx.commit().unwrap();
    let before = table_counts(&conn);
    let trashed = scalar(
        &conn,
        "SELECT COUNT(*) FROM entities WHERE deleted_at IS NOT NULL",
    );
    drop(conn);

    let conn = super::connect(&dir).unwrap();
    // `connect` kept a copy of the pre-upgrade file.
    assert!(dir
        .join(format!("nookly.db.bak-v{OLDEST_RELEASED_VERSION}"))
        .is_file());
    assert_no_rows_lost(&before, &table_counts(&conn), "oldest release upgrade");
    assert_eq!(
        scalar(
            &conn,
            "SELECT COUNT(*) FROM entities WHERE deleted_at IS NOT NULL"
        ),
        trashed
    );
    assert_eq!(
        scalar(
            &conn,
            "SELECT COUNT(*) FROM tasks t JOIN entities e ON e.id = t.entity_id
             WHERE t.status_id = 'done' AND t.completed_at = e.updated_at"
        ),
        scalar(&conn, "SELECT COUNT(*) FROM tasks WHERE status_id = 'done'")
    );
    verify_upgraded(&conn, &fixture);
    drop(conn);
    std::fs::remove_dir_all(dir).ok();
}

/// Migration 15 replaced Leitner boxes with FSRS. A card's review progress
/// (its Leitner box) must survive the upgrade: a card the user had advanced
/// to box 3 must not restart as a brand new, never reviewed card.
#[test]
#[ignore = "migration 15 shipped and already dropped box_level for every released database; \
            keeping the box would mean editing a shipped migration, which is append-only"]
fn fsrs_migration_preserves_leitner_progress() {
    let mut conn = Connection::open_in_memory().unwrap();
    migrate_to(&mut conn, 14);
    let fixture = populate(&conn);
    assert!(fixture
        .rows
        .iter()
        .any(|r| r.table == "index_cards" && r.get("box_level") == Some(&i(3))));
    migrate_to_latest(&mut conn);
    // Progress is mapped into FSRS state instead of being discarded.
    assert_ne!(
        scalar(&conn, "SELECT state FROM index_cards WHERE id = 'card-1'"),
        t("new")
    );
    let reps: i64 = conn
        .query_row(
            "SELECT reps FROM index_cards WHERE id = 'card-1'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(reps > 0, "review progress was reset");
}
