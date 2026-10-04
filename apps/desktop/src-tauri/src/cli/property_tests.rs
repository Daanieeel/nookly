//! Property based tests for the CLI's argument and field handling: random inputs,
//! checking rules that must hold for every one of them, not for hand picked cases.

use super::*;
use crate::db::schema::{EntitySchemaDef, FieldKind};
use proptest::prelude::*;

/// Any JSON value a `--field` could parse into.
fn any_value() -> impl Strategy<Value = Value> {
    let leaf = prop_oneof![
        Just(Value::Null),
        any::<bool>().prop_map(Value::Bool),
        any::<i64>().prop_map(|n| json!(n)),
        any::<f64>()
            .prop_filter("JSON has no NaN or infinity", |f| f.is_finite())
            .prop_map(|f| json!(f)),
        ".{0,24}".prop_map(Value::String),
    ];
    leaf.prop_recursive(2, 8, 3, |inner| {
        prop_oneof![
            prop::collection::vec(inner.clone(), 0..3).prop_map(Value::Array),
            prop::collection::hash_map("[a-z]{1,4}", inner, 0..3)
                .prop_map(|m| Value::Object(m.into_iter().collect())),
        ]
    })
}

fn defs() -> Vec<&'static EntitySchemaDef> {
    schema::all()
}

proptest! {
    /// Whatever text a `--field` carries, parsing it never panics, and a value that
    /// is valid JSON keeps its JSON meaning.
    #[test]
    fn parse_field_value_never_panics(raw in ".{0,40}") {
        let parsed = parse_field_value(&raw);
        if let Ok(json) = serde_json::from_str::<Value>(&raw) {
            prop_assert_eq!(parsed, json);
        } else {
            prop_assert_eq!(parsed, Value::String(raw));
        }
    }

    /// The argument parser answers every argv with a result and never panics.
    #[test]
    fn parse_args_never_panics(argv in prop::collection::vec("(--)?[a-z=]{0,8}", 0..8)) {
        let _ = parse_args(&argv);
    }

    /// For every field of every entity type and every value: `coerce_fields` either
    /// refuses with `InvalidInput` or hands back a value of the kind the field
    /// declares. It never panics and never lets a wrong shape through.
    #[test]
    fn coerce_fields_refuses_or_returns_the_declared_kind(
        which in 0usize..64,
        value in any_value(),
    ) {
        let defs = defs();
        let def = defs[which % defs.len()];
        for f in def.fields {
            let mut fields = JsonMap::new();
            fields.insert(f.name.to_string(), value.clone());
            match coerce_fields(def, &fields) {
                Err(AppError::InvalidInput(_)) => {}
                Err(other) => prop_assert!(false, "{}.{}: {other}", def.entity_type, f.name),
                Ok(out) => {
                    let got = &out[f.name];
                    let clears = got.is_null() || got == &Value::String(String::new());
                    let fits = match f.kind {
                        FieldKind::Text | FieldKind::LongText => {
                            got.is_string() || got.is_null()
                        }
                        FieldKind::Integer => clears || got.is_i64() || got.is_u64(),
                        FieldKind::Float => clears || got.is_number(),
                        FieldKind::Boolean => got.is_boolean() || got.is_null(),
                        FieldKind::Date | FieldKind::DateTime => clears || got.is_string(),
                        _ => true,
                    };
                    prop_assert!(fits, "{}.{} accepted {value} as {got}", def.entity_type, f.name);
                }
            }
        }
    }

    /// A field the caller did not send is never invented by coercion.
    #[test]
    fn coerce_fields_adds_nothing(which in 0usize..64) {
        let defs = defs();
        let def = defs[which % defs.len()];
        prop_assert!(coerce_fields(def, &JsonMap::new()).unwrap().is_empty());
    }
}
