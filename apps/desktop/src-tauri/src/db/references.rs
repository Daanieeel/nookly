//! References: one record for every pointer to something Nookly does not own, such as a
//! file on disk, a link or a Moodle course. A reference keeps identity (which provider,
//! which path, link or id) and the last facts seen (a title, when it was last reached),
//! never the content: a Moodle grade or a post is still read live from Moodle.
//!
//! Whether the target can be reached right now is **worked out live on each device and never
//! stored** in the record, because the answer depends on the device: a file that is fine on
//! the Mac is "Not on this device" on the phone. See [`ReferenceState`] for the five answers.
//!
//! A reference is either its own entity (`type = 'reference'`: a link or a Moodle course) or
//! belongs to a File that only points elsewhere (the File keeps its type and id, so its
//! relationships, mentions and the Files page stay as they are). Both are rows of
//! `entity_references`, and both get the same states, `Locate...` and CLI verbs.
//!
//! A file path is remembered per device (`reference_device_paths`), so one reference can
//! point at the same document on every device that has it.

use crate::db::entities::Entity;
use crate::db::schema::{CreateInput, EntitySchemaDef, FieldDef, FieldKind, JsonMap};
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;

/// A path typed or picked on a device.
pub const PROVIDER_FILE: &str = "file";
/// A web address that is not a webpage to keep (that is a Bookmark).
pub const PROVIDER_LINK: &str = "link";
pub const PROVIDER_MOODLE_COURSE: &str = "moodle_course";
/// `remote_id` is `<course id>:<assignment id>`.
pub const PROVIDER_MOODLE_ASSIGNMENT: &str = "moodle_assignment";

/// The providers a reference can be created for on its own. A file path becomes a
/// reference through the Files module (`file create --field sourcePath=...`).
pub const STANDALONE_PROVIDERS: &[&str] = &[
    PROVIDER_LINK,
    PROVIDER_MOODLE_COURSE,
    PROVIDER_MOODLE_ASSIGNMENT,
];

/// The five answers to "can I get to it?". One wording for each, everywhere.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ReferenceState {
    /// The file is found, Moodle answers.
    Available,
    /// Cannot be reached right now; the last answer is shown.
    Offline,
    /// The path is gone or the link is dead.
    Missing,
    /// The token expired or is missing.
    NeedsSignIn,
    /// A path that exists on another device only.
    NotOnThisDevice,
}

/// A state with the moment of the answer it falls back on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceStatus {
    pub state: ReferenceState,
    /// For `Offline`: when the target last answered. `None` if it never did.
    pub as_of: Option<String>,
}

/// What one look at the target found.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Probe {
    /// It answered.
    Reached,
    /// Nobody answered (no network, the site is down, the volume is not mounted).
    Unreachable,
    /// It answered that the thing is not there.
    Gone,
    /// It answered that the sign in is missing or no longer good.
    SignInNeeded,
    /// There is nothing to look at on this device (a path from another device).
    NotHere,
}

/// The state a probe means, given when the target last answered.
pub fn status_from(probe: Probe, last_seen_at: Option<&str>) -> ReferenceStatus {
    let (state, as_of) = match probe {
        Probe::Reached => (ReferenceState::Available, None),
        Probe::Unreachable => (ReferenceState::Offline, last_seen_at.map(str::to_string)),
        Probe::Gone => (ReferenceState::Missing, None),
        Probe::SignInNeeded => (ReferenceState::NeedsSignIn, None),
        Probe::NotHere => (ReferenceState::NotOnThisDevice, None),
    };
    ReferenceStatus { state, as_of }
}

