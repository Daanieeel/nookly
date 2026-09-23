//! Custom block types beyond the standard set (paragraph, headings, lists, code,
//! quote, table, image, embed), registered the same way entity schemas are.
//!
//! Each `BlockTypeDef` is the one place a custom block is declared: its content
//! format, its `attrs`, how its content is validated and how it serializes to
//! markdown. The CLI (`describe`, `add-block`, `update-block`) and the markdown
//! export both read this registry, so a new custom block needs no code outside
//! its own definition and its editor node.
//!
//! Custom blocks export as mdxcn's framed ASCII (`ascii_frame`): plain markdown has
//! no native form for a timeline or a progress bar, and a fenced figure keeps the
//! export complete and readable anywhere.

use crate::db::ascii_frame::{col_width, fence, frame, pad_end, pad_start, wrap_text};
use crate::db::notes::Block;
use crate::error::{AppError, AppResult};
use std::collections::{BTreeMap, HashMap};
use std::sync::OnceLock;

pub type BlockAttrs = BTreeMap<String, String>;

pub struct BlockAttrDef {
    pub name: &'static str,
    /// Allowed values; empty means free text.
    pub values: &'static [&'static str],
    pub description: &'static str,
}

pub struct BlockTypeDef {
    pub block_type: &'static str,
    /// The `content` string's format, shown by `describe`.
    pub content_format: &'static str,
    pub attrs: &'static [BlockAttrDef],
    /// Rejects content the editor could not display, with a message saying why.
    pub validate: fn(&str) -> Result<(), String>,
    pub to_markdown: fn(&Block) -> String,
}

inventory::collect!(BlockTypeDef);

fn registry() -> &'static HashMap<&'static str, &'static BlockTypeDef> {
    static REGISTRY: OnceLock<HashMap<&'static str, &'static BlockTypeDef>> = OnceLock::new();
    REGISTRY.get_or_init(|| {
        inventory::iter::<BlockTypeDef>()
            .map(|def| (def.block_type, def))
            .collect()
    })
}

pub fn lookup(block_type: &str) -> Option<&'static BlockTypeDef> {
    registry().get(block_type).copied()
}

/// Every custom block type, sorted by name for stable `describe` output.
pub fn all() -> Vec<&'static BlockTypeDef> {
    let mut defs: Vec<_> = registry().values().copied().collect();
    defs.sort_by_key(|def| def.block_type);
    defs
}

pub fn describe_attrs(def: &BlockTypeDef) -> serde_json::Value {
    def.attrs
        .iter()
        .map(|attr| {
            let mut value =
                serde_json::json!({ "name": attr.name, "description": attr.description });
            if !attr.values.is_empty() {
                value["values"] = serde_json::json!(attr.values);
            }
            value
        })
        .collect()
}

/// Checks `patch` (the attrs a caller asked to set) against `block_type`'s
/// declared attrs. An empty value clears the attr, so it's always accepted.
pub fn validate_attrs(block_type: &str, patch: &BlockAttrs) -> AppResult<()> {
    let declared = lookup(block_type).map_or(&[][..], |def| def.attrs);
    for (key, value) in patch {
        let Some(attr) = declared.iter().find(|a| a.name == key) else {
            let known: Vec<_> = declared.iter().map(|a| a.name).collect();
            return Err(AppError::InvalidInput(if known.is_empty() {
                format!("block type '{block_type}' takes no attrs, got '{key}'")
            } else {
                format!(
                    "block type '{block_type}' has no attr '{key}' (known: {})",
                    known.join(", ")
                )
            }));
        };
        if !value.is_empty() && !attr.values.is_empty() && !attr.values.contains(&value.as_str()) {
            return Err(AppError::InvalidInput(format!(
                "attr '{key}' on '{block_type}' must be one of {}, got '{value}'",
                attr.values.join(", ")
            )));
        }
    }
    Ok(())
}

