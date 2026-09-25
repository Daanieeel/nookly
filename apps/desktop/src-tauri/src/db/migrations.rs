use rusqlite_migration::{Migrations, M};
use std::sync::LazyLock;

fn all() -> Vec<M<'static>> {
    vec![M::up(
        "
        CREATE TABLE spaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            icon TEXT,
            color TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE entities (
            id TEXT PRIMARY KEY,
            space_id TEXT NOT NULL REFERENCES spaces(id),
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            icon TEXT,
            pinned INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        );
        CREATE INDEX idx_entities_space ON entities(space_id);
        CREATE INDEX idx_entities_type ON entities(type);

        CREATE TABLE relationships (
            id TEXT PRIMARY KEY,
            from_entity_id TEXT NOT NULL REFERENCES entities(id),
            to_entity_id TEXT NOT NULL REFERENCES entities(id),
            relationship_type TEXT NOT NULL,
            from_block_id TEXT,
            to_block_id TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX idx_rel_from ON relationships(from_entity_id, relationship_type);
        CREATE INDEX idx_rel_to ON relationships(to_entity_id, relationship_type);
        ",
    ), M::up(
        "
        -- Labels (§4.3): generic, space-siloed freeform tags.
        CREATE TABLE labels (
            id TEXT PRIMARY KEY,
            space_id TEXT NOT NULL REFERENCES spaces(id),
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE entity_labels (
            entity_id TEXT NOT NULL REFERENCES entities(id),
            label_id TEXT NOT NULL REFERENCES labels(id),
            PRIMARY KEY (entity_id, label_id)
        );

        -- Tasks (§5.1)
        CREATE TABLE task_statuses (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            doneness INTEGER NOT NULL,
            position INTEGER NOT NULL
        );
        INSERT INTO task_statuses (id, name, color, doneness, position) VALUES
            ('backlog', 'Backlog', '#94a3b8', 0, 0),
            ('todo', 'Todo', '#64748b', 0, 1),
            ('in_progress', 'In Progress', '#3b82f6', 50, 2),
            ('done', 'Done', '#22c55e', 100, 3),
            ('cancelled', 'Cancelled', '#ef4444', 100, 4);

        CREATE TABLE tasks (
            entity_id TEXT PRIMARY KEY REFERENCES entities(id),
            status_id TEXT NOT NULL REFERENCES task_statuses(id),
            start_date TEXT,
            due_date TEXT
        );

        -- Notes / Pages (§5.2), block-level addressable (§3.4)
        CREATE TABLE blocks (
            id TEXT PRIMARY KEY,
            entity_id TEXT NOT NULL REFERENCES entities(id),
            position INTEGER NOT NULL,
            block_type TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_blocks_entity ON blocks(entity_id, position);

        -- Courses / Semesters (§5.4/5.5)
        CREATE TABLE courses (
            entity_id TEXT PRIMARY KEY REFERENCES entities(id)
        );
        CREATE TABLE semesters (
            entity_id TEXT PRIMARY KEY REFERENCES entities(id)
        );

        -- Sessions / Timetable (§5.6)
        CREATE TABLE session_templates (
            entity_id TEXT PRIMARY KEY REFERENCES entities(id),
            weekday INTEGER NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            location TEXT,
            anchor_date TEXT NOT NULL
        );
        CREATE TABLE sessions (
            entity_id TEXT PRIMARY KEY REFERENCES entities(id),
            template_id TEXT REFERENCES entities(id),
            date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            cancelled INTEGER NOT NULL DEFAULT 0,
            location TEXT,
            notes TEXT
        );
        CREATE INDEX idx_sessions_template ON sessions(template_id);

        -- Exam Tracking (§5.7)
        CREATE TABLE exams (
            entity_id TEXT PRIMARY KEY REFERENCES entities(id),
            exam_date TEXT,
            weight REAL,
            grade REAL,
            status TEXT NOT NULL
        );
        CREATE TABLE index_card_decks (
            entity_id TEXT PRIMARY KEY REFERENCES entities(id)
        );
        CREATE TABLE index_cards (
            id TEXT PRIMARY KEY,
            deck_entity_id TEXT NOT NULL REFERENCES entities(id),
            front TEXT NOT NULL,
            back TEXT NOT NULL,
            box_level INTEGER NOT NULL DEFAULT 1,
            due_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_index_cards_deck ON index_cards(deck_entity_id);
        CREATE TABLE study_blocks (
            entity_id TEXT PRIMARY KEY REFERENCES entities(id),
            date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL
        );

        -- Assignments (§5.8)
        CREATE TABLE assignments (
            entity_id TEXT PRIMARY KEY REFERENCES entities(id),
            due_date TEXT,
            status TEXT NOT NULL,
            grade REAL
        );

        -- Files (§5.9)
        CREATE TABLE files (
            entity_id TEXT PRIMARY KEY REFERENCES entities(id),
            local_path TEXT,
            provider TEXT,
            url TEXT,
            original_filename TEXT
        );

        -- URL / Bookmarks (§5.10)
        CREATE TABLE bookmarks (
            entity_id TEXT PRIMARY KEY REFERENCES entities(id),
            url TEXT NOT NULL,
            fetched_title TEXT,
            favicon_url TEXT,
            preview_image_url TEXT,
            description TEXT,
            metadata_fetched_at TEXT
        );

        -- Full-text search (§6)
        CREATE VIRTUAL TABLE search_index USING fts5(entity_id UNINDEXED, space_id UNINDEXED, title, content);
        ",
    ), M::up(
        "
        -- Sidebar module visibility (§4.1): whether a module counts as 'added'
        -- to a Space is intentional/sticky, not derived live from entity counts.
        -- A row here means the module was explicitly added (the sidebar's '+')
        -- or had its first entity created — either way it's permanent from then
        -- on, even if every entity of that module later gets deleted.
        CREATE TABLE space_modules (
            space_id TEXT NOT NULL REFERENCES spaces(id),
            module_key TEXT NOT NULL,
            added_at TEXT NOT NULL,
            PRIMARY KEY (space_id, module_key)
        );
        ",
    ), M::up(
        "
        -- Semester date ranges (§5.5) — lets the UI resolve which Semester is
        -- 'current' instead of guessing from creation order alone.
        ALTER TABLE semesters ADD COLUMN start_date TEXT;
        ALTER TABLE semesters ADD COLUMN end_date TEXT;
        ",
    ), M::up(
        "
        -- Semesters list page + setup wizard: `term_type`/`year` are the
        -- authoritative ordering/'current'-detection fields (start_date/
        -- end_date stay cosmetic-only, see PLAN §1). `is_current` and
        -- `manual_position` back the list page's manual overrides — the
        -- heuristic only ever sets initial defaults, never locks anything.
        ALTER TABLE semesters ADD COLUMN term_type TEXT;
        ALTER TABLE semesters ADD COLUMN year INTEGER;
        ALTER TABLE semesters ADD COLUMN is_current INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE semesters ADD COLUMN manual_position INTEGER;
        ",
    ), M::up(
        "
        -- Code block header (filename + language for syntax highlighting) —
        -- both optional, NULL for every other block type.
        ALTER TABLE blocks ADD COLUMN language TEXT;
        ALTER TABLE blocks ADD COLUMN filename TEXT;
        ",
    ), M::up(
        "
        -- Block-level full-text search (Cmd+K): one row per Note/Jot
        -- block, kept in sync by triggers so every block write path (editor,
        -- CLI, Space deletion) stays indexed without touching each call site.
        CREATE VIRTUAL TABLE blocks_fts USING fts5(block_id UNINDEXED, content);
        INSERT INTO blocks_fts (block_id, content) SELECT id, content FROM blocks;
        CREATE TRIGGER blocks_fts_insert AFTER INSERT ON blocks BEGIN
            INSERT INTO blocks_fts (block_id, content) VALUES (new.id, new.content);
        END;
        CREATE TRIGGER blocks_fts_update AFTER UPDATE OF content ON blocks BEGIN
            UPDATE blocks_fts SET content = new.content WHERE block_id = old.id;
        END;
        CREATE TRIGGER blocks_fts_delete AFTER DELETE ON blocks BEGIN
            DELETE FROM blocks_fts WHERE block_id = old.id;
        END;
        ",
    ), M::up(
        "
        -- Backlink index for the right sidebar's 'Mentioned in' (§1.5): one row
        -- per (mentioning page, mentioned entity). Mentions live in block markdown
        -- and stay outside the relationship graph, so this is rebuilt per page by
        -- `notes::reindex_page` on every block write rather than by triggers.
        CREATE TABLE mentions (
            from_entity_id TEXT NOT NULL,
            to_entity_id TEXT NOT NULL,
            PRIMARY KEY (from_entity_id, to_entity_id)
        );
        CREATE INDEX idx_mentions_to ON mentions(to_entity_id);
        INSERT OR IGNORE INTO mentions (from_entity_id, to_entity_id)
            SELECT DISTINCT b.entity_id, e.id FROM blocks b
            JOIN entities e ON b.content LIKE '%](mention:' || e.id || ')%'
            WHERE e.id != b.entity_id;
        ",
    ), M::up(
        "
        -- The Refinement type is gone: a Jot is refined into a regular Note now.
        UPDATE entities SET type = 'note' WHERE type = 'refinement';
        INSERT OR IGNORE INTO space_modules (space_id, module_key, added_at)
            SELECT DISTINCT space_id, 'notes', strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')
            FROM entities WHERE type = 'note';
        ",
    ), M::up(
        "
        -- Jira style entity keys (TSK-14). The CASE mirrors `entities::key_prefix`;
        -- existing rows are numbered per prefix in creation order.
        ALTER TABLE entities ADD COLUMN key_prefix TEXT NOT NULL DEFAULT 'ENT';
        ALTER TABLE entities ADD COLUMN key_number INTEGER NOT NULL DEFAULT 0;
        UPDATE entities SET key_prefix = CASE type
            WHEN 'task' THEN 'TSK' WHEN 'sub_task' THEN 'TSK'
            WHEN 'note' THEN 'NOT'
            WHEN 'jot' THEN 'JOT'
            WHEN 'course' THEN 'CRS'
            WHEN 'course_notes' THEN 'CNT'
            WHEN 'semester' THEN 'SEM'
            WHEN 'session' THEN 'SES' WHEN 'session_template' THEN 'SES'
            WHEN 'exam' THEN 'EXM'
            WHEN 'index_card_deck' THEN 'DCK'
            WHEN 'study_block' THEN 'STB'
            WHEN 'assignment' THEN 'ASG'
            WHEN 'file' THEN 'FIL'
            WHEN 'bookmark' THEN 'BMK'
            ELSE 'ENT' END;
        UPDATE entities SET key_number = (
            SELECT n FROM (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY key_prefix ORDER BY created_at, id) AS n
                FROM entities
            ) numbered WHERE numbered.id = entities.id
        );
        CREATE UNIQUE INDEX idx_entities_key ON entities(key_prefix, key_number);
        ",
    ), M::up(
        "
        -- Settings of custom blocks (`block_types`), a JSON object of strings.
        ALTER TABLE blocks ADD COLUMN attrs TEXT;
        ",
    ), M::up(
        "
        -- Where an exam takes place, free text like \"H 0104\".
        ALTER TABLE exams ADD COLUMN room TEXT;
        ",
    ), M::up(
        "
        -- A local snapshot of the bookmarked page, the card's main preview.
        ALTER TABLE bookmarks ADD COLUMN screenshot_path TEXT;
        ",
    ), M::up(
        "
        -- A file referenced where it lives on disk instead of copied into storage.
        ALTER TABLE files ADD COLUMN source_path TEXT;
        ",
    ), M::up(
        "
        -- Index cards schedule with FSRS instead of Leitner boxes, and soft delete.
        ALTER TABLE index_cards DROP COLUMN box_level;
        ALTER TABLE index_cards ADD COLUMN state TEXT NOT NULL DEFAULT 'new';
        ALTER TABLE index_cards ADD COLUMN stability REAL NOT NULL DEFAULT 0;
        ALTER TABLE index_cards ADD COLUMN difficulty REAL NOT NULL DEFAULT 0;
        ALTER TABLE index_cards ADD COLUMN elapsed_days INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE index_cards ADD COLUMN scheduled_days INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE index_cards ADD COLUMN reps INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE index_cards ADD COLUMN lapses INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE index_cards ADD COLUMN last_review_at TEXT;
        ALTER TABLE index_cards ADD COLUMN deleted_at TEXT;
        -- One row per review. `previous` is the card's scheduling state before it,
        -- so the latest review can be undone.
        CREATE TABLE index_card_reviews (
            id TEXT PRIMARY KEY,
            card_id TEXT NOT NULL REFERENCES index_cards(id),
            rating TEXT NOT NULL,
            state TEXT NOT NULL,
            elapsed_days INTEGER NOT NULL,
            scheduled_days INTEGER NOT NULL,
            previous TEXT NOT NULL,
            reviewed_at TEXT NOT NULL
        );
        CREATE INDEX idx_index_card_reviews_card ON index_card_reviews(card_id, reviewed_at);
        ",
    ), M::up(
        "
        -- Manual drag-to-reorder for the sidebar's Space list and each Space's
        -- module rows. Backfilled from the existing implicit order (creation
        -- order for Spaces, add order for modules) so nothing visibly reshuffles
        -- on upgrade.
        ALTER TABLE spaces ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
        UPDATE spaces SET position = (
            SELECT n FROM (
                SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n FROM spaces
            ) numbered WHERE numbered.id = spaces.id
        );
        ALTER TABLE space_modules ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
        UPDATE space_modules SET position = (
            SELECT n FROM (
                SELECT space_id, module_key,
                    ROW_NUMBER() OVER (PARTITION BY space_id ORDER BY added_at, module_key) AS n
                FROM space_modules
            ) numbered
            WHERE numbered.space_id = space_modules.space_id
              AND numbered.module_key = space_modules.module_key
        );
        ",
    ), M::up(
        "
        -- When an entity was last opened, in preparation for a future smart
        -- 'reclaim space' feature. Null for every existing row and for anything
        -- never opened since — there is no historical open data to backfill.
        ALTER TABLE entities ADD COLUMN last_opened_at TEXT;
        ",
    ), M::up(
        "
        -- User override of which fetched image wins for a Bookmark's cover
        -- (§ compare previews): 'screenshot' or 'preview', null keeps the
        -- default (screenshot when present, else the site's og:image).
        ALTER TABLE bookmarks ADD COLUMN preferred_image TEXT;
        ",
    ), M::up(
        "
        -- An earlier attempt at an editable File 'Added' date, as a column
        -- separate from created_at. Some installs already ran this migration
        -- before the design changed (below) to edit created_at directly
        -- instead — this slot is kept so their database version still lines
        -- up with this list; a fresh install adds the column here and drops
        -- it again next migration.
        ALTER TABLE files ADD COLUMN added_at TEXT;
        UPDATE files SET added_at = (
            SELECT substr(created_at, 1, 10) FROM entities WHERE entities.id = files.entity_id
        );
        ",
    ), M::up(
        "
        -- Superseding the above: a File's 'Added' date now edits
        -- entity.created_at directly (§ files::set_added_at), so every date
        -- shown for a file — detail view, lists, sort and group order — stays
        -- in agreement. No separate column needed.
        ALTER TABLE files DROP COLUMN added_at;
        ",
    )]
}

pub static MIGRATIONS: LazyLock<Migrations<'static>> = LazyLock::new(|| Migrations::new(all()));

/// Total number of migrations, so a caller can tell — before `to_latest` runs —
/// whether it's about to change the schema (`current_version < MIGRATION_COUNT`).
/// Used to snapshot the database right before an upgrade touches it.
pub static MIGRATION_COUNT: LazyLock<usize> = LazyLock::new(|| all().len());

#[cfg(test)]
mod history {
    use super::all;
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    /// SQLite's `user_version` only counts how many migrations ran; it can't tell
    /// a migration was rewritten out from under it. Editing or deleting an entry
    /// here — even one that never shipped in a tagged release — breaks any
    /// database (a teammate's dev build, a half-tested local run) that already
    /// applied it: the app then refuses to start with `DatabaseTooFarAhead`
    /// (`db::mod::setup`), or worse, silently runs the wrong SQL for that slot.
    /// This pins every migration that currently exists, in order; a change here
    /// only ever appends. To add one for real, run `regenerate_expected_hashes`
    /// below (`cargo test -- --ignored --nocapture`) and paste its output in.
    const EXPECTED_HASHES: &[u64] = &[
        0x513cf18a8816911c,
        0x7722d363802a0b4f,
        0xbf01c76a1797863f,
        0xc7bc1233034e630a,
        0xe7516251515c281f,
        0x7a032143ba455776,
        0xa222628e5e9b8e51,
        0xcd3d9b00c9553ca,
        0x66771ad9230782d8,
        0x590b483e31ddf7ba,
        0x7f310f139c306753,
        0xbbed0efa50525c67,
        0x536cc1e3a329cdbf,
        0x288986d5f4c178d5,
        0x2851e4fb9be36e6f,
        0x8977f07bfd50ff25,
        0xa231a4c98e30c0b4,
        0x310de7fa98b47141,
        0x33accb3a50c78805,
        0x21582437e68c7d02,
    ];

    fn fingerprint(m: &super::M) -> u64 {
        let mut hasher = DefaultHasher::new();
        // `M` derives `Debug`, which — since none of our migrations use hooks —
        // prints exactly the `up`/`down` SQL and comment: a full, stable fingerprint
        // without needing a public accessor the crate doesn't expose.
        format!("{m:?}").hash(&mut hasher);
        hasher.finish()
    }

    #[test]
    fn migrations_are_append_only() {
        let current: Vec<u64> = all().iter().map(fingerprint).collect();
        assert!(
            current.len() >= EXPECTED_HASHES.len(),
            "a migration was removed: {} exist now, {} are pinned. Migrations may only be \
             appended to, never deleted — see this module's docs.",
            current.len(),
            EXPECTED_HASHES.len(),
        );
        assert_eq!(
            &current[..EXPECTED_HASHES.len()],
            EXPECTED_HASHES,
            "an existing migration changed shape. Once a migration exists — even only in a \
             local dev build, not yet released — it must never be edited, only superseded by \
             a new migration appended after it. See this module's docs.",
        );
    }

    /// Not a real test: prints the current hashes so `EXPECTED_HASHES` can be
    /// regenerated after a deliberate, purely-additive migration change.
    #[test]
    #[ignore]
    fn regenerate_expected_hashes() {
        for h in all().iter().map(fingerprint) {
            println!("0x{h:x},");
        }
    }
}
