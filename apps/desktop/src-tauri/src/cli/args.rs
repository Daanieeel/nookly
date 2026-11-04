//! Parsing of the command line into positionals, flags and fields.

use super::*;

// --- argv parsing -----------------------------------------------------------

/// Flags that never take a value, so `get NOT-1 --summary NOT-2` doesn't read
/// `NOT-2` as the value of `--summary`.
pub(super) const BOOL_FLAGS: &[&str] = &[
    "yes",
    "include-deleted",
    "summary",
    "dry-run",
    "regex",
    "case-sensitive",
];

pub(super) struct Args {
    pub(super) positional: Vec<String>,
    pub(super) flags: HashMap<String, String>,
    pub(super) bool_flags: std::collections::HashSet<String>,
    pub(super) fields: JsonMap,
    /// Raw `--attr name=value` arguments, in order; parsed by `Args::attrs`.
    pub(super) attrs: Vec<String>,
    /// Names read off `flags`/`bool_flags` so far, via `flag`/`has_bool` (every
    /// other accessor goes through one of those two). `check_no_unknown_flags`
    /// diffs this against what was actually passed, so a typo'd flag — like
    /// `--labels` instead of `--label` — errors instead of being silently
    /// parsed and then never consulted by anything.
    pub(super) consumed: std::cell::RefCell<std::collections::HashSet<String>>,
}

pub(super) fn parse_args(argv: &[String]) -> AppResult<Args> {
    let mut positional = Vec::new();
    let mut flags = HashMap::new();
    let mut bool_flags = std::collections::HashSet::new();
    let mut fields = JsonMap::new();
    let mut attrs = Vec::new();

    let mut i = 0;
    while i < argv.len() {
        let arg = &argv[i];
        if let Some(rest) = arg.strip_prefix("--") {
            if rest == "field" {
                let (k, v) = argv
                    .get(i + 1)
                    .and_then(|kv| kv.split_once('='))
                    .ok_or_else(|| {
                        AppError::InvalidInput(
                            "--field needs a name=value pair, like --field dueDate=2026-01-05"
                                .into(),
                        )
                    })?;
                if fields.insert(k.to_string(), parse_field_value(v)).is_some() {
                    return Err(repeated(&format!("--field {k}")));
                }
                i += 2;
                continue;
            }
            if rest == "attr" {
                attrs.extend(argv.get(i + 1).cloned());
                i += 2;
                continue;
            }
            if let Some((key, value)) = rest.split_once('=') {
                if flags.insert(key.to_string(), value.to_string()).is_some() {
                    return Err(repeated(&format!("--{key}")));
                }
                i += 1;
                continue;
            }
            let takes_value = !BOOL_FLAGS.contains(&rest)
                && argv
                    .get(i + 1)
                    .map(|next| !next.starts_with("--"))
                    .unwrap_or(false);
            if takes_value {
                if flags
                    .insert(rest.to_string(), argv[i + 1].clone())
                    .is_some()
                {
                    return Err(repeated(&format!("--{rest}")));
                }
                i += 2;
            } else {
                bool_flags.insert(rest.to_string());
                i += 1;
            }
        } else {
            positional.push(arg.clone());
            i += 1;
        }
    }

    Ok(Args {
        positional,
        flags,
        bool_flags,
        fields,
        attrs,
        // `--dry-run` is read straight off argv by `dispatch`, before any
        // command-specific `Args` even exists, so no `flag`/`has_bool` call
        // ever consumes it here — pre-consuming it keeps it from tripping
        // `check_no_unknown_flags` on every single command.
        consumed: std::cell::RefCell::new(std::collections::HashSet::from(["dry-run".to_string()])),
    })
}

pub(super) fn repeated(what: &str) -> AppError {
    AppError::InvalidInput(format!("{what} was given more than once, pass it once"))
}

/// Parses `argv_tail`, runs `f` against it, and — only once `f` has succeeded —
/// checks that every `--flag` it passed actually got read by something. A
/// stray flag surfaces as an error rather than the command it named silently
/// doing nothing, even though the command itself already ran fine.
pub(super) fn run_command(
    argv_tail: &[String],
    f: impl FnOnce(&Args) -> AppResult<Value>,
) -> AppResult<Value> {
    let args = parse_args(argv_tail)?;
    let result = f(&args)?;
    args.check_no_unknown_flags()?;
    Ok(result)
}

/// `--field weight=0.3` / `cancelled=true` / `title="Quoted"` all parse as the
/// JSON value they look like; anything that isn't valid JSON is kept as a
/// plain string, so `--field startDate=2026-01-05` doesn't need quoting.
pub(super) fn parse_field_value(raw: &str) -> Value {
    serde_json::from_str(raw).unwrap_or_else(|_| Value::String(raw.to_string()))
}

