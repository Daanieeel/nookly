//! The Files a Nookly file carries along: a block that shows a File (an image, a video, a
//! sound or any file) travels with the bytes of that File inside the JSON, base64 encoded,
//! so the reader sees the picture and not a paragraph with its name.
//!
//! Shared by every format whose blocks can point at a File (`nookly-page`, `nookly-task`,
//! `nookly-assignment` and `nookly-deck`, from version 2 on). The bytes of a File are
//! written once however many blocks show it, and the blocks name them by a key of the file
//! (`[cell.png](mention:file1)`). Import stores them as new Files in the chosen Space and
//! points the blocks at those, all or nothing: if anything fails the Files already written
//! are removed again.
//!
//! A File that is missing or unreadable, or a path on this computer, cannot travel and the
//! block becomes a paragraph with its name, as in a page without files.

use crate::db::notes::{self, Block};
use crate::db::page_json::{block_from_json, export_block, BlockJson};
use crate::db::portable::{Exported, MAX_IMPORT_BYTES};
use crate::error::{AppError, AppResult};
use base64::Engine as _;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

/// Block types whose whole content is a mention of a File.
pub(crate) const FILE_BLOCKS: &[&str] = &["image", "video", "audio", "file"];

/// One File inside the document, named by `id` in the blocks that show it.
#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FileFile {
    pub id: String,
    pub name: String,
    /// The bytes of the file, base64.
    pub data: String,
}

/// `[name](mention:<file>)`: the whole content of a block that shows a File.
pub(crate) static FILE_MENTION: LazyLock<regex::Regex> =
    LazyLock::new(|| crate::error::literal_regex(r"^\[([^\]]*)\]\(mention:([a-zA-Z0-9-]+)\)$"));

/// The label and the id of the File a block shows, when it is a File block.
fn shown(block_type: &str, content: &str) -> Option<(String, String)> {
    if !FILE_BLOCKS.contains(&block_type) {
        return None;
    }
    FILE_MENTION
        .captures(content.trim())
        .map(|caps| (caps[1].to_string(), caps[2].to_string()))
}

/// The Files a document's blocks show, collected while exporting.
#[derive(Default)]
pub struct Embedded {
    /// File id to its key in the export, `None` for one that cannot travel.
    keys: HashMap<String, Option<String>>,
    files: Vec<FileFile>,
    /// What the files cannot travel with are called, once each.
    left_as_text: Vec<String>,
    /// The bytes read so far, to stop before a document grows past what can be imported.
    raw_bytes: u64,
}

impl Embedded {
    /// The key of the File `id` in the export, adding its bytes the first time. `None` when
    /// it is not a File of Nookly or its bytes cannot be read.
    fn embed(&mut self, conn: &Connection, id: &str) -> AppResult<Option<String>> {
        if let Some(known) = self.keys.get(id) {
            return Ok(known.clone());
        }
        let key = match self.read(conn, id)? {
            Some((name, bytes)) => {
                let key = format!("file{}", self.files.len() + 1);
                self.files.push(FileFile {
                    id: key.clone(),
                    name,
                    data: base64::engine::general_purpose::STANDARD.encode(bytes),
                });
                Some(key)
            }
            None => None,
        };
        self.keys.insert(id.to_string(), key.clone());
        Ok(key)
    }

    fn read(&mut self, conn: &Connection, id: &str) -> AppResult<Option<(String, Vec<u8>)>> {
        let Ok(file) = crate::db::files::get_file(conn, id) else {
            return Ok(None);
        };
        let Some(path) = file.local_path.or(file.source_path) else {
            return Ok(None);
        };
        // Base64 makes the bytes a third larger: stop before reading a File that cannot fit.
        let Ok(size) = std::fs::metadata(&path).map(|m| m.len()) else {
            return Ok(None);
        };
        if (self.raw_bytes + size).div_ceil(3) * 4 > MAX_IMPORT_BYTES {
            return Err(too_big());
        }
        let Ok(bytes) = std::fs::read(path) else {
            return Ok(None);
        };
        self.raw_bytes += bytes.len() as u64;
        let name = file
            .original_filename
            .as_deref()
            .and_then(crate::db::files::sanitize)
            .or_else(|| crate::db::files::sanitize(&file.entity.title))
            .unwrap_or_else(|| "file".into());
        Ok(Some((name, bytes)))
    }

    /// One block as it travels: a block that shows a File becomes one that shows the copy
    /// inside the export; everything else is exported like a page block.
    pub fn block(&mut self, conn: &Connection, block: &Block) -> AppResult<BlockJson> {
        if let Some((label, id)) = shown(&block.block_type, &block.content) {
            match self.embed(conn, &id)? {
                Some(key) => {
                    return Ok(BlockJson {
                        block_type: block.block_type.clone(),
                        content: format!("[{label}](mention:{key})"),
                        language: None,
                        filename: None,
                        attrs: crate::db::page_json::export_attrs(&block.attrs),
                    });
                }
                None => {
                    let name = if label.trim().is_empty() {
                        "a file".to_string()
                    } else {
                        label
                    };
                    if !self.left_as_text.contains(&name) {
                        self.left_as_text.push(name);
                    }
                }
            }
        }
        Ok(export_block(block))
    }

    /// `block` for a block stored outside a page (on a flashcard).
    pub fn json_block(&mut self, conn: &Connection, block: &BlockJson) -> AppResult<BlockJson> {
        self.block(conn, &block_from_json(block))
    }

