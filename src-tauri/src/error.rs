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
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError::Db(err.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
