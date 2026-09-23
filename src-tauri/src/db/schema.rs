//! Entity schema registry (PLAN.md §1: "Generate, Don't Hand-Write").
//!
//! Every module that owns an entity type (a Provider, per `01-philosophy.md`)
//! registers one `EntitySchemaDef` here via `inventory::submit!`, the same
//! pattern `relationships.rs` already uses for `RelationshipTypeDef`. The CLI
//! (see `crate::cli`) is a single generic implementation that reads this
//! registry at runtime — it never hand-writes a command per module. A new
//! module gets full CLI coverage (list/get/create/update/delete/describe) the
//! moment it submits a schema here, with zero CLI-side code.
//!
//! Base entity fields (`id`, `spaceId`, `title`, `icon`, `pinned`, timestamps)
//! are handled generically by the CLI dispatcher for every type and are never
//! part of a module's own `fields` list — `fields` only ever describes the
//! module-specific (subtype) data.

use crate::error::AppResult;
use rusqlite::Connection;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::sync::OnceLock;

pub type JsonMap = Map<String, Value>;

#[derive(Debug, Clone, Copy)]
pub enum FieldKind {
    Text,
    LongText,
    Integer,
    Float,
    Boolean,
    Date,
    /// Not used by any core module's fields yet (all timestamp-ish subtype
    /// columns today are plain dates) — kept for community modules that need
    /// a combined date+time field.
    #[allow(dead_code)]
    DateTime,
    /// Documents the expected shape; not enforced by the CLI parser itself
    /// (the underlying core function is the actual authority).
    Enum(&'static [&'static str]),
    /// References another entity by id. `entity_type` names the referenced
    /// type, so an agent calling `describe` knows what to pass.
    EntityRef(&'static str),
}

impl FieldKind {
    fn to_json(self) -> Value {
        match self {
            FieldKind::Text => Value::String("text".into()),
            FieldKind::LongText => Value::String("long_text".into()),
            FieldKind::Integer => Value::String("integer".into()),
            FieldKind::Float => Value::String("float".into()),
            FieldKind::Boolean => Value::String("boolean".into()),
            FieldKind::Date => Value::String("date".into()),
            FieldKind::DateTime => Value::String("datetime".into()),
            FieldKind::Enum(values) => serde_json::json!({ "type": "enum", "values": values }),
            FieldKind::EntityRef(entity_type) => {
                serde_json::json!({ "type": "entity_ref", "entityType": entity_type })
            }
        }
    }
}

pub struct FieldDef {
    pub name: &'static str,
    pub kind: FieldKind,
    pub required_on_create: bool,
    pub writable_on_update: bool,
    pub description: &'static str,
}

/// Input to a module's `create` adapter. `space_id`/`title` are base entity
/// fields every type shares; `fields` carries only the module-specific values
/// the caller passed via `--field name=value`. `icon` (also a base field) is
/// deliberately not threaded through here — the CLI dispatcher applies it
/// generically after creation via `entities::update_entity`, the same way it
/// handles `icon`/`pinned` on `update`, so no module adapter needs to know
/// about it.
pub struct CreateInput {
    pub space_id: String,
    pub title: String,
    pub fields: JsonMap,
}

pub struct EntitySchemaDef {
    pub entity_type: &'static str,
    pub description: &'static str,
    pub fields: &'static [FieldDef],
    /// Relationship types this entity type is known to participate in.
    /// Documentation only, for `describe` — the relationship engine itself
    /// doesn't restrict edges by entity type beyond structural cardinality.
    pub relationship_types: &'static [&'static str],
    /// Whether this type's content lives in block storage (Notes/Jots —
    /// §2.1's "block-level addressable" pages) rather than
    /// (or in addition to) `fields`. When true, the CLI generically offers
    /// `blocks`/`add-block`/`update-block`/`delete-block`/`reorder-blocks`
    /// for this type — see `cli::block_command`. A future module opts into
    /// full block editing by setting this, with zero new CLI code.
    pub supports_blocks: bool,
    pub create: fn(&Connection, CreateInput) -> AppResult<Value>,
    pub update: fn(&Connection, &str, &JsonMap) -> AppResult<Value>,
    pub get: fn(&Connection, &str) -> AppResult<Value>,
    pub list: fn(&Connection, Option<&str>, bool) -> AppResult<Vec<Value>>,
}

/// The block types `block_to_markdown` (`db::notes`) knows how to render.
/// Any string is technically accepted by `create_block`/`update_block`, but
/// these are the ones with defined rendering/editor behavior.
pub const KNOWN_BLOCK_TYPES: &[&str] = &[
    "paragraph",
    "heading1",
    "heading2",
    "heading3",
    "quote",
    "code",
    "bulleted_list",
    "numbered_list",
    "table",
    "image",
    "embed",
];

inventory::collect!(EntitySchemaDef);

