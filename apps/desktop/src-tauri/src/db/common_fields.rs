//! `FieldDef`s shared by more than one entity schema.

use crate::db::schema::{FieldDef, FieldKind};

pub const FIELD_LOCATION: FieldDef = FieldDef {
    name: "location",
    kind: FieldKind::Text,
    required_on_create: false,
    writable_on_update: true,
    description: "Optional free-text location.",
};

pub const FIELD_DATE: FieldDef = FieldDef {
    name: "date",
    kind: FieldKind::Date,
    required_on_create: true,
    writable_on_update: true,
    description: "ISO date this occurrence falls on.",
};

pub const FIELD_CANCELLED: FieldDef = FieldDef {
    name: "cancelled",
    kind: FieldKind::Boolean,
    required_on_create: false,
    writable_on_update: true,
    description: "Mark this occurrence cancelled without deleting it.",
};
