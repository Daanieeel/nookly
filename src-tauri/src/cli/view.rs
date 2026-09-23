//! Read-side shaping for CLI output: revisions, size hints, `--fields` projection,
//! `--summary` truncation, in-page `grep`, `--dry-run` diffs and `--since` parsing.
//! Everything here works on the generic JSON an `EntitySchemaDef` returns, so it
//! applies to every registered entity type with no per-module code.

use crate::db::notes::Block;
use crate::error::{AppError, AppResult};
use chrono::{DateTime, Duration, NaiveDate, Utc};
use regex::Regex;
use serde_json::{json, Map, Value};
use std::hash::{Hash, Hasher};

/// Strings longer than this are cut to an excerpt under `--summary`.
pub const SUMMARY_CHARS: usize = 280;

/// Longest line `grep` returns verbatim; longer ones become a window around the match.
const GREP_LINE_CHARS: usize = 240;

/// An opaque token that changes whenever an entity's `get` payload changes (for pages,
/// that includes every block, since the rendered body is part of the payload). Pass it
/// back as `--if-revision` to refuse a write when someone else changed the entity since.
pub fn revision(data: &Value) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    serde_json::to_string(data)
        .expect("JSON value always serializes")
        .hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

/// Rough cost of a payload: serialized length plus a ~4 chars/token estimate.
pub fn size_hint(chars: usize) -> Value {
    json!({ "chars": chars, "approxTokens": chars.div_ceil(4) })
}

pub fn serialized_len(value: &Value) -> usize {
    serde_json::to_string(value).map(|s| s.len()).unwrap_or(0)
}

/// Resolves `name` (or a dotted path like `entity.title`) against the places a field can
/// live in the generic payload shapes: top level, under `entity`, under `data`, or under
/// `data.entity`. First hit wins.
pub fn lookup<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
    let roots = [
        Some(value),
        value.get("entity"),
        value.get("data"),
        value.pointer("/data/entity"),
    ];
    roots
        .into_iter()
        .flatten()
        .find_map(|root| path.split('.').try_fold(root, |v, key| v.get(key)))
}

/// Keeps only the requested fields. `id` and `key` always ride along so a projected
/// row stays addressable. Unknown names come back as `null` and are listed under
/// `unknownFields` instead of failing the whole call.
pub fn project(value: &Value, fields: &[String]) -> Value {
    let mut out = Map::new();
    for always in ["id", "key"] {
        if let Some(v) = lookup(value, always) {
            out.insert(always.to_string(), v.clone());
        }
    }
    let mut unknown = Vec::new();
    for field in fields {
        match lookup(value, field) {
            Some(v) => {
                out.insert(field.clone(), v.clone());
            }
            None => {
                out.insert(field.clone(), Value::Null);
                unknown.push(field.clone());
            }
        }
    }
    if !unknown.is_empty() {
        out.insert("unknownFields".into(), json!(unknown));
    }
    Value::Object(out)
}

/// Cuts every string longer than `max` chars down to an excerpt, in place. Returns
/// `{path: {chars, approxTokens}}` for each string it cut, so the caller knows what a
/// full `get` would cost.
pub fn summarize(value: &mut Value, max: usize) -> Map<String, Value> {
    let mut truncated = Map::new();
    summarize_at(value, max, "", &mut truncated);
    truncated
}

fn summarize_at(value: &mut Value, max: usize, path: &str, truncated: &mut Map<String, Value>) {
    let child = |key: &str| {
        if path.is_empty() {
            key.to_string()
        } else {
            format!("{path}.{key}")
        }
    };
    match value {
        Value::String(s) => {
            let chars = s.chars().count();
            if chars > max {
                let excerpt: String = s.chars().take(max).collect();
                *s = format!("{excerpt}…");
                truncated.insert(path.to_string(), size_hint(chars));
            }
        }
        Value::Array(items) => {
            for (i, item) in items.iter_mut().enumerate() {
                summarize_at(item, max, &child(&i.to_string()), truncated);
            }
        }
        Value::Object(map) => {
            for (key, item) in map.iter_mut() {
                summarize_at(item, max, &child(key), truncated);
            }
        }
        _ => {}
    }
}

