use serde::Serialize;

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("unknown relationship type: {0}")]
    UnknownRelationshipType(String),
    #[error("cardinality violation: {0}")]
    CardinalityViolation(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
    /// A write guarded by `--if-revision` found the entity changed since that revision.
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("database error: {0}")]
    Db(String),
    #[error("file error: {0}")]
    Io(String),
    /// An external calendar provider failed; the message is shown to the user as is.
    #[error("{0}")]
    Remote(String),
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError::Db(err.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

/// A value as JSON for the CLI and the generic entity commands. Every type passed
/// here is plain data that serializes, so the error is not expected; it is returned
/// rather than unwrapped so a surprise can never end the app.
pub fn to_json<T: Serialize>(value: T) -> AppResult<serde_json::Value> {
    serde_json::to_value(value).map_err(|e| AppError::InvalidInput(format!("not valid JSON: {e}")))
}

/// Like [`to_json`], as a compact JSON string.
pub fn to_json_string<T: Serialize + ?Sized>(value: &T) -> AppResult<String> {
    serde_json::to_string(value).map_err(|e| AppError::InvalidInput(format!("not valid JSON: {e}")))
}

/// A regex from a pattern written in the source. Used in statics, where the pattern
/// is a literal checked by the tests that run it, so it can never fail at runtime.
#[allow(clippy::expect_used)]
pub fn literal_regex(pattern: &str) -> regex::Regex {
    regex::Regex::new(pattern).expect("a regex literal in the source is valid")
}