    /// The blocks of any page-like entity (a note, a task, an assignment) as they travel.
    pub fn blocks(&mut self, conn: &Connection, entity_id: &str) -> AppResult<Vec<BlockJson>> {
        notes::list_blocks(conn, entity_id)?
            .iter()
            .map(|block| self.block(conn, block))
            .collect()
    }

    /// The finished document with the Files it holds, refused when it is more than
    /// Nookly can import again.
    pub fn finish<T: Serialize>(self, noun: &str, file: &T) -> AppResult<Exported> {
        let json = serde_json::to_string_pretty(file).map_err(|e| AppError::Io(e.to_string()))?;
        if json.len() as u64 > MAX_IMPORT_BYTES {
            return Err(too_big_for(noun));
        }
        Ok(Exported {
            json,
            left_as_text: self.left_as_text,
        })
    }

    /// The Files to write into the document.
    pub fn take_files(&mut self) -> Vec<FileFile> {
        std::mem::take(&mut self.files)
    }
}

fn too_big_for(noun: &str) -> AppError {
    AppError::InvalidInput(format!(
        "this {noun} with its files is over {} MB, more than Nookly can import again",
        MAX_IMPORT_BYTES / (1024 * 1024)
    ))
}

fn too_big() -> AppError {
    AppError::InvalidInput(format!(
        "its files are over {} MB together, more than Nookly can import again",
        MAX_IMPORT_BYTES / (1024 * 1024)
    ))
}

/// Where imported Files are stored: the app's own files folder, the same one the app and
/// the CLI import into.
pub fn files_dir() -> AppResult<PathBuf> {
    Ok(crate::db::standalone_app_data_dir()
        .map_err(|e| AppError::Db(e.to_string()))?
        .join("files"))
}

/// The keys of the Files that a block of `blocks` shows.
pub fn used_keys<'a>(blocks: impl IntoIterator<Item = &'a BlockJson>) -> HashSet<String> {
    blocks
        .into_iter()
        .filter_map(|b| shown(&b.block_type, &b.content).map(|(_, id)| id))
        .collect()
}

/// The new Files made on import: their id and name, by the key they had in the document.
pub struct Stored(HashMap<String, (String, String)>);

impl Stored {
    /// `blocks` with every File block pointed at the new File made for it. A block that
    /// shows a File the document does not hold refuses the import; `whose` says where it
    /// is ("block 3 of the task").
    pub fn point(
        &self,
        blocks: &[BlockJson],
        noun: &str,
        whose: &str,
    ) -> AppResult<Vec<BlockJson>> {
        blocks
            .iter()
            .map(|block| {
                let mut block = block.clone();
                if let Some((_, key)) = shown(&block.block_type, &block.content) {
                    let (id, name) = self.0.get(&key).ok_or_else(|| {
                        AppError::InvalidInput(format!(
                            "this {noun} file is not valid ({whose} shows a file it does not hold: {key})"
                        ))
                    })?;
                    block.content = format!("[{name}](mention:{id})");
                }
                Ok(block)
            })
            .collect()
    }
}

/// Runs `body` as one all-or-nothing import after storing the Files in `files`, the ones
/// whose key is in `used`, as new Files of `space_id` in `files_dir`. If anything fails
/// nothing is left behind, the written Files included.
pub fn import_with_files<T>(
    conn: &Connection,
    files_dir: &Path,
    space_id: &str,
    noun: &str,
    files: &[FileFile],
    used: &HashSet<String>,
    body: impl FnOnce(&Stored) -> AppResult<T>,
) -> AppResult<T> {
    let mut written: Vec<String> = Vec::new();
    let result = crate::db::atomically(conn, || {
        let stored = store(conn, files_dir, space_id, noun, files, used, &mut written)?;
        body(&stored)
    });
    if result.is_err() {
        for path in written {
            let _ = std::fs::remove_file(path);
        }
    }
    result
}

fn store(
    conn: &Connection,
    files_dir: &Path,
    space_id: &str,
    noun: &str,
    files: &[FileFile],
    used: &HashSet<String>,
    written: &mut Vec<String>,
) -> AppResult<Stored> {
    let mut stored = HashMap::new();
    for file in files.iter().filter(|f| used.contains(f.id.as_str())) {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(file.data.trim())
            .map_err(|_| {
                AppError::InvalidInput(format!(
                    "this {noun} file is not valid (the data of {} is not base64)",
                    file.name
                ))
            })?;
        let name = crate::db::files::sanitize(&file.name).unwrap_or_else(|| "file".into());
        let created = crate::db::files::store_file(
            conn,
            files_dir,
            space_id.to_string(),
            &name,
            &bytes,
            None,
        )?;
        written.extend(created.local_path);
        stored.insert(file.id.clone(), (created.entity.id, name));
    }
    Ok(Stored(stored))
}

/// A version 1 file has no Files: refuses one that holds some.
pub fn check_version(noun: &str, version: u32, files: &[FileFile]) -> AppResult<()> {
    if version == 1 && !files.is_empty() {
        return Err(AppError::InvalidInput(format!(
            "this {noun} file is not valid (a version 1 file cannot hold files)"
        )));
    }
    Ok(())
}

/// The line of the import preview that says how many Files come along.
pub fn files_fact(count: usize, noun: &str) -> Option<String> {
    match count {
        0 => None,
        1 => Some(format!("1 {noun} arrives as a new File")),
        n => Some(format!("{n} {noun}s arrive as new Files")),
    }
}