impl Args {
    pub(super) fn require_positional(&self, index: usize, name: &str) -> AppResult<String> {
        self.positional
            .get(index)
            .cloned()
            .ok_or_else(|| AppError::InvalidInput(format!("missing required argument: <{name}>")))
    }

    /// An entity id positional, also accepting the entity's key (`TSK-14`).
    pub(super) fn require_entity(
        &self,
        conn: &Connection,
        index: usize,
        name: &str,
    ) -> AppResult<String> {
        crate::db::entities::resolve_entity_ref(conn, &self.require_positional(index, name)?)
    }

    pub(super) fn flag(&self, name: &str) -> Option<String> {
        self.consumed.borrow_mut().insert(name.to_string());
        self.flags.get(name).cloned()
    }

    pub(super) fn require_flag(&self, name: &str) -> AppResult<String> {
        self.flag(name)
            .ok_or_else(|| AppError::InvalidInput(format!("missing required flag: --{name}")))
    }

    /// Every `--attr name=value`; an empty value clears that attr on update.
    pub(super) fn attrs(&self) -> AppResult<crate::db::block_types::BlockAttrs> {
        self.attrs
            .iter()
            .map(|kv| {
                kv.split_once('=')
                    .map(|(k, v)| (k.trim().to_string(), v.to_string()))
                    .ok_or_else(|| {
                        AppError::InvalidInput(format!("--attr expects <name>=<value>, got '{kv}'"))
                    })
            })
            .collect()
    }

    pub(super) fn has_bool(&self, name: &str) -> bool {
        self.consumed.borrow_mut().insert(name.to_string());
        self.bool_flags.contains(name) || self.flags.get(name).map(|v| v == "true").unwrap_or(false)
    }

    /// Every `--flag`/`--bool-flag` the caller passed that nothing ever read via
    /// `flag`/`has_bool` — almost always a typo (`--labels` for `--label`,
    /// `--space-id` for `--space`) that would otherwise parse fine and then
    /// silently do nothing.
    pub(super) fn check_no_unknown_flags(&self) -> AppResult<()> {
        let consumed = self.consumed.borrow();
        let mut stray: Vec<&str> = self
            .flags
            .keys()
            .chain(self.bool_flags.iter())
            .map(String::as_str)
            .filter(|name| !consumed.contains(*name))
            .collect();
        if stray.is_empty() {
            return Ok(());
        }
        stray.sort_unstable();
        stray.dedup();
        Err(AppError::InvalidInput(format!(
            "unknown flag{} for this command: {}",
            if stray.len() == 1 { "" } else { "s" },
            stray
                .iter()
                .map(|f| format!("--{f}"))
                .collect::<Vec<_>>()
                .join(", "),
        )))
    }

    /// Comma separated `--fields a,b,c`, trimmed, empties dropped.
    pub(super) fn field_list(&self) -> Option<Vec<String>> {
        self.flag("fields").map(|raw| {
            raw.split(',')
                .map(str::trim)
                .filter(|f| !f.is_empty())
                .map(str::to_string)
                .collect()
        })
    }

    pub(super) fn usize_flag(&self, name: &str) -> AppResult<Option<usize>> {
        self.flag(name)
            .map(|v| {
                v.parse::<usize>().map_err(|_| {
                    AppError::InvalidInput(format!(
                        "--{name} expects a non negative integer, got '{v}'"
                    ))
                })
            })
            .transpose()
    }

    /// Every positional from `index` on, resolved from id or key.
    pub(super) fn entities_from(
        &self,
        conn: &Connection,
        index: usize,
        name: &str,
    ) -> AppResult<Vec<String>> {
        if self.positional.len() <= index {
            return Err(AppError::InvalidInput(format!(
                "missing required argument: <{name}>"
            )));
        }
        self.positional[index..]
            .iter()
            .map(|raw| crate::db::entities::resolve_entity_ref(conn, raw))
            .collect()
    }

    /// `--if-revision <rev>`: refuses the write unless `current` still matches.
    pub(super) fn check_revision(&self, current: &Value) -> AppResult<()> {
        let Some(expected) = self.flag("if-revision") else {
            return Ok(());
        };
        let actual = view::revision(current);
        if expected == actual {
            Ok(())
        } else {
            Err(AppError::Conflict(format!(
                "expected revision {expected} but the entity is now at {actual}; someone changed it since \
                 you read it. Re-read it (get / blocks), reapply your change, and retry with the new revision"
            )))
        }
    }

    pub(super) fn require_yes(&self) -> AppResult<()> {
        if self.has_bool("yes") || self.has_bool("dry-run") {
            Ok(())
        } else {
            Err(AppError::InvalidInput(
                "this is a mutating/destructive command, pass --yes to confirm (never prompts interactively)".into(),
            ))
        }
    }
}
