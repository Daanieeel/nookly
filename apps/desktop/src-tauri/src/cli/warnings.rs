//! Hints added to a write that probably did not do what was meant.

use super::*;

/// Media blocks hold a mention, a link or the full path of a file. An empty value or one that
/// is none of those is refused with the reason; a path that cannot be reached right now is
/// not (see `unreachable_file_warning`).
pub(super) fn check_media_content(block_type: &str, content: &str) -> AppResult<()> {
    use crate::db::local_path::{media_target, MediaTarget};
    if !matches!(block_type, "file" | "image" | "video" | "audio") {
        return Ok(());
    }
    match media_target(content) {
        MediaTarget::Empty => Err(AppError::InvalidInput(format!(
            "the {block_type} block's content is empty: give the full path of a file \
             (like /Users/you/file.pdf), an http(s) URL, or a mention of a file"
        ))),
        MediaTarget::Invalid => Err(AppError::InvalidInput(format!(
            "'{}' is not the full path of a file on this computer, an http(s) URL or a mention \
             of a file: a path starts with / (or a drive letter like C:\\)",
            content.trim()
        ))),
        _ => Ok(()),
    }
}

/// The reason a media block's file is not there right now, in plain words, when it holds a
/// path. The path stays in the block as written either way.
pub(super) fn unreachable_file_warning(block: &crate::db::notes::Block) -> Option<String> {
    use crate::db::local_path::{inspect, media_target, MediaTarget, PathState};
    if !matches!(
        block.block_type.as_str(),
        "file" | "image" | "video" | "audio"
    ) {
        return None;
    }
    let MediaTarget::Path(path) = media_target(&block.content) else {
        return None;
    };
    let found = inspect(path);
    (found.state != PathState::Ok).then_some(format!(
        "{} The block keeps the path, and shows the file again once it can be reached.",
        found.message
    ))
}

/// Adds `warning` to a result, after any it already has.
pub(super) fn add_warning(result: &mut Value, warning: Option<String>) {
    let Some(warning) = warning else { return };
    result["warning"] = match result.get("warning").and_then(Value::as_str) {
        Some(existing) => json!(format!("{existing} {warning}")),
        None => json!(warning),
    };
}

/// Nudges an agent that just landed a `paragraph` block whose content still
/// looks like an unsplit markdown document — the recurring mistake this
/// exists to catch: `add-block`/`update-block` store `content` verbatim, with
/// no parsing, so `#`/`- `/`` ``` `` etc. inside a `paragraph` render as
/// literal text, not real headings/lists/code. There is no `--field body=...`
/// shortcut that parses structure for you (removed deliberately — it let
/// agents skip learning `add-block`/`update-block`, e.g. a `code` block made
/// this way had no way to get a `--language`/`--filename` header); the fix is
/// always one add-block/update-block call per element.
/// Never blocks the write; only attaches an advisory `warning` to the JSON
/// result. Silent when the page has no *other* blocks yet, since a single
/// plain-text paragraph page is a normal, intentional shape.
/// Flags when `db::notes::normalize_table_content` (called unconditionally inside
/// `create_block`/`update_block` for any `table` block) actually rewrote what was submitted —
/// i.e. the caller typed a markdown pipe table (`| a | b |` rows) instead of this app's real
/// tab-delimited format, and got a silent auto-correction instead of an error. Purely advisory,
/// same as `paragraph_mistake_warning`: the write already succeeded either way.
pub(super) fn table_normalize_warning(
    block: &crate::db::notes::Block,
    submitted_content: &str,
) -> Option<String> {
    if block.block_type != "table" || block.content == submitted_content {
        return None;
    }
    Some(
        "content looked like a markdown pipe table ('| a | b |' rows, optionally with a \
         '|---|---|' separator) and was auto-converted to this app's real table format: rows \
         separated by '\\n', cells within a row separated by a literal tab character, first row \
         the header, no separator row. Verify with `blocks <id>` or `get <id>`, if this wasn't \
         intended, resubmit with real tabs between cells."
            .to_string(),
    )
}