/// Merges `patch` into `attrs` (empty values remove the key), then drops every key
/// `block_type` doesn't declare, which is what's left over after a retype.
pub fn merge_attrs(block_type: &str, attrs: &mut BlockAttrs, patch: BlockAttrs) {
    for (key, value) in patch {
        if value.is_empty() {
            attrs.remove(&key);
        } else {
            attrs.insert(key, value);
        }
    }
    let declared = lookup(block_type).map_or(&[][..], |def| def.attrs);
    attrs.retain(|key, _| declared.iter().any(|a| a.name == key));
}

pub fn validate_content(block_type: &str, content: &str) -> AppResult<()> {
    match lookup(block_type) {
        Some(def) => (def.validate)(content).map_err(|reason| {
            AppError::InvalidInput(format!("invalid '{block_type}' content: {reason}"))
        }),
        None => Ok(()),
    }
}

/// Inline markdown (`**bold**`, `*italic*`, `` `code` ``, links) as plain text for
/// a code fence, where markup would show literally. Mentions keep their title,
/// other links keep their url so the export loses nothing.
fn plain_inline(text: &str) -> String {
    static INLINE: OnceLock<regex::Regex> = OnceLock::new();
    let re = INLINE.get_or_init(|| {
        regex::Regex::new(r"\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*").unwrap()
    });
    re.replace_all(text, |caps: &regex::Captures| {
        if let (Some(label), Some(href)) = (caps.get(1), caps.get(2)) {
            if href.as_str().starts_with("mention:") {
                label.as_str().to_string()
            } else {
                format!("{} ({})", label.as_str(), href.as_str())
            }
        } else {
            caps.iter()
                .skip(3)
                .flatten()
                .next()
                .map_or(String::new(), |m| m.as_str().to_string())
        }
    })
    .into_owned()
}

fn title_of(block: &Block) -> Option<&str> {
    block.attrs.get("title").map(String::as_str)
}

fn non_empty_lines(content: &str) -> impl Iterator<Item = &str> {
    content.lines().filter(|line| !line.trim().is_empty())
}

fn accept_anything(_: &str) -> Result<(), String> {
    Ok(())
}

// --- callout ---------------------------------------------------------------

const CALLOUT_VARIANTS: &[&str] = &["note", "tip", "warning", "danger"];

fn callout_to_markdown(block: &Block) -> String {
    let variant = block.attrs.get("variant").map_or("note", String::as_str);
    let glyph = match variant {
        "tip" => "+",
        "warning" => "!",
        "danger" => "×",
        _ => "i",
    };
    let wrapped: Vec<String> = block
        .content
        .lines()
        .flat_map(|line| wrap_text(&plain_inline(line)))
        .collect();
    let lines: Vec<String> = if wrapped.is_empty() {
        vec![glyph.to_string()]
    } else {
        wrapped
            .iter()
            .enumerate()
            .map(|(i, line)| {
                if i == 0 {
                    format!("{glyph}  {line}")
                } else {
                    format!("   {line}")
                }
            })
            .collect()
    };
    fence(&frame(Some(variant), &lines))
}

inventory::submit! {
    BlockTypeDef {
        block_type: "callout",
        content_format: "One paragraph of inline text (**bold**, *italic*, `code`, [text](url)), like a paragraph block.",
        attrs: &[BlockAttrDef {
            name: "variant",
            values: CALLOUT_VARIANTS,
            description: "Tone and icon of the callout. Defaults to note.",
        }],
        validate: accept_anything,
        to_markdown: callout_to_markdown,
    }
}

// --- timeline --------------------------------------------------------------

const TIMELINE_STATES: &[&str] = &["done", "now", "next"];

struct TimelineEvent<'a> {
    date: &'a str,
    label: &'a str,
    state: &'a str,
}

fn parse_timeline(content: &str) -> Vec<TimelineEvent<'_>> {
    non_empty_lines(content)
        .map(|line| {
            let mut cells = line.split('\t');
            TimelineEvent {
                date: cells.next().unwrap_or("").trim(),
                label: cells.next().unwrap_or("").trim(),
                state: cells.next().unwrap_or("").trim(),
            }
        })
        .collect()
}

