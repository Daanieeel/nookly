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
    ), M::up(
        "
        -- Appointments (calendar-module plan): first-class, per-Space personal
        -- calendar entries, structurally separate from Sessions (no required
        -- Course, no external sync). Same template/occurrence shape as
        -- Sessions, but recurrence carries its own cadence rather than being
        -- fixed weekly, and start/end time are nullable for an all-day entry.
        CREATE TABLE appointment_templates (
            entity_id TEXT PRIMARY KEY REFERENCES entities(id),
            recurrence TEXT NOT NULL,
            start_time TEXT,
            end_time TEXT,
            all_day INTEGER NOT NULL DEFAULT 0,
            location TEXT,
            description TEXT,
            anchor_date TEXT NOT NULL
        );
        CREATE TABLE appointments (
            entity_id TEXT PRIMARY KEY REFERENCES entities(id),
            template_id TEXT REFERENCES entities(id),
            date TEXT NOT NULL,
            start_time TEXT,
            end_time TEXT,
            all_day INTEGER NOT NULL DEFAULT 0,
            cancelled INTEGER NOT NULL DEFAULT 0,
            location TEXT,
            description TEXT
        );
        CREATE INDEX idx_appointments_template ON appointments(template_id);
        ",
    ), M::up(
        "
        -- Renamed the 'Appointments' module to 'Calendar' before its first
        -- release (module name only; a Session stays a Session). The previous
        -- migration already shipped in dev builds, so this fixes forward
        -- instead of editing it: rename the tables, then re-point every
        -- existing row's entity type and key prefix. No real installs have
        -- any of these rows yet, but the backfill is written as if they did.
        ALTER TABLE appointment_templates RENAME TO calendar_entry_templates;
        ALTER TABLE appointments RENAME TO calendar_entries;
        DROP INDEX IF EXISTS idx_appointments_template;
        CREATE INDEX idx_calendar_entries_template ON calendar_entries(template_id);

        UPDATE entities SET type = 'calendar_entry_template', key_prefix = 'CAL'
            WHERE type = 'appointment_template';
        UPDATE entities SET type = 'calendar_entry', key_prefix = 'CAL'
            WHERE type = 'appointment';
        ",
    ), M::up(
        "
        -- Multi-day Calendar entries (calendar-improvements plan): a personal
        -- calendar entry can now span from `date` through `end_date`
        -- inclusive, so dragging across day columns (Monday noon to
        -- Wednesday 3pm, say) creates one entry rather than being forced onto
        -- a single day. NULL means the entry is still exactly one day, `date`
        -- alone — true of every existing row, and of every Session (a
        -- lecture occurrence never spans days).
        ALTER TABLE calendar_entries ADD COLUMN end_date TEXT;
        ",
    ), M::up(
        "
        -- Recipes module (native entity): a banner image, a meal kind, and a
        -- duration that is either a manual override or (when unset) the sum
        -- of its steps' own durationMinutes. Ingredients and steps are child
        -- collections owned by the recipe, not entities of their own (same
        -- pattern as a Deck's index cards) — soft deleted, ordered by
        -- `position`, no key/Space/relationships.
        CREATE TABLE recipes (
            entity_id TEXT PRIMARY KEY REFERENCES entities(id),
            kind TEXT NOT NULL DEFAULT 'other',
            duration_minutes INTEGER,
            banner_path TEXT
        );
        CREATE TABLE recipe_ingredients (
            id TEXT PRIMARY KEY,
            recipe_entity_id TEXT NOT NULL REFERENCES entities(id),
            text TEXT NOT NULL,
            position INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        );
        CREATE INDEX idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_entity_id, position);
        CREATE TABLE recipe_steps (
            id TEXT PRIMARY KEY,
            recipe_entity_id TEXT NOT NULL REFERENCES entities(id),
            text TEXT NOT NULL,
            duration_minutes INTEGER,
            position INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        );
        CREATE INDEX idx_recipe_steps_recipe ON recipe_steps(recipe_entity_id, position);
        ",
    ), M::up(
        "
        -- Recipe Tags: a fixed, curated multi-select category distinct from
        -- the generic freeform Labels system (§02) — global (not per-Space,
        -- like `task_statuses`), seeded here, not user-creatable in this
        -- version. Each recipe can carry several, via the join table below.
        CREATE TABLE recipe_tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            icon TEXT NOT NULL,
            color TEXT NOT NULL,
            position INTEGER NOT NULL
        );
        INSERT INTO recipe_tags (id, name, icon, color, position) VALUES
            ('chicken', 'Chicken', 'meat', '#f59e0b', 0),
            ('beef', 'Beef', 'meat', '#b91c1c', 1),
            ('pork', 'Pork', 'meat', '#ec4899', 2),
            ('seafood', 'Seafood', 'fish', '#0ea5e9', 3),
            ('vegetarian', 'Vegetarian', 'leaf', '#22c55e', 4),
            ('vegan', 'Vegan', 'seedling', '#15803d', 5),
            ('salad', 'Salad', 'salad', '#84cc16', 6),
            ('soup', 'Soup', 'soup', '#f97316', 7),
            ('pasta', 'Pasta', 'chef', '#ca8a04', 8),
            ('baking', 'Baking', 'bread', '#92400e', 9),
            ('dessert', 'Dessert', 'cake', '#db2777', 10),
            ('grill', 'Grill', 'flame', '#dc2626', 11),
            ('spicy', 'Spicy', 'pepper', '#e11d48', 12),
            ('quick', 'Quick', 'bolt', '#06b6d4', 13);
        CREATE TABLE recipe_tag_links (
            recipe_entity_id TEXT NOT NULL REFERENCES entities(id),
            tag_id TEXT NOT NULL REFERENCES recipe_tags(id),
            PRIMARY KEY (recipe_entity_id, tag_id)
        );
        ",
    ), M::up(
        "
        -- Chicken, beef and pork shared one generic 'meat' icon; each gets its
        -- own now. Fixes forward instead of editing the seed above, which
        -- already ran against existing databases.
        UPDATE recipe_tags SET icon = 'drumstick' WHERE id = 'chicken';
        UPDATE recipe_tags SET icon = 'beef' WHERE id = 'beef';
        UPDATE recipe_tags SET icon = 'pig' WHERE id = 'pork';
        ",
    ), M::up(
        "
        -- Views (native entity): a named, per-Space snapshot of a module page's
        -- filters and display options (Tasks and Assignments today). `config`
        -- is opaque JSON the page itself reads back and validates.
        CREATE TABLE views (
            entity_id TEXT PRIMARY KEY REFERENCES entities(id),
            module TEXT NOT NULL,
            config TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX idx_views_module ON views(module);
        ",
    ), M::up(
        "
        -- Views can be reordered in the sidebar. Existing Views all start at 0 and
        -- keep their creation order (the list sorts by position, then creation);
        -- the first reorder writes explicit positions.
        ALTER TABLE views ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
        ",
    ), M::up(
        "
        -- Who teaches a Course and where. Free text, both optional; existing
        -- Courses start with neither set.
        ALTER TABLE courses ADD COLUMN professor TEXT;
        ALTER TABLE courses ADD COLUMN room TEXT;
        ",
    ), M::up(
        "
        -- Removing a module from a Space. `space_modules.hidden_at` marks the module
        -- as removed (the row stays so the lazy backfill from entities can't bring
        -- it back). `entities.hidden_at` marks entities that were hidden along with
        -- their module: they also carry `deleted_at`, so every existing query already
        -- leaves them out, but Trash, restore and Delete Forever skip them, and
        -- re-adding the module undoes it. Both are NULL for all existing rows.
        ALTER TABLE space_modules ADD COLUMN hidden_at TEXT;
        ALTER TABLE entities ADD COLUMN hidden_at TEXT;
        ",
    ), M::up(
        "
        -- Task filtering for Views. `completed_at` is when the status last moved into
        -- a finished one (doneness 100); `effort` is the estimate as one of the
        -- Fibonacci steps 1, 2, 3, 5, 8 or 13, whichever scale the app shows it in.
        -- Tasks already finished get their last edit time as the best known stand in
        -- for the completion time; open tasks and every estimate start empty.
        ALTER TABLE tasks ADD COLUMN completed_at TEXT;
        ALTER TABLE tasks ADD COLUMN effort INTEGER;
        UPDATE tasks
        SET completed_at = (SELECT updated_at FROM entities WHERE entities.id = tasks.entity_id)
        WHERE status_id IN (SELECT id FROM task_statuses WHERE doneness >= 100);
        ",
    ), M::up(
        "
        -- Which fields the user overrode on one occurrence of a recurring series,
        -- as a bitmask (`series::Field`): 1 start_time, 2 end_time, 4 location,
        -- 8 all_day, 16 description. A series edit used to treat any value that
        -- differed from the template as an override, so occurrences an earlier
        -- edit from a later date never reached stopped following the series.
        -- The backfill marks exactly the fields that differ from the template
        -- today, so every existing override is kept and the next series edit
        -- behaves as it did before this migration. One-off occurrences and
        -- those whose template row is gone stay 0.
        ALTER TABLE calendar_entries ADD COLUMN overridden_fields INTEGER NOT NULL DEFAULT 0;
        UPDATE calendar_entries SET overridden_fields = (
            SELECT (CASE WHEN calendar_entries.start_time IS NOT t.start_time THEN 1 ELSE 0 END)
                 | (CASE WHEN calendar_entries.end_time IS NOT t.end_time THEN 2 ELSE 0 END)
                 | (CASE WHEN calendar_entries.location IS NOT t.location THEN 4 ELSE 0 END)
                 | (CASE WHEN (calendar_entries.all_day != 0) IS NOT (t.all_day != 0) THEN 8 ELSE 0 END)
                 | (CASE WHEN calendar_entries.description IS NOT t.description THEN 16 ELSE 0 END)
            FROM calendar_entry_templates t WHERE t.entity_id = calendar_entries.template_id
        )
        WHERE template_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM calendar_entry_templates t WHERE t.entity_id = calendar_entries.template_id
        );

        ALTER TABLE sessions ADD COLUMN overridden_fields INTEGER NOT NULL DEFAULT 0;
        UPDATE sessions SET overridden_fields = (
            SELECT (CASE WHEN sessions.start_time IS NOT t.start_time THEN 1 ELSE 0 END)
                 | (CASE WHEN sessions.end_time IS NOT t.end_time THEN 2 ELSE 0 END)
                 | (CASE WHEN sessions.location IS NOT t.location THEN 4 ELSE 0 END)
            FROM session_templates t WHERE t.entity_id = sessions.template_id
        )
        WHERE template_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM session_templates t WHERE t.entity_id = sessions.template_id
        );
        ",
    ),
    M::up(
        "
        -- `course-notes` used to be the 1:1 link from a Course to its embedded notes
        -- page. That link is now `course-note`, and `course-notes` is free to link
        -- any number of regular notes to a Course. Only rows pointing at the
        -- embedded page are retagged, so nothing else changes meaning.
        UPDATE relationships SET relationship_type = 'course-note'
        WHERE relationship_type = 'course-notes'
          AND to_entity_id IN (SELECT id FROM entities WHERE type = 'course_notes');
        ",
    ), M::up(
        "
        -- 'Delete this and following' records where a series ends, so extending the
        -- horizon later (or Empty Trash) never brings the deleted dates back. NULL
        -- means the series has not been cut short, which is every existing one.
        ALTER TABLE session_templates ADD COLUMN series_end TEXT;
        ALTER TABLE calendar_entry_templates ADD COLUMN series_end TEXT;

        -- Bit 32 of overridden_fields: the occurrence's title was edited on its own,
        -- so a series rename leaves it alone. Backfilled for every occurrence whose
        -- title already differs from its series', which keeps each custom title
        -- exactly as protected as before.
        UPDATE sessions SET overridden_fields = overridden_fields | 32
        WHERE template_id IS NOT NULL
          AND (SELECT title FROM entities WHERE id = sessions.entity_id)
              IS NOT (SELECT title FROM entities WHERE id = sessions.template_id);
        UPDATE calendar_entries SET overridden_fields = overridden_fields | 32
        WHERE template_id IS NOT NULL
          AND (SELECT title FROM entities WHERE id = calendar_entries.entity_id)
              IS NOT (SELECT title FROM entities WHERE id = calendar_entries.template_id);
        ",
    ), M::up(
        "
        -- The slots a series has filled, kept apart from its occurrences so moving,
        -- trashing or emptying the trash never opens one again. A slot that was only
        -- skipped (something sat on its date) is not recorded and opens again once
        -- that moves away.
        CREATE TABLE series_slots (
            template_id TEXT NOT NULL,
            slot_date TEXT NOT NULL,
            PRIMARY KEY (template_id, slot_date)
        );
        -- Series generated before this know their slots only by their rows: the row
        -- count is how many leading slots they filled. Frozen here, so existing
        -- series behave exactly as they did.
        ALTER TABLE session_templates ADD COLUMN legacy_filled INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE calendar_entry_templates ADD COLUMN legacy_filled INTEGER NOT NULL DEFAULT 0;
        UPDATE session_templates SET legacy_filled =
            (SELECT COUNT(*) FROM sessions s WHERE s.template_id = session_templates.entity_id);
        UPDATE calendar_entry_templates SET legacy_filled =
            (SELECT COUNT(*) FROM calendar_entries c
             WHERE c.template_id = calendar_entry_templates.entity_id);
        ",
    ), M::up(
        "
        -- When an exam starts, as HH:MM. Optional: without it the exam is an all day
        -- event on the calendar, so existing exams need no backfill.
        ALTER TABLE exams ADD COLUMN exam_time TEXT;
        ",
    ), M::up(
        "
        -- An assignment due before the course's next session: how many days before it.
        -- NULL keeps the fixed due_date, so existing assignments need no backfill.
        ALTER TABLE assignments ADD COLUMN due_session_offset_days INTEGER;
        ",
    ), M::up(
        "
        -- The Grade Report module comes with Exams and Assignments. Spaces already
        -- using either get it now, at the end of their module order. A Space that
        -- removed the module keeps its hidden row, as INSERT OR IGNORE leaves it be.
        -- Rows pointing at a Space that no longer exists are left as they are.
        INSERT OR IGNORE INTO space_modules (space_id, module_key, added_at, position)
            SELECT s.space_id, 'grades', strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now'),
                   COALESCE((SELECT MAX(m.position) FROM space_modules m
                             WHERE m.space_id = s.space_id), -1) + 1
            FROM (
                SELECT space_id FROM space_modules
                    WHERE module_key IN ('exams', 'assignments') AND hidden_at IS NULL
                UNION
                SELECT space_id FROM entities
                    WHERE type IN ('exam', 'assignment')
                      AND deleted_at IS NULL AND hidden_at IS NULL
            ) s
            WHERE s.space_id IN (SELECT id FROM spaces);
        ",
    ), M::up(
        "
        -- An assignment's weight in its course's grade, like an exam's. NULL splits what
        -- the weighted work leaves evenly, as every existing assignment did.
        ALTER TABLE assignments ADD COLUMN weight REAL;
        ",
    ), M::up(
        "
        -- Per note settings. code_language is the language a new code block in the
        -- note starts with; no row means the app's default applies.
        CREATE TABLE note_settings (
            entity_id TEXT PRIMARY KEY REFERENCES entities(id),
            code_language TEXT
        );
        ",
    )]
}

