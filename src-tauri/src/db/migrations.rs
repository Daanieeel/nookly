use rusqlite_migration::{Migrations, M};
use std::sync::LazyLock;

pub static MIGRATIONS: LazyLock<Migrations<'static>> = LazyLock::new(|| {
    Migrations::new(vec![M::up(
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
    )])
});