/// The heading blocks of a page, in order, so a summary shows its structure and gives
/// block ids to fetch sections with `blocks --offset/--limit` or `grep`.
pub fn outline(blocks: &[Block]) -> Vec<Value> {
    blocks
        .iter()
        .enumerate()
        .filter(|(_, b)| b.block_type.starts_with("heading"))
        .map(|(index, b)| {
            json!({ "blockId": b.id, "blockIndex": index, "type": b.block_type, "text": b.content })
        })
        .collect()
}

/// What the editor actually shows for a list block, so an agent can check rendering
/// without seeing the GUI. Mirrors `blockToNode` (`block-markdown.ts`): each list block
/// becomes its own list, one item per line, and a numbered list always starts at 1.
/// Adjacent list blocks are NOT joined, so `restartsAfterList` marks a block that
/// renders as a second list (numbering back at 1) right after one of the same type.
pub fn list_display(block: &Block, previous: Option<&Block>) -> Option<Value> {
    let numbered = match block.block_type.as_str() {
        "numbered_list" => true,
        "bulleted_list" => false,
        _ => return None,
    };
    let lines: Vec<&str> = if block.content.is_empty() {
        vec![""]
    } else {
        block.content.split('\n').collect()
    };
    let items: Vec<Value> = lines
        .iter()
        .enumerate()
        .map(|(i, text)| {
            let marker = if numbered {
                format!("{}.", i + 1)
            } else {
                "•".to_string()
            };
            json!({ "ordinal": i + 1, "marker": marker, "text": text })
        })
        .collect();
    let restarts = previous.is_some_and(|p| p.block_type == block.block_type);
    Some(json!({ "items": items, "restartsAfterList": restarts }))
}

/// Blocks as JSON, with `display` added to list blocks (see `list_display`).
pub fn blocks_json(blocks: &[Block]) -> Vec<Value> {
    blocks
        .iter()
        .enumerate()
        .map(|(i, block)| {
            let mut value = json!(block);
            if let Some(display) = list_display(block, i.checked_sub(1).map(|p| &blocks[p])) {
                value["display"] = display;
            }
            value
        })
        .collect()
}

/// Literal, case insensitive by default; `regex` switches to a regular expression.
pub fn build_pattern(pattern: &str, regex: bool, case_sensitive: bool) -> AppResult<Regex> {
    let body = if regex {
        pattern.to_string()
    } else {
        regex::escape(pattern)
    };
    let source = if case_sensitive {
        body
    } else {
        format!("(?i){body}")
    };
    Regex::new(&source).map_err(|e| AppError::InvalidInput(format!("invalid pattern: {e}")))
}

pub struct GrepResult {
    pub total: usize,
    pub items: Vec<Value>,
}

/// Line matches across a page's blocks, each with its block id/index and up to
/// `context` neighbouring lines from the same block. Stops collecting at `max`
/// but keeps counting, so `total` is always exact.
pub fn grep_blocks(blocks: &[Block], re: &Regex, context: usize, max: usize) -> GrepResult {
    let mut total = 0;
    let mut items = Vec::new();
    for (index, block) in blocks.iter().enumerate() {
        let lines: Vec<&str> = block.content.lines().collect();
        for (ln, line) in lines.iter().enumerate() {
            if !re.is_match(line) {
                continue;
            }
            total += 1;
            if items.len() >= max {
                continue;
            }
            let before: Vec<String> = lines[ln.saturating_sub(context)..ln]
                .iter()
                .map(|l| excerpt(l, None))
                .collect();
            let after: Vec<String> = lines[ln + 1..(ln + 1 + context).min(lines.len())]
                .iter()
                .map(|l| excerpt(l, None))
                .collect();
            let mut item = json!({
                "blockId": block.id,
                "blockIndex": index,
                "blockType": block.block_type,
                "line": ln + 1,
                "text": excerpt(line, Some(re)),
            });
            if context > 0 {
                item["before"] = json!(before);
                item["after"] = json!(after);
            }
            items.push(item);
        }
    }
    GrepResult { total, items }
}