/// What a reference stores and what this device can tell about it. Shared by a reference
/// entity and a File that only points elsewhere.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceFacts {
    pub provider: String,
    /// The path, link or id on the provider's side. For a file this is the path on the
    /// device it was added on; use `path_on_this_device` to open it.
    pub remote_id: String,
    /// The title the target had when it was last reached.
    pub last_known_title: Option<String>,
    pub last_seen_at: Option<String>,
    /// `available`, `offline`, `missing` or `needs_sign_in`: the last live answer.
    pub last_result: Option<String>,
    /// For a file: where it is on this device. `None` when it is not on this device.
    pub path_on_this_device: Option<String>,
    /// Worked out now for a file, which only needs the disk. For a link or a Moodle object
    /// it needs the network, so it is `None` here and `check_reference` finds it.
    pub status: Option<ReferenceStatus>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reference {
    pub entity: Entity,
    #[serde(flatten)]
    pub facts: ReferenceFacts,
}

struct Row {
    provider: String,
    remote_id: String,
    last_known_title: Option<String>,
    last_seen_at: Option<String>,
    last_result: Option<String>,
}

fn row(conn: &Connection, id: &str) -> AppResult<Option<Row>> {
    Ok(conn
        .query_row(
            "SELECT provider, remote_id, last_known_title, last_seen_at, last_result
             FROM entity_references WHERE entity_id = ?1",
            params![id],
            |r| {
                Ok(Row {
                    provider: r.get(0)?,
                    remote_id: r.get(1)?,
                    last_known_title: r.get(2)?,
                    last_seen_at: r.get(3)?,
                    last_result: r.get(4)?,
                })
            },
        )
        .optional()?)
}

/// Where `device` has this reference's file.
pub fn device_path(conn: &Connection, id: &str, device: &str) -> AppResult<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT path FROM reference_device_paths WHERE reference_id = ?1 AND device_id = ?2",
            params![id, device],
            |r| r.get(0),
        )
        .optional()?)
}

fn set_device_path(conn: &Connection, id: &str, device: &str, path: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO reference_device_paths (reference_id, device_id, path) VALUES (?1, ?2, ?3)
         ON CONFLICT (reference_id, device_id) DO UPDATE SET path = excluded.path",
        params![id, device, path],
    )?;
    Ok(())
}

/// A file reference's answer on `device`, from the disk alone.
pub fn probe_local(conn: &Connection, id: &str, device: &str) -> AppResult<Probe> {
    Ok(match device_path(conn, id, device)? {
        None => Probe::NotHere,
        Some(path) if Path::new(&path).is_file() => Probe::Reached,
        Some(_) => Probe::Gone,
    })
}

/// The facts of a reference as `device` sees them, `None` when `id` has no reference.
pub fn facts_for_device(
    conn: &Connection,
    id: &str,
    device: &str,
) -> AppResult<Option<ReferenceFacts>> {
    let Some(row) = row(conn, id)? else {
        return Ok(None);
    };
    let is_file = row.provider == PROVIDER_FILE;
    let path_on_this_device = if is_file {
        device_path(conn, id, device)?
    } else {
        None
    };
    let status = if is_file {
        Some(status_from(
            probe_local(conn, id, device)?,
            row.last_seen_at.as_deref(),
        ))
    } else {
        None
    };
    Ok(Some(ReferenceFacts {
        provider: row.provider,
        remote_id: row.remote_id,
        last_known_title: row.last_known_title,
        last_seen_at: row.last_seen_at,
        last_result: row.last_result,
        path_on_this_device,
        status,
    }))
}

/// `facts_for_device` for the device the app is running on.
pub fn facts_for(conn: &Connection, id: &str) -> AppResult<Option<ReferenceFacts>> {
    facts_for_device(conn, id, &crate::db::device::current())
}

fn require_facts(conn: &Connection, id: &str) -> AppResult<ReferenceFacts> {
    facts_for(conn, id)?.ok_or_else(|| AppError::NotFound(format!("reference {id}")))
}

/// Gives a File that points at `path` on `device` its reference, and remembers the path
/// for that device.
pub fn add_file_reference(
    conn: &Connection,
    entity_id: &str,
    title: &str,
    path: &str,
    device: &str,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO entity_references
            (entity_id, provider, remote_id, last_known_title, last_seen_at, last_result, origin_device_id)
         VALUES (?1, 'file', ?2, ?3, ?4, 'available', ?5)",
        params![entity_id, path, title, crate::db::now(), device],
    )?;
    set_device_path(conn, entity_id, device, path)
}

