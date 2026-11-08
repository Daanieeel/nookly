import type { Icon as TablerIcon } from "@tabler/icons-react";
import { z } from "zod";
import type { ReactNode } from "react";
import type { FilterField } from "#/components/filter-menu.tsx";
import type { Entity } from "#/lib/api/types.ts";

/// The view engine: one way to show the items of one entity type, filtered, sorted and
/// laid out, either on a module page (Tasks, Assignments) or scoped to a page. See
/// `docs/06-decisions-log.md#one-view-engine-for-every-entity-type`.

/// What `version` a View config is written with. Bump it, and teach `parseViewConfig` to
/// read the previous one, whenever the meaning of a stored field changes. Mirrors
/// `VIEW_CONFIG_VERSION` in `src-tauri/src/db/views.rs`.
export const VIEW_CONFIG_VERSION = 2;

export type ViewLayout = "list" | "board" | "table";

/// The filters beyond picking options (`is`, `isNot`), kept in the same stored `filters`
/// list. `values` holds what the operator compares with: nothing for the empty checks,
/// one text, one day (`YYYY-MM-DD`) or one number, or two days for `between`.
export type ConditionOperator =
  | "isEmpty"
  | "isNotEmpty"
  | "contains"
  | "notContains"
  | "before"
  | "after"
  | "between"
  | "eq"
  | "lt"
  | "lte"
  | "gt"
  | "gte";

/// One entry of a stored `filters` list, before it is read: anything a hand edited config
/// or a newer Nookly may have written there.
export type StoredEntry = z.infer<typeof storedEntry>;
export const storedEntry = z.json();

export interface ViewCondition {
  fieldId: string;
  operator: ConditionOperator;
  values: string[];
}

export type SortDirection = "asc" | "desc";

export interface SortRule {
  field: string;
  direction: SortDirection;
}

/// One shown table column, in order. Without a width it sizes to its content.
export interface ColumnSetting {
  field: string;
  width?: number;
}

/// What the table layout remembers. Empty lists mean the source's defaults: its own order
/// (or the page's ordering) and its default columns.
export interface TableDisplay {
  sort: SortRule[];
  columns: ColumnSetting[];
}

/// Which way the relationship of a scope runs, seen from the item: `outgoing` when the
/// item links to the page (an Assignment's `assignment-course` to its Course), `incoming`
/// when the page links to the item, `both` for either.
export type ScopeDirection = "outgoing" | "incoming" | "both";

/// "Related to this page through `relationship`". The page itself is given where the View
/// is shown, never stored, so one config fits every Course.
export interface ViewScope {
  relationship: string;
  direction: ScopeDirection;
}

/// How a field's value reads and compares.
export type FieldKind = "text" | "number" | "date" | "enum" | "entity";

/// A field's value: text, a number, a day or timestamp (as text), an option id, or the ids
/// of the entities it points at. `null` (or an empty list) is empty.
export type FieldValue = string | number | string[] | null;

/// One column and condition field of a source. `C` is what the source loads next to its
/// items (statuses, the Course of each item, ...).
export interface ViewField<T, C> {
  id: string;
  label: string;
  kind: FieldKind;
  value: (item: T, ctx: C) => FieldValue;
  /// What `contains` searches and sorting compares for an `enum` or `entity` field, like
  /// a status's name or a Course's title. Defaults to the value as text.
  text?: (item: T, ctx: C) => string;
  /// What sorting compares, when it is not the value or text, like a status's position.
  sortValue?: (item: T, ctx: C) => string | number | null;
  /// The table cell. Defaults to `text`, or the value as text.
  cell?: (item: T, ctx: C) => ReactNode;
  /// A relationship this field is read from, like `assignment-course` for an Assignment's
  /// Course. Only documents where the value comes from.
  relationship?: string;
  /// A column that sizes to its content; the rest share the room left.
  fit?: boolean;
}

/// One entity type the engine can show. Registered in `engine/sources.ts`.
export interface ViewSource<T, C> {
  /// The entity type, like `task`.
  type: string;
  /// Plural, for headings: "Tasks".
  label: string;
  /// One item in a sentence: "task".
  itemLabel: string;
  icon: TablerIcon;
  entityOf: (item: T) => Entity;
  /// Loads the items of a Space (every Space for `null`) and what the fields read.
  useData: (spaceId: string | null) => { items: T[]; ctx: C; isPending: boolean };
  fields: ViewField<T, C>[];
  /// The option filters (`is`, `isNot`) and the value an item has under each.
  filterFields: (ctx: C, items: T[]) => FilterField[];
  filterValue: (item: T, fieldId: string, ctx: C) => string | string[];
  /// The order without a sort, as the module page shows it.
  order: (items: T[], ctx: C) => T[];
  /// The columns a table starts with.
  defaultColumns: string[];
}