/// A line as is when short, otherwise a window around the first match (or the start).
fn excerpt(line: &str, re: Option<&Regex>) -> String {
    let chars: Vec<(usize, char)> = line.char_indices().collect();
    if chars.len() <= GREP_LINE_CHARS {
        return line.to_string();
    }
    let match_byte = re
        .and_then(|re| re.find(line))
        .map(|m| m.start())
        .unwrap_or(0);
    let match_char = chars
        .iter()
        .position(|(b, _)| *b >= match_byte)
        .unwrap_or(0);
    let start = match_char.saturating_sub(GREP_LINE_CHARS / 3);
    let end = (start + GREP_LINE_CHARS).min(chars.len());
    let from = chars[start].0;
    let to = chars.get(end).map(|(b, _)| *b).unwrap_or(line.len());
    format!(
        "{}{}{}",
        if start > 0 { "…" } else { "" },
        &line[from..to],
        if end < chars.len() { "…" } else { "" }
    )
}

/// Every leaf that differs between two payloads. Multiline strings (a page body, a
/// code block) get a line diff instead of two full copies.
pub fn diff_values(before: &Value, after: &Value) -> Vec<Value> {
    let mut changes = Vec::new();
    diff_at(before, after, "", &mut changes);
    changes
}

fn diff_at(before: &Value, after: &Value, path: &str, changes: &mut Vec<Value>) {
    if before == after {
        return;
    }
    match (before, after) {
        (Value::Object(a), Value::Object(b)) => {
            let mut keys: Vec<&String> = a.keys().chain(b.keys()).collect();
            keys.sort();
            keys.dedup();
            for key in keys {
                let child = if path.is_empty() {
                    key.clone()
                } else {
                    format!("{path}.{key}")
                };
                diff_at(
                    a.get(key).unwrap_or(&Value::Null),
                    b.get(key).unwrap_or(&Value::Null),
                    &child,
                    changes,
                );
            }
        }
        (Value::String(a), Value::String(b)) if a.contains('\n') || b.contains('\n') => {
            changes.push(json!({ "path": path, "diff": line_diff(a, b) }));
        }
        _ => changes.push(json!({ "path": path, "before": before, "after": after })),
    }
}

/// Unified style line diff: `- ` removed, `+ ` added, `  ` context (2 lines around
/// each change), `@@` where unchanged lines were skipped.
pub fn line_diff(before: &str, after: &str) -> Vec<String> {
    const CONTEXT: usize = 2;
    let a: Vec<&str> = before.lines().collect();
    let b: Vec<&str> = after.lines().collect();

    let prefix = a.iter().zip(&b).take_while(|(x, y)| x == y).count();
    let suffix = a[prefix..]
        .iter()
        .rev()
        .zip(b[prefix..].iter().rev())
        .take_while(|(x, y)| x == y)
        .count();
    let (am, bm) = (&a[prefix..a.len() - suffix], &b[prefix..b.len() - suffix]);

    // LCS over the differing middle only.
    let (n, m) = (am.len(), bm.len());
    let mut lcs = vec![vec![0u32; m + 1]; n + 1];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            lcs[i][j] = if am[i] == bm[j] {
                lcs[i + 1][j + 1] + 1
            } else {
                lcs[i + 1][j].max(lcs[i][j + 1])
            };
        }
    }

    // (tag, line) for the whole document: ' ' same, '-' removed, '+' added.
    let mut ops: Vec<(char, &str)> = a[..prefix].iter().map(|l| (' ', *l)).collect();
    let (mut i, mut j) = (0, 0);
    while i < n || j < m {
        if i < n && j < m && am[i] == bm[j] {
            ops.push((' ', am[i]));
            i += 1;
            j += 1;
        } else if i < n && (j == m || lcs[i + 1][j] >= lcs[i][j + 1]) {
            ops.push(('-', am[i]));
            i += 1;
        } else {
            ops.push(('+', bm[j]));
            j += 1;
        }
    }
    ops.extend(a[a.len() - suffix..].iter().map(|l| (' ', *l)));

    let changed: Vec<usize> = ops
        .iter()
        .enumerate()
        .filter(|(_, (tag, _))| *tag != ' ')
        .map(|(k, _)| k)
        .collect();
    let keep = |k: usize| {
        changed
            .iter()
            .any(|&c| k + CONTEXT >= c && k <= c + CONTEXT)
    };
    let mut out = Vec::new();
    let mut skipped = false;
    for (k, (tag, line)) in ops.iter().enumerate() {
        if keep(k) {
            if skipped && !out.is_empty() {
                out.push("@@".to_string());
            }
            skipped = false;
            out.push(format!("{tag} {line}"));
        } else {
            skipped = true;
        }
    }
    out
}

