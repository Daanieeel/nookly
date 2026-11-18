//! The sync engine's reads and writes, run as it sends them. Writes come as one
//! batch that runs in a single transaction: all of it lands, or none of it does.
//! A batch can carry guards, reads that must still give what the engine saw when
//! it planned the batch (a row's dirty version, say); when one no longer does, the
//! user changed something in between, so nothing is written and the engine plans
//! again from fresh reads. Nothing a user typed is ever overwritten that way.

use crate::error::{AppError, AppResult};
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Number, Value};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Statement {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<Value>,
    /// When set, this is a guard: the first column of the first row (null when
    /// there is none) must equal it.
    #[serde(default, deserialize_with = "present")]
    pub expect: Option<Value>,
}

/// Keeps an explicit `"expect": null` apart from a missing `expect`.
fn present<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Option<Value>, D::Error> {
    Value::deserialize(deserializer).map(Some)
}

impl Statement {
    #[cfg(test)]
    pub fn run(sql: &str, params: Vec<Value>) -> Self {
        Self {
            sql: sql.into(),
            params,
            expect: None,
        }
    }

    #[cfg(test)]
    pub fn guard(sql: &str, params: Vec<Value>, expect: Value) -> Self {
        Self {
            sql: sql.into(),
            params,
            expect: Some(expect),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "outcome", rename_all = "camelCase")]
pub enum BatchOutcome {
    Done,
    /// The guard at `index` no longer held; nothing was written.
    Stale {
        index: usize,
    },
}

fn to_sql(value: &Value) -> AppResult<SqlValue> {
    Ok(match value {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(i64::from(*b)),
        Value::Number(n) => match n.as_i64() {
            Some(i) => SqlValue::Integer(i),
            None => SqlValue::Real(n.as_f64().unwrap_or_default()),
        },
        Value::String(s) => SqlValue::Text(s.clone()),
        Value::Array(_) | Value::Object(_) => {
            return Err(AppError::InvalidInput(
                "sync parameters are plain values".into(),
            ))
        }
    })
}

fn to_json(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::Number(i.into()),
        ValueRef::Real(f) => Number::from_f64(f).map_or(Value::Null, Value::Number),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        // No synced column holds bytes; a blob reads as nothing rather than garbage.
        ValueRef::Blob(_) => Value::Null,
    }
}

fn params(values: &[Value]) -> AppResult<Vec<SqlValue>> {
    values.iter().map(to_sql).collect()
}

/// Every row `sql` returns, as an object of column name to value.
pub fn run_query(conn: &Connection, sql: &str, values: &[Value]) -> AppResult<Vec<Value>> {
    let mut stmt = conn.prepare(sql)?;
    let names: Vec<String> = stmt.column_names().iter().map(|n| n.to_string()).collect();
    let mut rows = stmt.query(params_from_iter(params(values)?))?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        let mut object = Map::new();
        for (i, name) in names.iter().enumerate() {
            object.insert(name.clone(), to_json(row.get_ref(i)?));
        }
        out.push(Value::Object(object));
    }
    Ok(out)
}

fn first_value(conn: &Connection, statement: &Statement) -> AppResult<Value> {
    let mut stmt = conn.prepare(&statement.sql)?;
    let mut rows = stmt.query(params_from_iter(params(&statement.params)?))?;
    Ok(match rows.next()? {
        Some(row) => to_json(row.get_ref(0)?),
        None => Value::Null,
    })
}

/// Runs `statements` in one transaction. An error or a stale guard rolls all of it back.
pub fn run_batch(conn: &mut Connection, statements: &[Statement]) -> AppResult<BatchOutcome> {
    let tx = conn.transaction()?;
    for (index, statement) in statements.iter().enumerate() {
        match &statement.expect {
            Some(expected) => {
                if first_value(&tx, statement)? != *expected {
                    // Dropping `tx` rolls back.
                    return Ok(BatchOutcome::Stale { index });
                }
            }
            None => {
                tx.execute(&statement.sql, params_from_iter(params(&statement.params)?))?;
            }
        }
    }
    tx.commit()?;
    Ok(BatchOutcome::Done)
}
