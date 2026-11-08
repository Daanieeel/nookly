//! What the editor keeps about a mind map beside its outline: where the user dragged nodes.
//! It lives in the block's `layout` attr, never in the outline text, so the markdown, the
//! CLI and every export read the outline alone.
//!
//! A node is kept by an id per outline line (`ids`, in line order), so editing the outline
//! does not lose a position. The editor follows its own edits with the same line diff (see
//! `features/notes/mindmap/positions.ts`, which this mirrors); an edit made from outside the
//! editor, like the CLI's, is followed here.

use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};

/// Past this many cells, the part of an outline that changed is not searched for the longest
/// run of lines it kept; edited lines are still paired up.
const MAX_SEARCH: usize = 1_000_000;

/// What a block's `layout` attr holds.
enum Stored {
    None,
    Known(Layout),
    /// Written by a version that knows more than this one: kept as it is, never read.
    Newer,
    Broken,
}

struct Layout {
    ids: Vec<String>,
    positions: Map<String, Value>,
}

fn is_offset(value: &Value) -> bool {
    ["x", "y"].iter().all(|axis| {
        value
            .get(axis)
            .and_then(Value::as_f64)
            .is_some_and(f64::is_finite)
    })
}

fn read(raw: &str) -> Stored {
    if raw.trim().is_empty() {
        return Stored::None;
    }
    let Ok(data) = serde_json::from_str::<Value>(raw) else {
        return Stored::Broken;
    };
    let Some(version) = data.get("v").and_then(Value::as_f64) else {
        return Stored::Broken;
    };
    if version != 1.0 {
        return Stored::Newer;
    }
    let ids: Option<Vec<String>> = data.get("ids").and_then(Value::as_array).and_then(|ids| {
        ids.iter()
            .map(|id| id.as_str().map(str::to_string))
            .collect()
    });
    let positions = data.get("positions").and_then(Value::as_object);
    match (ids, positions) {
        (Some(ids), Some(positions)) if positions.values().all(is_offset) => {
            Stored::Known(Layout {
                ids,
                positions: positions.clone(),
            })
        }
        _ => Stored::Broken,
    }
}

/// A short random id for an outline line.
pub fn new_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()[..6].to_string()
}

/// A new id that is not in `used`, which it is added to. A generator that keeps giving the
/// same id still ends: the id gets a number after it.
fn unused_id(used: &mut HashSet<String>, fresh: &mut dyn FnMut() -> String) -> String {
    let mut id = fresh();
    let mut tries = 0;
    while used.contains(&id) {
        id = if tries < 20 {
            fresh()
        } else {
            format!("{id}{}", used.len())
        };
        tries += 1;
    }
    used.insert(id.clone());
    id
}

/// The ids claimed so far for the lines of the new outline, and the old lines they came from.
struct Claims<'a> {
    ids: &'a [String],
    next: Vec<Option<String>>,
    taken: HashSet<usize>,
}

impl Claims<'_> {
    /// The new line `new` takes the id of the old line `old`.
    fn keep(&mut self, old: usize, new: usize) {
        self.next[new] = Some(self.ids[old].clone());
        self.taken.insert(old);
    }
}