/// `--since` accepts a relative age (`30m`, `24h`, `7d`), a date (`2026-09-20`) or a
/// full RFC 3339 timestamp.
pub fn parse_since(raw: &str) -> AppResult<DateTime<Utc>> {
    let raw = raw.trim();
    if let Some((digits, unit)) = raw.split_at_checked(raw.len().saturating_sub(1)) {
        if let Ok(amount) = digits.parse::<i64>() {
            let span = match unit {
                "m" => Some(Duration::minutes(amount)),
                "h" => Some(Duration::hours(amount)),
                "d" => Some(Duration::days(amount)),
                "w" => Some(Duration::weeks(amount)),
                _ => None,
            };
            if let Some(span) = span {
                return Ok(Utc::now() - span);
            }
        }
    }
    if let Ok(ts) = DateTime::parse_from_rfc3339(raw) {
        return Ok(ts.with_timezone(&Utc));
    }
    if let Ok(date) = NaiveDate::parse_from_str(raw, "%Y-%m-%d") {
        return Ok(date
            .and_hms_opt(0, 0, 0)
            .expect("midnight exists")
            .and_utc());
    }
    Err(AppError::InvalidInput(format!(
        "invalid --since '{raw}': use a relative age (30m, 24h, 7d, 2w), a date (2026-09-20) or an RFC 3339 timestamp"
    )))
}

pub fn parse_timestamp(raw: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(raw)
        .ok()
        .map(|ts| ts.with_timezone(&Utc))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn block(id: &str, block_type: &str, content: &str) -> Block {
        Block {
            id: id.into(),
            entity_id: "page".into(),
            position: 0,
            block_type: block_type.into(),
            content: content.into(),
            language: None,
            filename: None,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn list_display_numbers_lines_within_a_block_and_flags_restarts() {
        let blocks = [
            block("a", "numbered_list", "One\nTwo"),
            block("b", "numbered_list", "Three"),
            block("c", "paragraph", "x"),
        ];
        let json = blocks_json(&blocks);
        assert_eq!(json[0]["display"]["items"][1]["marker"], "2.");
        assert_eq!(json[0]["display"]["restartsAfterList"], false);
        assert_eq!(json[1]["display"]["items"][0]["marker"], "1.");
        assert_eq!(json[1]["display"]["restartsAfterList"], true);
        assert!(json[2].get("display").is_none());
    }

    #[test]
    fn line_diff_shows_changes_with_context() {
        let before = "a\nb\nc\nd\ne\nf\ng\nh\nj\nk";
        let after = "a\nb\nc\nD\ne\nf\ng\nh\nj\nk\ni";
        assert_eq!(
            line_diff(before, after),
            vec!["  b", "  c", "- d", "+ D", "  e", "  f", "@@", "  j", "  k", "+ i"]
        );
    }

    #[test]
    fn summarize_truncates_long_strings_only() {
        let mut value = json!({ "entity": { "title": "Short" }, "body": "x".repeat(400) });
        let truncated = summarize(&mut value, 10);
        assert_eq!(value["entity"]["title"], "Short");
        assert_eq!(value["body"], format!("{}…", "x".repeat(10)));
        assert_eq!(truncated["body"]["chars"], 400);
    }

    #[test]
    fn project_finds_fields_in_nested_shapes() {
        let value = json!({ "data": { "entity": { "id": "1", "key": "NOT-1", "title": "T" }, "body": "b" } });
        let projected = project(&value, &["title".into(), "body".into(), "nope".into()]);
        assert_eq!(
            projected,
            json!({ "id": "1", "key": "NOT-1", "title": "T", "body": "b", "nope": null, "unknownFields": ["nope"] })
        );
    }

    #[test]
    fn since_accepts_relative_dates_and_timestamps() {
        assert!(parse_since("24h").unwrap() < Utc::now());
        assert_eq!(
            parse_since("2026-09-20").unwrap().to_rfc3339(),
            "2026-09-20T00:00:00+00:00"
        );
        assert!(parse_since("2026-09-20T10:00:00+02:00").is_ok());
        assert!(parse_since("yesterday").is_err());
    }
}