fn validate_timeline(content: &str) -> Result<(), String> {
    for (i, line) in non_empty_lines(content).enumerate() {
        let cells: Vec<&str> = line.split('\t').collect();
        if cells.len() > 3 {
            return Err(format!(
                "line {} has {} tab separated cells, expected date, label and an optional state",
                i + 1,
                cells.len()
            ));
        }
        let state = cells.get(2).map_or("", |s| s.trim());
        if !state.is_empty() && !TIMELINE_STATES.contains(&state) {
            return Err(format!(
                "line {} has state '{state}', expected one of {}",
                i + 1,
                TIMELINE_STATES.join(", ")
            ));
        }
    }
    Ok(())
}

fn timeline_to_markdown(block: &Block) -> String {
    let events = parse_timeline(&block.content);
    let dates = col_width(events.iter().map(|e| e.date));
    let mut lines = Vec::new();
    for (i, event) in events.iter().enumerate() {
        let mark = if event.state == "next" { "○" } else { "●" };
        lines.push(format!(
            "{mark}  {}  {}",
            pad_end(event.date, dates),
            plain_inline(event.label)
        ));
        if i + 1 < events.len() {
            lines.push("│".into());
        }
    }
    fence(&frame(title_of(block), &lines))
}

inventory::submit! {
    BlockTypeDef {
        block_type: "timeline",
        content_format: "One event per line: <date>\\t<label>[\\t<state>], cells separated by a literal tab. \
                         The date is free text (\"Mar 18\", \"Week 3\"). State is done, now or next and defaults to done.",
        attrs: &[BlockAttrDef {
            name: "title",
            values: &[],
            description: "Optional heading shown above the timeline.",
        }],
        validate: validate_timeline,
        to_markdown: timeline_to_markdown,
    }
}

// --- progress --------------------------------------------------------------

struct ProgressRow<'a> {
    label: &'a str,
    value: f64,
    goal: f64,
}

fn parse_progress_line(line: &str) -> Result<ProgressRow<'_>, String> {
    let cells: Vec<&str> = line.split('\t').collect();
    let [label, value, goal] = cells[..] else {
        return Err(format!(
            "expected <label>\\t<value>\\t<goal>, got {} tab separated cells",
            cells.len()
        ));
    };
    let number = |name: &str, text: &str| {
        text.trim()
            .parse::<f64>()
            .ok()
            .filter(|n| n.is_finite() && *n >= 0.0)
            .ok_or_else(|| format!("{name} '{}' is not a number >= 0", text.trim()))
    };
    let value = number("value", value)?;
    let goal = number("goal", goal)?;
    if goal == 0.0 {
        return Err("goal must be greater than 0".into());
    }
    Ok(ProgressRow {
        label: label.trim(),
        value,
        goal,
    })
}

fn validate_progress(content: &str) -> Result<(), String> {
    for (i, line) in non_empty_lines(content).enumerate() {
        parse_progress_line(line).map_err(|reason| format!("line {}: {reason}", i + 1))?;
    }
    Ok(())
}

/// Same shape as `Number.toLocaleString("en-US")` with at most one decimal.
fn format_number(n: f64) -> String {
    let rounded = (n * 10.0).round() / 10.0;
    let whole = rounded.trunc() as u64;
    let digits = whole.to_string();
    let mut grouped = String::new();
    for (i, digit) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            grouped.push(',');
        }
        grouped.push(digit);
    }
    let fraction = ((rounded - rounded.trunc()) * 10.0).round() as u64;
    if fraction == 0 {
        grouped
    } else {
        format!("{grouped}.{fraction}")
    }
}