/// The ids for the lines of `after`, from those of `before`. Unchanged lines and lines moved
/// elsewhere keep theirs; a line edited in place, between lines that stayed, keeps its id
/// too; every other new line gets a fresh one.
fn follow_lines(
    before: &[&str],
    after: &[&str],
    ids: &[String],
    fresh: &mut dyn FnMut() -> String,
) -> Vec<String> {
    let mut claims = Claims {
        ids,
        next: vec![None; after.len()],
        taken: HashSet::new(),
    };
    // Pairs of (old line, new line) that stayed in place, which edited lines are found between.
    let mut anchors: Vec<(usize, usize)> = Vec::new();

    let mut head = 0;
    while head < before.len() && head < after.len() && before[head] == after[head] {
        claims.keep(head, head);
        anchors.push((head, head));
        head += 1;
    }
    let mut tail = 0;
    while tail < before.len() - head
        && tail < after.len() - head
        && before[before.len() - 1 - tail] == after[after.len() - 1 - tail]
    {
        tail += 1;
    }
    for i in (0..tail).rev() {
        claims.keep(before.len() - 1 - i, after.len() - 1 - i);
    }

    // The longest run of lines kept in the middle.
    let old_middle = &before[head..before.len() - tail];
    let new_middle = &after[head..after.len() - tail];
    if old_middle.len() * new_middle.len() <= MAX_SEARCH {
        let width = new_middle.len() + 1;
        let mut table = vec![0u32; (old_middle.len() + 1) * width];
        for i in (0..old_middle.len()).rev() {
            for j in (0..new_middle.len()).rev() {
                table[i * width + j] = if old_middle[i] == new_middle[j] {
                    table[(i + 1) * width + j + 1] + 1
                } else {
                    table[(i + 1) * width + j].max(table[i * width + j + 1])
                };
            }
        }
        let (mut i, mut j) = (0, 0);
        while i < old_middle.len() && j < new_middle.len() {
            if old_middle[i] == new_middle[j] {
                claims.keep(head + i, head + j);
                anchors.push((head + i, head + j));
                i += 1;
                j += 1;
            } else if table[(i + 1) * width + j] >= table[i * width + j + 1] {
                i += 1;
            } else {
                j += 1;
            }
        }
    }
    for i in (0..tail).rev() {
        anchors.push((before.len() - 1 - i, after.len() - 1 - i));
    }

    // A line that moved: the same text, still unclaimed.
    let mut loose: HashMap<&str, std::collections::VecDeque<usize>> = HashMap::new();
    for (i, line) in before.iter().enumerate() {
        if !claims.taken.contains(&i) {
            loose.entry(line).or_default().push_back(i);
        }
    }
    for (j, line) in after.iter().enumerate() {
        if claims.next[j].is_some() {
            continue;
        }
        if let Some(from) = loose.get_mut(line).and_then(|queue| queue.pop_front()) {
            claims.keep(from, j);
        }
    }

    // A line edited in place: what is left between two lines that stayed, when as many lines
    // went as came.
    let mut bounds: Vec<(isize, isize)> = vec![(-1, -1)];
    bounds.extend(anchors.iter().map(|&(o, n)| (o as isize, n as isize)));
    bounds.push((before.len() as isize, after.len() as isize));
    for pair in bounds.windows(2) {
        let ((from_old, from_new), (to_old, to_new)) = (pair[0], pair[1]);
        let gone: Vec<usize> = ((from_old + 1)..to_old)
            .map(|i| i as usize)
            .filter(|i| !claims.taken.contains(i))
            .collect();
        let came: Vec<usize> = ((from_new + 1)..to_new)
            .map(|j| j as usize)
            .filter(|&j| claims.next[j].is_none())
            .collect();
        if gone.len() == came.len() {
            for (old, new) in gone.into_iter().zip(came) {
                claims.keep(old, new);
            }
        }
    }

    let mut used: HashSet<String> = claims.next.iter().flatten().cloned().collect();
    claims
        .next
        .into_iter()
        .map(|id| id.unwrap_or_else(|| unused_id(&mut used, fresh)))
        .collect()
}

/// The layout after the outline changed from `before` to `after`: each line keeps its id
/// through a line diff, and positions of lines that are gone are dropped. A layout that was
/// not made for `before` cannot be followed and is cleared (`""`); one written by a newer
/// version is left alone. A layout with no position left is dropped, since ids are only worth
/// keeping while they hold one.
pub fn reconcile(
    before: &str,
    after: &str,
    raw: &str,
    fresh: &mut dyn FnMut() -> String,
) -> String {
    let layout = match read(raw) {
        Stored::None | Stored::Newer => return raw.to_string(),
        _ if before == after => return raw.to_string(),
        Stored::Broken => return String::new(),
        Stored::Known(layout) => layout,
    };
    let old: Vec<&str> = before.split('\n').collect();
    if layout.ids.len() != old.len() {
        return String::new();
    }
    let new: Vec<&str> = after.split('\n').collect();
    let ids = follow_lines(&old, &new, &layout.ids, fresh);
    let alive: HashSet<&String> = ids.iter().collect();
    let positions: Map<String, Value> = layout
        .positions
        .into_iter()
        .filter(|(id, _)| alive.contains(id))
        .collect();
    if positions.is_empty() {
        return String::new();
    }
    json!({ "v": 1, "ids": ids, "positions": positions }).to_string()
}

#[cfg(test)]
mod tests;