fn registry() -> &'static HashMap<&'static str, &'static EntitySchemaDef> {
    static REGISTRY: OnceLock<HashMap<&'static str, &'static EntitySchemaDef>> = OnceLock::new();
    REGISTRY.get_or_init(|| {
        inventory::iter::<EntitySchemaDef>()
            .map(|def| (def.entity_type, def))
            .collect()
    })
}

pub fn lookup(entity_type: &str) -> Option<&'static EntitySchemaDef> {
    registry().get(entity_type).copied()
}

/// Every registered entity type, sorted by name for stable `schema --all` output.
pub fn all() -> Vec<&'static EntitySchemaDef> {
    let mut defs: Vec<_> = registry().values().copied().collect();
    defs.sort_by_key(|def| def.entity_type);
    defs
}

pub fn describe_json(def: &EntitySchemaDef) -> Value {
    let fields: Vec<Value> = def
        .fields
        .iter()
        .map(|f| {
            serde_json::json!({
                "name": f.name,
                "kind": f.kind.to_json(),
                "requiredOnCreate": f.required_on_create,
                "writableOnUpdate": f.writable_on_update,
                "description": f.description,
            })
        })
        .collect();
    let block_commands = def.supports_blocks.then(|| {
        serde_json::json!({
            "knownBlockTypes": KNOWN_BLOCK_TYPES,
            "list": format!("nookly cli {} blocks <id>", def.entity_type),
            "add": format!("nookly cli {} add-block <id> --type <blockType> --content <text> [--position <n>] [--language <lang>] [--filename <name>]", def.entity_type),
            "update": format!("nookly cli {} update-block <block-id> [--content <text>] [--type <blockType>] [--language <lang>] [--filename <name>]", def.entity_type),
            "delete": format!("nookly cli {} delete-block <block-id> --yes", def.entity_type),
            "reorder": format!("nookly cli {} reorder-blocks <id> <block-id> <block-id> ...", def.entity_type),
            // Called out separately from `add`/`update` above (not just the bracketed
            // `[--language <lang>] [--filename <name>]` in those usage strings) because these
            // two flags are easy to miss buried at the end of a long line, and only mean
            // anything on a `code` block — everywhere else they're a silent no-op.
            "codeBlockHeader": {
                "description": "A `code` block's header row in the editor UI shows a filename and a language (used for syntax highlighting). Set both when adding or updating a code block.",
                "language": "highlight.js grammar name shown in the editor's language picker, e.g. javascript, typescript, python, rust, jsonc. Omit (or pass \"\" on update) for plain, unhighlighted text.",
                "filename": "Display filename shown in the header row, e.g. app.js. Purely cosmetic — omit (or pass \"\" on update) to clear it.",
                "example": format!(
                    "nookly cli {} add-block <id> --type code --content 'console.log(1)' --language javascript --filename app.js",
                    def.entity_type
                ),
            },
        })
    });
    serde_json::json!({
        "entityType": def.entity_type,
        "description": def.description,
        "supportsBlocks": def.supports_blocks,
        "blockCommands": block_commands,
        "baseFields": [
            { "name": "id", "kind": "text", "description": "Stable unique id (UUID), generated" },
            { "name": "key", "kind": "text", "description": "Readable id like TSK-14, generated; accepted anywhere an entity id is" },
            { "name": "spaceId", "kind": "entity_ref(space)", "description": "Space this entity belongs to" },
            { "name": "title", "kind": "text", "description": "User-editable title, set via --title" },
            { "name": "icon", "kind": "text", "description": "Optional emoji/icon, set via --icon" },
            { "name": "pinned", "kind": "boolean", "description": "Set via --pinned true|false" },
            { "name": "createdAt", "kind": "datetime", "description": "Read-only" },
            { "name": "updatedAt", "kind": "datetime", "description": "Read-only" },
            { "name": "deletedAt", "kind": "datetime", "description": "Read-only; set by delete, cleared by restore" },
        ],
        "fields": fields,
        "relationshipTypes": def.relationship_types,
    })
}

pub fn field_str(fields: &JsonMap, name: &str) -> Option<String> {
    fields
        .get(name)
        .and_then(|v| v.as_str())
        .map(str::to_string)
}

pub fn field_f64(fields: &JsonMap, name: &str) -> Option<f64> {
    fields.get(name).and_then(|v| v.as_f64())
}

pub fn field_i64(fields: &JsonMap, name: &str) -> Option<i64> {
    fields.get(name).and_then(|v| v.as_i64())
}

pub fn field_bool(fields: &JsonMap, name: &str) -> Option<bool> {
    fields.get(name).and_then(|v| v.as_bool())
}

pub fn require_str(fields: &JsonMap, name: &str) -> AppResult<String> {
    field_str(fields, name).ok_or_else(|| {
        crate::error::AppError::InvalidInput(format!("--field {name}=<value> is required"))
    })
}