/// mdxcn's bullet graph: a filled track with the goal marked by `|`.
fn progress_to_markdown(block: &Block) -> String {
    const TICKS: usize = 20;
    let rows: Vec<ProgressRow> = non_empty_lines(&block.content)
        .filter_map(|line| parse_progress_line(line).ok())
        .collect();
    let labels: Vec<String> = rows.iter().map(|r| plain_inline(r.label)).collect();
    let values: Vec<String> = rows
        .iter()
        .map(|r| format!("{} / {}", format_number(r.value), format_number(r.goal)))
        .collect();
    let label_width = col_width(labels.iter().map(String::as_str));
    let value_width = col_width(values.iter().map(String::as_str));
    let lines: Vec<String> = rows
        .iter()
        .enumerate()
        .map(|(i, row)| {
            let peak = row.value.max(row.goal).max(1.0);
            let ticks = TICKS as f64;
            let filled = ((row.value / peak) * ticks).round().min(ticks) as usize;
            let mark = ((row.goal / peak) * ticks).round().clamp(0.0, ticks - 1.0) as usize;
            let cells: String = (0..TICKS)
                .map(|cell| match cell {
                    c if c == mark => '|',
                    c if c < filled => '=',
                    _ => '-',
                })
                .collect();
            format!(
                "{}  [{cells}]  {}",
                pad_end(&labels[i], label_width),
                pad_start(&values[i], value_width)
            )
        })
        .collect();
    fence(&frame(title_of(block), &lines))
}

inventory::submit! {
    BlockTypeDef {
        block_type: "progress",
        content_format: "One tracked goal per line: <label>\\t<value>\\t<goal>, cells separated by a literal tab. \
                         Value and goal are numbers >= 0, goal greater than 0 (\"Chapters read\\t7\\t12\").",
        attrs: &[BlockAttrDef {
            name: "title",
            values: &[],
            description: "Optional heading shown above the progress rows.",
        }],
        validate: validate_progress,
        to_markdown: progress_to_markdown,
    }
}

// --- tree ------------------------------------------------------------------

struct TreeNode {
    label: String,
    children: Vec<TreeNode>,
}

/// Two leading spaces per level. A line indented deeper than one level below its
/// parent is treated as a direct child, the same as the editor shows it.
fn parse_tree(content: &str) -> Vec<TreeNode> {
    fn insert(nodes: &mut Vec<TreeNode>, depth: usize, label: String) {
        match nodes.last_mut() {
            Some(last) if depth > 0 => insert(&mut last.children, depth - 1, label),
            _ => nodes.push(TreeNode {
                label,
                children: Vec::new(),
            }),
        }
    }
    let mut roots = Vec::new();
    for line in non_empty_lines(content) {
        let indent = line.chars().take_while(|c| *c == ' ').count();
        insert(&mut roots, indent / 2, line.trim().to_string());
    }
    roots
}

/// mdxcn's `flattenTree`: a single root draws without a branch glyph and its
/// children start at the left edge.
fn flatten_tree(nodes: &[TreeNode], prefix: &str, is_root: bool, out: &mut Vec<String>) {
    let single_root = is_root && nodes.len() == 1;
    for (i, node) in nodes.iter().enumerate() {
        let last = i + 1 == nodes.len();
        let (branch, child_prefix) = if single_root {
            (String::new(), String::new())
        } else {
            (
                format!("{prefix}{}", if last { "└─ " } else { "├─ " }),
                format!("{prefix}{}", if last { "   " } else { "│  " }),
            )
        };
        out.push(format!("{branch}{}", plain_inline(&node.label)));
        flatten_tree(&node.children, &child_prefix, false, out);
    }
}

fn tree_to_markdown(block: &Block) -> String {
    let mut lines = Vec::new();
    flatten_tree(&parse_tree(&block.content), "", true, &mut lines);
    fence(&frame(title_of(block), &lines))
}