pub static MIGRATIONS: LazyLock<Migrations<'static>> = LazyLock::new(|| Migrations::new(all()));

/// Total number of migrations, so a caller can tell — before `to_latest` runs —
/// whether it's about to change the schema (`current_version < MIGRATION_COUNT`).
/// Used to snapshot the database right before an upgrade touches it.
pub static MIGRATION_COUNT: LazyLock<usize> = LazyLock::new(|| all().len());

#[cfg(test)]
mod grades_module_backfill {
    use super::{MIGRATIONS, MIGRATION_COUNT};
    use rusqlite::{params, Connection};

    /// The schema version right before the Grades module migration.
    const BEFORE: usize = 37;

    fn space(conn: &Connection, id: &str) {
        conn.execute(
            "INSERT INTO spaces (id, name, color, created_at, updated_at)
             VALUES (?1, ?1, '#000', '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00')",
            params![id],
        )
        .unwrap();
    }

    fn module(conn: &Connection, space: &str, key: &str, position: i64, hidden: Option<&str>) {
        conn.execute(
            "INSERT INTO space_modules (space_id, module_key, added_at, position, hidden_at)
             VALUES (?1, ?2, '2026-01-01T00:00:00+00:00', ?3, ?4)",
            params![space, key, position, hidden],
        )
        .unwrap();
    }