/// A list block holds the whole list, one item per line, and the editor numbers items
/// within that one block. Flags the two ways an agent gets this wrong: one block per
/// item (so every numbered item renders as its own "1."), and typing the `1. `/`- `
/// markers into the content (rendered on top of the real ones). Advisory only.
pub(super) fn list_mistake_warning(
    conn: &Connection,
    entity_type: &str,
    block: &crate::db::notes::Block,
) -> AppResult<Option<String>> {
    let marker = match block.block_type.as_str() {
        "numbered_list" => crate::error::literal_regex(r"^\s*\d+[.)]\s"),
        "bulleted_list" => crate::error::literal_regex(r"^\s*[-*+]\s"),
        _ => return Ok(None),
    };
    let blocks = crate::db::notes::list_blocks(conn, &block.entity_id)?;
    let index = blocks.iter().position(|b| b.id == block.id);
    let neighbour = index.and_then(|i| {
        [i.checked_sub(1), Some(i + 1)]
            .into_iter()
            .flatten()
            .filter_map(|j| blocks.get(j))
            .find(|b| b.block_type == block.block_type)
    });
    if let Some(neighbour) = neighbour {
        return Ok(Some(format!(
            "This '{kind}' block sits right next to another '{kind}' block ({other}). A list block \
             holds the WHOLE list, one item per line in --content, and items are numbered within \
             that one block; two adjacent list blocks render as two separate lists (a numbered \
             list restarts at 1). Merge them: `nookly cli {entity_type} update-block {other} \
             --content <all items joined by newlines>`, then `delete-block {this} --yes`.",
            kind = block.block_type,
            other = neighbour.id,
            this = block.id,
        )));
    }
    if block.content.lines().any(|line| marker.is_match(line)) {
        return Ok(Some(format!(
            "Some lines of this '{}' block start with a list marker ('1. ', '- ', ...). The editor \
             adds markers itself, so these render twice. Pass the bare item text, one item per line.",
            block.block_type
        )));
    }
    Ok(None)
}

pub(super) fn paragraph_mistake_warning(
    conn: &Connection,
    entity_type: &str,
    page_id: &str,
    block: &crate::db::notes::Block,
) -> AppResult<Option<String>> {
    if block.block_type != "paragraph" || !looks_like_unsplit_markdown(&block.content) {
        return Ok(None);
    }
    let total = crate::db::notes::list_blocks(conn, page_id)?.len();
    if total <= 1 {
        return Ok(None);
    }
    Ok(Some(format!(
        "This page has {total} blocks, and this paragraph's content still looks like a whole \
         unsplit markdown document (headings, lists, quotes, code fences, or several blank-line- \
         separated paragraphs). A 'paragraph' block renders its content as literal text, '#', \
         '- ', '> ', and ``` fences will NOT become real headings/lists/quotes/code. Issue one \
         add-block/update-block call per element instead, with the matching --type (run \
         `nookly cli describe {entity_type}` for knownBlockTypes), for a 'code' block, also set \
         --language/--filename for the editor's syntax-highlighted header."
    )))
}

/// A rough, deliberately over-inclusive heuristic (false positives just mean
/// an unnecessary warning, never a blocked write): any line that opens with a
/// heading/list/quote/fence marker, a blank-line paragraph break, or content
/// long enough that a human almost certainly meant more than one block.
pub(super) fn looks_like_unsplit_markdown(content: &str) -> bool {
    let has_structural_line = content.lines().any(|line| {
        let t = line.trim_start();
        t.starts_with("# ")
            || t.starts_with("## ")
            || t.starts_with("### ")
            || t.starts_with("> ")
            || t.starts_with("- ")
            || t.starts_with("* ")
            || t.starts_with("```")
    });
    has_structural_line || content.contains("\n\n") || content.len() > 500
}