inventory::submit! {
    BlockTypeDef {
        block_type: "tree",
        content_format: "One node per line, nested by two leading spaces per level (\"src\\n  main.rs\\n  db\\n    notes.rs\"). \
                         For folders, outlines and org charts.",
        attrs: &[BlockAttrDef {
            name: "title",
            values: &[],
            description: "Optional heading shown above the tree.",
        }],
        validate: accept_anything,
        to_markdown: tree_to_markdown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn block(block_type: &str, content: &str, attrs: &[(&str, &str)]) -> Block {
        Block {
            id: "b".into(),
            entity_id: "e".into(),
            position: 0,
            block_type: block_type.into(),
            content: content.into(),
            language: None,
            filename: None,
            attrs: attrs
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn body(markdown: &str) -> Vec<String> {
        markdown
            .lines()
            .filter(|l| l.starts_with("| ") && l.trim_end_matches(['|', ' ']).len() > 1)
            .map(|l| l[2..l.len() - 1].trim_end().to_string())
            .collect()
    }

    #[test]
    fn timeline_matches_mdxcn_example() {
        let md = timeline_to_markdown(&block(
            "timeline",
            "Mar 12\tCLI copies the files\nMar 18\tDocs, live previews\tnow\nApr 02\tRegistry listed\tnext",
            &[("title", "Shipped")],
        ));
        assert_eq!(
            md,
            "```\n\
+------------------ [ SHIPPED ] -------------------+\n\
|                                                  |\n\
| ●  Mar 12  CLI copies the files                  |\n\
| │                                                |\n\
| ●  Mar 18  Docs, live previews                   |\n\
| │                                                |\n\
| ○  Apr 02  Registry listed                       |\n\
|                                                  |\n\
+--------------------------------------------------+\n\
```"
        );
    }

    #[test]
    fn callout_strips_inline_markup_but_keeps_links() {
        let md = callout_to_markdown(&block(
            "callout",
            "Read **this** and [Lecture](mention:abc) or [docs](https://x.dev)",
            &[("variant", "warning")],
        ));
        assert!(md.contains("[ WARNING ]"));
        assert_eq!(
            body(&md),
            vec!["!  Read this and Lecture or docs (https://x.dev)"]
        );
    }

    #[test]
    fn progress_draws_a_track_with_the_goal_marked() {
        let md = progress_to_markdown(&block(
            "progress",
            "Chapters\t7\t12\nExercises\t1500\t1000",
            &[],
        ));
        assert_eq!(
            body(&md),
            vec![
                "Chapters   [============-------|]         7 / 12",
                "Exercises  [=============|======]  1,500 / 1,000",
            ]
        );
    }

    #[test]
    fn tree_draws_branches_under_a_single_root() {
        let md = tree_to_markdown(&block("tree", "src\n  db\n    notes.rs\n  main.rs", &[]));
        assert_eq!(
            body(&md),
            vec!["src", "├─ db", "│  └─ notes.rs", "└─ main.rs"]
        );
    }

    #[test]
    fn content_and_attrs_are_validated() {
        assert!(validate_content("progress", "Pages\t3\t10").is_ok());
        assert!(validate_content("progress", "Pages\tthree\t10").is_err());
        assert!(validate_content("progress", "Pages\t3\t0").is_err());
        assert!(validate_content("timeline", "Mon\tStart\tlater").is_err());
        assert!(validate_content("paragraph", "anything").is_ok());

        let attrs = |k: &str, v: &str| BlockAttrs::from([(k.to_string(), v.to_string())]);
        assert!(validate_attrs("callout", &attrs("variant", "tip")).is_ok());
        assert!(validate_attrs("callout", &attrs("variant", "loud")).is_err());
        assert!(validate_attrs("callout", &attrs("title", "x")).is_err());
        assert!(validate_attrs("paragraph", &attrs("title", "x")).is_err());
    }

    #[test]
    fn merge_attrs_clears_empty_values_and_drops_undeclared_keys() {
        let mut attrs = BlockAttrs::from([("title".to_string(), "Plan".to_string())]);
        merge_attrs("callout", &mut attrs, BlockAttrs::new());
        assert!(attrs.is_empty());

        let mut attrs = BlockAttrs::from([("title".to_string(), "Plan".to_string())]);
        merge_attrs(
            "tree",
            &mut attrs,
            BlockAttrs::from([("title".to_string(), String::new())]),
        );
        assert!(attrs.is_empty());
    }
}
