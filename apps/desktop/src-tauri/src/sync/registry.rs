//! Which tables sync and how. The source of `packages/shared/src/generated/desktop-schema.json`.

use crate::error::AppResult;
use rusqlite::Connection;
use serde::Serialize;

/// How a row of a synced table belongs to an entity, which is what sharing hands
/// out: a shared page carries every row scoped to it.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Scope {
    /// Belongs to no single entity (a Space, a label, a task status).
    None,
    /// This column holds the id of the entity the row belongs to.
    Column { column: &'static str },
    /// This column points at a row of `table`, whose `scope_column` holds the entity.
    Via {
        column: &'static str,
        table: &'static str,
        #[serde(rename = "scopeColumn")]
        scope_column: &'static str,
    },
}

impl Scope {
    pub fn column(&self) -> Option<&'static str> {
        match self {
            Scope::None => None,
            Scope::Column { column } | Scope::Via { column, .. } => Some(column),
        }
    }
}

/// How two concurrent edits of one row combine.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Merge {
    /// Each field keeps its newest value.
    Field,
    /// The newest edit takes the whole row, for rows whose fields only make sense
    /// together (a card's review schedule).
    Record,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncedTable {
    pub name: &'static str,
    pub pk: &'static [&'static str],
    pub scope: Scope,
    pub merge: Merge,
    /// Columns that only mean something on this device, like a path into its data
    /// folder. They never leave it and a remote change never touches them.
    pub local_columns: &'static [&'static str],
}

const fn table(name: &'static str, pk: &'static [&'static str], scope: Scope) -> SyncedTable {
    SyncedTable {
        name,
        pk,
        scope,
        merge: Merge::Field,
        local_columns: &[],
    }
}

const ENTITY_ID: Scope = Scope::Column {
    column: "entity_id",
};
const ID: &[&str] = &["id"];
const ENTITY_PK: &[&str] = &["entity_id"];

/// Every table whose rows sync. Each needs the three `sync_<table>_<op>` triggers,
/// added by a migration (the tests check both).
pub const SYNCED_TABLES: &[SyncedTable] = &[
    table("spaces", ID, Scope::None),
    table("space_modules", &["space_id", "module_key"], Scope::None),
    table("labels", ID, Scope::None),
    table("task_statuses", ID, Scope::None),
    table("recipe_tags", ID, Scope::None),
    table("entities", ID, Scope::Column { column: "id" }),
    table(
        "relationships",
        ID,
        Scope::Column {
            column: "from_entity_id",
        },
    ),
    table("entity_labels", &["entity_id", "label_id"], ENTITY_ID),
    table("tasks", ENTITY_PK, ENTITY_ID),
    table("blocks", ID, ENTITY_ID),
    table("note_settings", ENTITY_PK, ENTITY_ID),
    table("courses", ENTITY_PK, ENTITY_ID),
    table("semesters", ENTITY_PK, ENTITY_ID),
    table("session_templates", ENTITY_PK, ENTITY_ID),
    table("sessions", ENTITY_PK, ENTITY_ID),
    table(
        "series_slots",
        &["template_id", "slot_date"],
        Scope::Column {
            column: "template_id",
        },
    ),
    table("calendar_entry_templates", ENTITY_PK, ENTITY_ID),
    table("calendar_entries", ENTITY_PK, ENTITY_ID),
    table("exams", ENTITY_PK, ENTITY_ID),
    table("study_blocks", ENTITY_PK, ENTITY_ID),
    table("assignments", ENTITY_PK, ENTITY_ID),
    table("index_card_decks", ENTITY_PK, ENTITY_ID),
    SyncedTable {
        merge: Merge::Record,
        ..table(
            "index_cards",
            ID,
            Scope::Column {
                column: "deck_entity_id",
            },
        )
    },
    table(
        "index_card_reviews",
        ID,
        Scope::Via {
            column: "card_id",
            table: "index_cards",
            scope_column: "deck_entity_id",
        },
    ),
    SyncedTable {
        local_columns: &["local_path", "source_path"],
        ..table("files", ENTITY_PK, ENTITY_ID)
    },
    SyncedTable {
        local_columns: &["screenshot_path"],
        ..table("bookmarks", ENTITY_PK, ENTITY_ID)
    },
    SyncedTable {
        local_columns: &["banner_path"],
        ..table("recipes", ENTITY_PK, ENTITY_ID)
    },
    table(
        "recipe_ingredients",
        ID,
        Scope::Column {
            column: "recipe_entity_id",
        },
    ),
    table(
        "recipe_steps",
        ID,
        Scope::Column {
            column: "recipe_entity_id",
        },
    ),
    table(
        "recipe_tag_links",
        &["recipe_entity_id", "tag_id"],
        Scope::Column {
            column: "recipe_entity_id",
        },
    ),
    table("views", ENTITY_PK, ENTITY_ID),
];

/// Tables that never sync, and why. A name also covers the tables SQLite makes for
/// it (`blocks_fts_data` for `blocks_fts`).
pub const EXCLUDED_TABLES: &[&str] = &[
    // Search indexes, rebuilt from the synced rows on each device.
    "search_index",
    "blocks_fts",
    // The backlink index, rebuilt from page content.
    "mentions",
    // Sync's own bookkeeping, per device.
    "sync_meta",
    "sync_dirty",
    "sync_rows",
    "sync_conflicts",
];

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Column {
    pub name: String,
    #[serde(rename = "type")]
    pub sql_type: String,
    pub not_null: bool,
    pub default: Option<String>,
}

/// A table's columns, in order, as SQLite reports them.
pub fn columns(conn: &Connection, table: &str) -> AppResult<Vec<Column>> {
    let mut stmt =
        conn.prepare("SELECT name, type, \"notnull\", dflt_value FROM pragma_table_info(?1)")?;
    let rows = stmt.query_map([table], |row| {
        Ok(Column {
            name: row.get(0)?,
            sql_type: row.get(1)?,
            not_null: row.get::<_, i64>(2)? != 0,
            default: row.get(3)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// SQL for the milliseconds since 1970 of a timestamp `expr`, in the format the app
/// writes (`db::now`).
pub fn millis_of(expr: &str) -> String {
    format!("CAST(ROUND((julianday({expr}) - 2440587.5) * 86400000.0) AS INTEGER)")
}