/// Makes the references that came from an upgrade belong to `device`: they were all typed
/// on the one device that had the data. Runs at every start and does nothing once done.
/// Returns how many references it adopted.
pub fn adopt_legacy(conn: &Connection, device: &str) -> AppResult<usize> {
    let mut stmt = conn.prepare(
        "SELECT entity_id, remote_id FROM entity_references
         WHERE provider = 'file' AND origin_device_id IS NULL",
    )?;
    let legacy: Vec<(String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    for (id, path) in &legacy {
        if device_path(conn, id, device)?.is_none() {
            set_device_path(conn, id, device, path)?;
        }
        conn.execute(
            "UPDATE entity_references SET origin_device_id = ?1 WHERE entity_id = ?2",
            params![device, id],
        )?;
    }
    Ok(legacy.len())
}

/// Points a file reference at `path` on `device`: the same document found again, on a
/// device that does not have it where it was, or after it moved. Only this device's path
/// changes.
pub fn locate_on_device(
    conn: &Connection,
    id: &str,
    device: &str,
    path: &Path,
) -> AppResult<ReferenceFacts> {
    let facts = facts_for_device(conn, id, device)?
        .ok_or_else(|| AppError::NotFound(format!("reference {id}")))?;
    if facts.provider != PROVIDER_FILE {
        return Err(AppError::InvalidInput(
            "only a reference to a file on disk can be located".into(),
        ));
    }
    if !path.is_file() {
        return Err(AppError::InvalidInput(format!(
            "no file at {}",
            path.display()
        )));
    }
    set_device_path(conn, id, device, &path.to_string_lossy())?;
    conn.execute(
        "UPDATE entity_references SET last_seen_at = ?1, last_result = 'available' WHERE entity_id = ?2",
        params![crate::db::now(), id],
    )?;
    facts_for_device(conn, id, device)?.ok_or_else(|| AppError::NotFound(format!("reference {id}")))
}

/// Keeps what a look at the target found: the last result, and when it answered (and its
/// title) if it did. Written only when something changed or the last answer is over an
/// hour old, so opening a page does not write to the database each time.
pub fn record_probe(
    conn: &Connection,
    id: &str,
    probe: Probe,
    title: Option<&str>,
) -> AppResult<()> {
    let result = match probe {
        Probe::Reached => "available",
        Probe::Unreachable => "offline",
        Probe::Gone => "missing",
        Probe::SignInNeeded => "needs_sign_in",
        // What a device lacks is not a fact about the target.
        Probe::NotHere => return Ok(()),
    };
    let Some(row) = row(conn, id)? else {
        return Err(AppError::NotFound(format!("reference {id}")));
    };
    if probe != Probe::Reached {
        if row.last_result.as_deref() != Some(result) {
            conn.execute(
                "UPDATE entity_references SET last_result = ?1 WHERE entity_id = ?2",
                params![result, id],
            )?;
        }
        return Ok(());
    }
    let fresh = row
        .last_seen_at
        .as_deref()
        .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
        .is_some_and(|t| chrono::Utc::now().signed_duration_since(t).num_minutes() < 60);
    let same_title = title.is_none() || title == row.last_known_title.as_deref();
    if fresh && row.last_result.as_deref() == Some(result) && same_title {
        return Ok(());
    }
    conn.execute(
        "UPDATE entity_references
         SET last_seen_at = ?1, last_result = ?2, last_known_title = COALESCE(?3, last_known_title)
         WHERE entity_id = ?4",
        params![crate::db::now(), result, title, id],
    )?;
    Ok(())
}

/// What an HTTP answer to a look at a link means.
pub fn probe_http_status(code: u16) -> Probe {
    match code {
        404 | 410 => Probe::Gone,
        401 | 403 | 407 => Probe::SignInNeeded,
        // Some servers refuse a HEAD request but would serve the page.
        405 | 501 => Probe::Reached,
        0..=399 => Probe::Reached,
        _ => Probe::Unreachable,
    }
}

/// Looks at a link. Blocking: call off the async runtime.
pub fn probe_link(link: &str) -> Probe {
    let Ok(url) = url::Url::parse(link) else {
        return Probe::Gone;
    };
    if !matches!(url.scheme(), "http" | "https") {
        return Probe::Gone;
    }
    let Ok(client) = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(6))
        .user_agent("Nookly")
        .build()
    else {
        return Probe::Unreachable;
    };
    match client.head(url).send() {
        Ok(response) => probe_http_status(response.status().as_u16()),
        Err(_) => Probe::Unreachable,
    }
}