    fn rows(conn: &Connection, space: &str) -> Vec<(String, i64, Option<String>)> {
        let mut stmt = conn
            .prepare(
                "SELECT module_key, position, hidden_at FROM space_modules
                 WHERE space_id = ?1 ORDER BY position, module_key",
            )
            .unwrap();
        stmt.query_map(params![space], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
    }

    #[test]
    fn spaces_with_exams_or_assignments_get_the_grades_module() {
        assert!(*MIGRATION_COUNT > BEFORE);
        let mut conn = Connection::open_in_memory().unwrap();
        MIGRATIONS.to_version(&mut conn, BEFORE).unwrap();
        for id in [
            "exams",
            "assignments",
            "both",
            "neither",
            "removed",
            "empty",
        ] {
            space(&conn, id);
        }
        module(&conn, "exams", "courses", 0, None);
        module(&conn, "exams", "exams", 1, None);
        module(&conn, "assignments", "assignments", 0, None);
        module(&conn, "both", "exams", 0, None);
        module(&conn, "both", "assignments", 1, None);
        module(&conn, "neither", "tasks", 0, None);
        // Removed again, hidden: not in use, so nothing to report on.
        module(
            &conn,
            "removed",
            "exams",
            0,
            Some("2026-02-01T00:00:00+00:00"),
        );
        // Its own row is kept as it is when it already exists.
        module(
            &conn,
            "both",
            "grades",
            2,
            Some("2026-02-01T00:00:00+00:00"),
        );

        MIGRATIONS.to_latest(&mut conn).unwrap();

        let keys = |space: &str| -> Vec<String> {
            rows(&conn, space)
                .into_iter()
                .map(|(key, _, _)| key)
                .collect()
        };
        assert_eq!(keys("exams"), vec!["courses", "exams", "grades"]);
        assert_eq!(keys("assignments"), vec!["assignments", "grades"]);
        assert_eq!(keys("neither"), vec!["tasks"]);
        assert_eq!(keys("removed"), vec!["exams"]);
        assert!(keys("empty").is_empty());
        // It joins the end of the Space's module order.
        assert_eq!(rows(&conn, "exams")[2].1, 2);
        assert_eq!(rows(&conn, "assignments")[1].1, 1);
        // A removed Grades module stays removed.
        let both = rows(&conn, "both");
        assert_eq!(both.iter().filter(|(key, _, _)| key == "grades").count(), 1);
        assert!(both
            .iter()
            .any(|(key, _, hidden)| key == "grades" && hidden.is_some()));
    }

    /// A user's upgrade stopped here: rows of theirs pointed at a Space that no longer
    /// exists, and the Grades row for it failed its foreign key. Those rows are left as
    /// they are, and the Space that is gone gets no module.
    #[test]
    fn rows_of_a_space_that_no_longer_exists_do_not_stop_it() {
        let mut conn = Connection::open_in_memory().unwrap();
        MIGRATIONS.to_version(&mut conn, BEFORE).unwrap();
        space(&conn, "kept");
        module(&conn, "kept", "exams", 0, None);
        conn.execute_batch(
            "PRAGMA foreign_keys = OFF;
             INSERT INTO space_modules (space_id, module_key, added_at, position)
                 VALUES ('gone', 'assignments', '2026-01-01T00:00:00+00:00', 0);
             INSERT INTO entities (id, space_id, type, title, created_at, updated_at)
                 VALUES ('e1', 'gone', 'exam', 'Final', '2026-01-01T00:00:00+00:00',
                         '2026-01-01T00:00:00+00:00');
             PRAGMA foreign_keys = ON;",
        )
        .unwrap();

        MIGRATIONS.to_latest(&mut conn).unwrap();

        let keys: Vec<String> = rows(&conn, "kept").into_iter().map(|r| r.0).collect();
        assert_eq!(keys, vec!["exams", "grades"]);
        assert_eq!(rows(&conn, "gone").len(), 1);
        let entity: i64 = conn
            .query_row("SELECT COUNT(*) FROM entities WHERE id = 'e1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(entity, 1);
    }
}

#[cfg(test)]
mod overridden_fields_backfill {
    use super::{MIGRATIONS, MIGRATION_COUNT};
    use rusqlite::types::Value;
    use rusqlite::{params, Connection};

    /// The schema version right before the `overridden_fields` migration.
    const BEFORE: usize = 31;

    fn entity(conn: &Connection, id: &str, kind: &str, title: &str, n: i64) {
        conn.execute(
            "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number)
             VALUES (?1, 'space', ?2, ?3, '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00', 'CAL', ?4)",
            params![id, kind, title, n],
        )
        .unwrap();
    }

    #[allow(clippy::too_many_arguments)]
    fn calendar_entry(
        conn: &Connection,
        id: &str,
        template_id: Option<&str>,
        date: &str,
        start: Option<&str>,
        end: Option<&str>,
        all_day: i64,
        location: Option<&str>,
        description: Option<&str>,
        n: i64,
    ) {
        entity(conn, id, "calendar_entry", "Gym", n);
        conn.execute(
            "INSERT INTO calendar_entries (entity_id, template_id, date, end_date, start_time, end_time, all_day, cancelled, location, description)
             VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, 0, ?7, ?8)",
            params![id, template_id, date, start, end, all_day, location, description],
        )
        .unwrap();
    }

    fn session(
        conn: &Connection,
        id: &str,
        template_id: Option<&str>,
        date: &str,
        times: (&str, &str),
        location: Option<&str>,
        n: i64,
    ) {
        entity(conn, id, "session", "Lecture", n);
        conn.execute(
            "INSERT INTO sessions (entity_id, template_id, date, start_time, end_time, cancelled, location, notes)
             VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, 'kept')",
            params![id, template_id, date, times.0, times.1, location],
        )
        .unwrap();
    }