/// Looks at whatever this device can look at without Moodle: a file on disk or a link.
/// A Moodle reference needs the signed in session of the app, see `moodle::service`.
pub fn probe_without_moodle(conn: &Connection, id: &str, device: &str) -> AppResult<Probe> {
    let row = row(conn, id)?.ok_or_else(|| AppError::NotFound(format!("reference {id}")))?;
    match row.provider.as_str() {
        PROVIDER_FILE => probe_local(conn, id, device),
        PROVIDER_LINK => Ok(probe_link(&row.remote_id)),
        _ => Err(AppError::InvalidInput(
            "a Moodle reference can only be checked inside the app, where Moodle is signed in"
                .into(),
        )),
    }
}

/// Looks at the target, keeps what it found and returns the state.
pub fn check_without_moodle(
    conn: &Connection,
    id: &str,
    device: &str,
) -> AppResult<ReferenceStatus> {
    let probe = probe_without_moodle(conn, id, device)?;
    finish_check(conn, id, probe, None)
}

/// Keeps what a look found (see `record_probe`) and returns the state it means.
pub fn finish_check(
    conn: &Connection,
    id: &str,
    probe: Probe,
    title: Option<&str>,
) -> AppResult<ReferenceStatus> {
    record_probe(conn, id, probe, title)?;
    let last_seen = row(conn, id)?.and_then(|r| r.last_seen_at);
    Ok(status_from(probe, last_seen.as_deref()))
}

// --- the reference entity ----------------------------------------------------------------

fn normalized(provider: &str, remote_id: &str) -> AppResult<String> {
    crate::db::require_one_of("provider", provider, STANDALONE_PROVIDERS)?;
    let remote_id = remote_id.trim();
    if remote_id.is_empty() {
        return Err(AppError::InvalidInput("remoteId must not be empty".into()));
    }
    match provider {
        PROVIDER_LINK => {
            let url = url::Url::parse(remote_id).map_err(|_| {
                AppError::InvalidInput(format!("'{remote_id}' is not a web address"))
            })?;
            if !matches!(url.scheme(), "http" | "https") {
                return Err(AppError::InvalidInput(
                    "a link must start with http:// or https://".into(),
                ));
            }
        }
        PROVIDER_MOODLE_COURSE => {
            remote_id.parse::<i64>().map_err(|_| {
                AppError::InvalidInput("a Moodle course's remoteId is its numeric id".into())
            })?;
        }
        _ => {
            let ok = remote_id
                .split_once(':')
                .is_some_and(|(c, a)| c.parse::<i64>().is_ok() && a.parse::<i64>().is_ok());
            if !ok {
                return Err(AppError::InvalidInput(
                    "a Moodle assignment's remoteId is '<course id>:<assignment id>'".into(),
                ));
            }
        }
    }
    Ok(remote_id.to_string())
}

/// Makes a reference entity. `title` is its name in Nookly (the target's title when the
/// caller has it); a blank one falls back to the remote id.
pub fn create_reference(
    conn: &Connection,
    space_id: String,
    provider: &str,
    remote_id: &str,
    title: Option<&str>,
) -> AppResult<Reference> {
    let remote_id = normalized(provider, remote_id)?;
    let title = title
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .unwrap_or(&remote_id)
        .to_string();
    crate::db::atomically(conn, || {
        let entity = crate::db::entities::create_entity(
            conn,
            space_id,
            "reference".into(),
            title.clone(),
            None,
        )?;
        conn.execute(
            "INSERT INTO entity_references (entity_id, provider, remote_id, last_known_title)
             VALUES (?1, ?2, ?3, ?4)",
            params![entity.id, provider, remote_id, title],
        )?;
        get_reference(conn, &entity.id)
    })
}

/// Points a reference at another target. What was known about the old one no longer applies.
pub fn retarget(conn: &Connection, id: &str, remote_id: &str) -> AppResult<Reference> {
    let current = require_facts(conn, id)?;
    let remote_id = normalized(&current.provider, remote_id)?;
    if remote_id != current.remote_id {
        conn.execute(
            "UPDATE entity_references
             SET remote_id = ?1, last_seen_at = NULL, last_result = NULL WHERE entity_id = ?2",
            params![remote_id, id],
        )?;
    }
    get_reference(conn, id)
}

pub fn get_reference(conn: &Connection, id: &str) -> AppResult<Reference> {
    let entity = crate::db::entities::get_entity(conn, id)?;
    if entity.entity_type != "reference" {
        return Err(AppError::NotFound(format!("reference {id}")));
    }
    Ok(Reference {
        entity,
        facts: require_facts(conn, id)?,
    })
}

pub fn list_references(conn: &Connection, space_id: &str) -> AppResult<Vec<Reference>> {
    let mut stmt = conn.prepare(
        "SELECT id FROM entities
         WHERE space_id = ?1 AND type = 'reference' AND deleted_at IS NULL
         ORDER BY created_at DESC",
    )?;
    let ids: Vec<String> = stmt
        .query_map(params![space_id], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    ids.iter().map(|id| get_reference(conn, id)).collect()
}

// --- CLI schema registration -------------------------------------------------------------

const REFERENCE_FIELDS: &[FieldDef] = &[
    FieldDef {
        name: "provider",
        kind: FieldKind::Enum(STANDALONE_PROVIDERS),
        required_on_create: true,
        writable_on_update: false,
        description: "What the reference points at: `link` (a web address), `moodle_course` or \
                      `moodle_assignment`. A file on disk is a File: `file create --field sourcePath=...`.",
    },
    FieldDef {
        name: "remoteId",
        kind: FieldKind::Text,
        required_on_create: true,
        writable_on_update: true,
        description: "Where it points: the web address for a link, the course id for a Moodle \
                      course, `<course id>:<assignment id>` for a Moodle assignment. Changing it \
                      forgets the last known facts.",
    },
];

fn cli_create_reference(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    let provider = crate::db::schema::require_str(&input.fields, "provider")?;
    let remote_id = crate::db::schema::require_str(&input.fields, "remoteId")?;
    let reference = create_reference(
        conn,
        input.space_id,
        &provider,
        &remote_id,
        Some(&input.title),
    )?;
    crate::error::to_json(reference)
}

fn cli_update_reference(
    conn: &Connection,
    id: &str,
    fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    if let Some(remote_id) = crate::db::schema::field_str(fields, "remoteId") {
        retarget(conn, id, &remote_id)?;
    }
    cli_get_reference(conn, id)
}

fn cli_get_reference(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    crate::error::to_json(get_reference(conn, id)?)
}

fn cli_list_references(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id.ok_or_else(|| {
        AppError::InvalidInput("reference list requires --space <space-id>".into())
    })?;
    list_references(conn, space_id)?
        .into_iter()
        .map(crate::error::to_json)
        .collect::<AppResult<Vec<_>>>()
}

inventory::submit! {
    crate::db::schema::ComputedFieldDef {
        entity_type: "file",
        name: "reference",
        kind: FieldKind::Object,
        description: "Read only. Present when the File only points at a file or link elsewhere: \
                      `{ provider, remoteId, lastKnownTitle, lastSeenAt, lastResult, \
                      pathOnThisDevice, status }`. `null` for a File Nookly stores itself. \
                      See the `locate` and `check` actions.",
    }
}

inventory::submit! {
    crate::db::schema::ComputedFieldDef {
        entity_type: "file",
        name: "availability",
        kind: FieldKind::Object,
        description: "Read only. `{ state, asOf }`: whether this device finds the file right now, \
                      for every File with bytes to look for (a stored copy is `available` or \
                      `missing`). `null` for a link never downloaded: run the `check` action.",
    }
}

inventory::submit! {
    crate::db::schema::ComputedFieldDef {
        entity_type: "reference",
        name: "lastKnownTitle",
        kind: FieldKind::Text,
        description: "Read only. The title the target had when it was last reached.",
    }
}
inventory::submit! {
    crate::db::schema::ComputedFieldDef {
        entity_type: "reference",
        name: "lastSeenAt",
        kind: FieldKind::DateTime,
        description: "Read only. When the target last answered. `null` if it never did.",
    }
}
inventory::submit! {
    crate::db::schema::ComputedFieldDef {
        entity_type: "reference",
        name: "lastResult",
        kind: FieldKind::Enum(&["available", "offline", "missing", "needs_sign_in"]),
        description: "Read only. The last live answer. Whether it can be reached right now is \
                      never stored: run the `check` action.",
    }
}
inventory::submit! {
    crate::db::schema::ComputedFieldDef {
        entity_type: "reference",
        name: "pathOnThisDevice",
        kind: FieldKind::Text,
        description: "Read only. For a file: where it is on this device; `null` when it is not on this device.",
    }
}
inventory::submit! {
    crate::db::schema::ComputedFieldDef {
        entity_type: "reference",
        name: "status",
        kind: FieldKind::Object,
        description: "Read only. `{ state, asOf }` where state is `available`, `offline`, \
                      `missing`, `needsSignIn` or `notOnThisDevice`, worked out now. Only given \
                      for a file; run the `check` action for a link.",
    }
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "reference",
        supports_blocks: false,
        description: "A pointer to something Nookly does not own, like a Moodle course or a link. \
                      It keeps the target's identity and last known title, never its content, so \
                      it can be linked to other items. Whether the target can be reached is \
                      worked out live (the `check` action) and never stored.",
        fields: REFERENCE_FIELDS,
        relationship_types: &["relates-to", "attached-file"],
        create: cli_create_reference,
        update: cli_update_reference,
        get: cli_get_reference,
        list: cli_list_references,
    }
}