    /// Every row of `table`, every column but the new one, ordered by id.
    fn rows(conn: &Connection, table: &str, columns: &str) -> Vec<Vec<Value>> {
        let mut stmt = conn
            .prepare(&format!("SELECT {columns} FROM {table} ORDER BY 1"))
            .unwrap();
        let n = stmt.column_count();
        stmt.query_map([], |row| (0..n).map(|i| row.get(i)).collect())
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    fn flags(conn: &Connection, table: &str) -> Vec<(String, i64)> {
        let mut stmt = conn
            .prepare(&format!(
                "SELECT entity_id, overridden_fields FROM {table} ORDER BY entity_id"
            ))
            .unwrap();
        stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    const CALENDAR_COLUMNS: &str = "entity_id, template_id, date, end_date, start_time, end_time, \
                                    all_day, cancelled, location, description";
    const SESSION_COLUMNS: &str =
        "entity_id, template_id, date, start_time, end_time, cancelled, location, notes";

    #[test]
    fn backfill_marks_exactly_the_fields_that_differ_from_the_template() {
        assert!(*MIGRATION_COUNT > BEFORE);
        let mut conn = Connection::open_in_memory().unwrap();
        MIGRATIONS.to_version(&mut conn, BEFORE).unwrap();
        conn.execute(
            "INSERT INTO spaces (id, name, color, created_at, updated_at)
             VALUES ('space', 'Life', '#000', '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00')",
            [],
        )
        .unwrap();
        // A template entity whose template row is gone (`c6` below).
        entity(&conn, "gone", "calendar_entry_template", "Old", 13);

        // Calendar template: 07:00 to 08:00 at Room 1, "Towel", timed.
        entity(&conn, "ct", "calendar_entry_template", "Gym", 1);
        conn.execute(
            "INSERT INTO calendar_entry_templates (entity_id, recurrence, start_time, end_time, all_day, location, description, anchor_date)
             VALUES ('ct', 'daily', '07:00', '08:00', 0, 'Room 1', 'Towel', '2026-01-05')",
            [],
        )
        .unwrap();
        let t = Some("ct");
        let (s, e) = (Some("07:00"), Some("08:00"));
        let (room, towel) = (Some("Room 1"), Some("Towel"));
        calendar_entry(&conn, "c1", t, "2026-01-05", s, e, 0, room, towel, 2);
        calendar_entry(
            &conn,
            "c2",
            t,
            "2026-01-06",
            Some("06:00"),
            e,
            0,
            room,
            towel,
            3,
        );
        calendar_entry(
            &conn,
            "c3",
            t,
            "2026-01-07",
            s,
            Some("09:00"),
            0,
            None,
            towel,
            4,
        );
        calendar_entry(&conn, "c4", t, "2026-01-08", None, None, 1, room, None, 5);
        calendar_entry(
            &conn,
            "c5",
            None,
            "2026-01-09",
            Some("06:00"),
            e,
            0,
            None,
            None,
            6,
        );
        calendar_entry(
            &conn,
            "c6",
            Some("gone"),
            "2026-01-10",
            Some("06:00"),
            e,
            0,
            None,
            None,
            7,
        );

        // Session template: 10:00 to 12:00, no location.
        entity(&conn, "st", "session_template", "Lecture", 8);
        conn.execute(
            "INSERT INTO session_templates (entity_id, weekday, start_time, end_time, location, anchor_date)
             VALUES ('st', 0, '10:00', '12:00', NULL, '2026-01-05')",
            [],
        )
        .unwrap();
        let t = Some("st");
        session(&conn, "s1", t, "2026-01-05", ("10:00", "12:00"), None, 9);
        session(
            &conn,
            "s2",
            t,
            "2026-01-12",
            ("10:00", "12:00"),
            Some("Hall"),
            10,
        );
        session(&conn, "s3", t, "2026-01-19", ("09:00", "11:00"), None, 11);
        session(
            &conn,
            "s4",
            None,
            "2026-01-20",
            ("09:00", "11:00"),
            Some("Hall"),
            12,
        );

        let calendar_before = rows(&conn, "calendar_entries", CALENDAR_COLUMNS);
        let sessions_before = rows(&conn, "sessions", SESSION_COLUMNS);
        let entities_before = rows(&conn, "entities", "*");
        let templates_before = (
            rows(&conn, "calendar_entry_templates", "*"),
            rows(&conn, "session_templates", "*"),
        );

        MIGRATIONS.to_latest(&mut conn).unwrap();

        // Nothing lost and nothing else changed.
        assert_eq!(
            rows(&conn, "calendar_entries", CALENDAR_COLUMNS),
            calendar_before
        );
        assert_eq!(rows(&conn, "sessions", SESSION_COLUMNS), sessions_before);
        assert_eq!(rows(&conn, "entities", "*"), entities_before);
        // `series_end` and `legacy_filled` were added after these columns, in that
        // order, so they are the last two. Neither has a series to describe here.
        let without_new_columns = |mut table: Vec<Vec<rusqlite::types::Value>>| {
            for row in &mut table {
                assert!(matches!(
                    row.pop(),
                    Some(rusqlite::types::Value::Integer(_))
                ));
                assert_eq!(row.pop(), Some(rusqlite::types::Value::Null));
            }
            table
        };
        assert_eq!(
            (
                without_new_columns(rows(&conn, "calendar_entry_templates", "*")),
                without_new_columns(rows(&conn, "session_templates", "*")),
            ),
            templates_before
        );

        // Each series remembers how many leading slots its rows covered.
        for (templates, occurrences) in [
            ("calendar_entry_templates", "calendar_entries"),
            ("session_templates", "sessions"),
        ] {
            let mismatched: i64 = conn
                .query_row(
                    &format!(
                        "SELECT COUNT(*) FROM {templates} t WHERE t.legacy_filled !=
                         (SELECT COUNT(*) FROM {occurrences} o WHERE o.template_id = t.entity_id)"
                    ),
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(mismatched, 0, "{templates}.legacy_filled");
        }

        // 1 start, 2 end, 4 location, 8 all day, 16 description.
        assert_eq!(
            flags(&conn, "calendar_entries"),
            vec![
                ("c1".into(), 0),
                ("c2".into(), 1),
                ("c3".into(), 2 | 4),
                ("c4".into(), 1 | 2 | 8 | 16),
                ("c5".into(), 0),
                // 32, a later migration: its title differs from its series'.
                ("c6".into(), 32),
            ]
        );
        assert_eq!(
            flags(&conn, "sessions"),
            vec![
                ("s1".into(), 0),
                ("s2".into(), 4),
                ("s3".into(), 1 | 2),
                ("s4".into(), 0),
            ]
        );

        // The next series edit treats them exactly as before the migration:
        // what differed from the template is kept, the rest follows.
        crate::db::calendar::update_calendar_entry_series(
            &conn,
            "ct",
            "2026-01-01",
            crate::db::calendar::CalendarEntrySeriesPatch {
                start_time: Some(Some("05:00".into())),
                location: Some(Some("Studio".into())),
                ..Default::default()
            },
        )
        .unwrap();
        let get = |id: &str| crate::db::calendar::get_calendar_entry(&conn, id).unwrap();
        assert_eq!(get("c1").start_time.as_deref(), Some("05:00"));
        assert_eq!(get("c1").location.as_deref(), Some("Studio"));
        assert_eq!(get("c2").start_time.as_deref(), Some("06:00"));
        assert_eq!(get("c2").location.as_deref(), Some("Studio"));
        assert_eq!(get("c3").location, None);
        assert!(get("c4").all_day && get("c4").start_time.is_none());

        crate::db::sessions::update_session_series(
            &conn,
            "st",
            "2026-01-01",
            crate::db::sessions::SeriesPatch {
                start_time: Some("08:00".into()),
                location: Some(Some("Room 2".into())),
                ..Default::default()
            },
        )
        .unwrap();
        let get = |id: &str| crate::db::sessions::get_session_occurrence(&conn, id).unwrap();
        assert_eq!(
            (get("s1").start_time.as_str(), get("s1").location.as_deref()),
            ("08:00", Some("Room 2"))
        );
        assert_eq!(
            (get("s2").start_time.as_str(), get("s2").location.as_deref()),
            ("08:00", Some("Hall"))
        );
        assert_eq!(
            (get("s3").start_time.as_str(), get("s3").location.as_deref()),
            ("09:00", Some("Room 2"))
        );
    }
}

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
        0xd13dbd1f7a779ef2,
        0xc8a0501233f85db1,
        0x3646ef370368e4cc,
        0x75618d812bb97c6c,
        0x37b01b76112ec465,
        0xc1e5af1629f9c19a,
        0xc933a750ff4f5f72,
        0x9385d76400678f57,
        0xb9406e703532694b,
        0xba33a4192b4bbba9,
        0x7c721406412ca45b,
        0xc08c803d15973069,
        0x2c27db43ab1a6600,
        0xf26762aee1e57139,
        0x92f77bf6cda3ea8c,
        0x7070e02fbefb5df4,
        0xea6ca357124886f,
        // Migration 38, the one sanctioned rewrite: it failed on databases with rows
        // pointing at a Space that no longer exists, and a failing migration cannot be
        // fixed forward. The added guard only skips those Spaces, so every database it
        // already ran on would get the same result.
        0xec9ec2b054e9e2f9,
        0x689c23fb341a5f0a,
        0xfc01de1290319823,
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