// --- CLI actions ---------------------------------------------------------------------------

const LOCATE_FIELDS: &[FieldDef] = &[FieldDef {
    name: "path",
    kind: FieldKind::Text,
    required_on_create: true,
    writable_on_update: false,
    description: "Path of the same file on this device.",
}];

fn cli_locate(
    conn: &Connection,
    id: &str,
    _title: Option<&str>,
    fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    let path = crate::db::schema::require_str(fields, "path")?;
    let facts = locate_on_device(conn, id, &crate::db::device::current(), Path::new(&path))?;
    crate::error::to_json(facts)
}

fn cli_check(
    conn: &Connection,
    id: &str,
    _title: Option<&str>,
    _fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    let status = check_without_moodle(conn, id, &crate::db::device::current())?;
    crate::error::to_json(status)
}

macro_rules! reference_actions {
    ($($entity_type:literal),*) => {
        $(
            inventory::submit! {
                crate::db::schema::EntityActionDef {
                    entity_type: $entity_type,
                    name: "locate",
                    description: "Tells Nookly where the same file is on this device (only this \
                                  device's path changes). Use it when the file moved, or came from \
                                  another device.",
                    fields: LOCATE_FIELDS,
                    run: cli_locate,
                }
            }
            inventory::submit! {
                crate::db::schema::EntityActionDef {
                    entity_type: $entity_type,
                    name: "check",
                    description: "Looks at the target now and returns its state: available, \
                                  offline, missing, needsSignIn or notOnThisDevice. A Moodle \
                                  reference can only be checked inside the app.",
                    fields: &[],
                    run: cli_check,
                }
            }
        )*
    };
}
reference_actions!("reference", "file");

#[cfg(test)]
mod tests;
