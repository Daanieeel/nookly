import { type ActiveFilter, matchesFilters } from "#/components/filter-menu.tsx";
import type { Entity, Relationship } from "#/lib/api/types.ts";
import { passesConditions } from "./conditions.ts";
import type { SortRule, ViewCondition, ViewField, ViewScope, ViewSource } from "./types.ts";

/// Running a view over a source's items: scope, option filters, conditions, then sort. All
/// of it runs on the items already in memory (see the decisions log on why not in Rust).

/// Keeps the items linked to `anchorId` through the scope's relationship, in its direction.
export function scopeItems<T>(
  items: T[],
  entityOf: (item: T) => Entity,
  scope: ViewScope,
  anchorId: string,
  edges: Relationship[],
): T[] {
  const linked = new Set<string>();
  for (const edge of edges) {
    if (edge.relationshipType !== scope.relationship) continue;
    if (scope.direction !== "incoming" && edge.toEntityId === anchorId) {
      linked.add(edge.fromEntityId);
    }
    if (scope.direction !== "outgoing" && edge.fromEntityId === anchorId) {
      linked.add(edge.toEntityId);
    }
  }
  return items.filter((item) => linked.has(entityOf(item).id));
}

/// `scopeItems`, plus the items whose field read from the scope's relationship holds the
/// page: a link the field follows further than one edge, like a Note's Course through its
/// Session.
function inScope<T, C>(
  source: ViewSource<T, C>,
  items: T[],
  ctx: C,
  scope: ViewScope,
  anchorId: string,
  edges: Relationship[],
): T[] {
  const linked = new Set(scopeItems(items, source.entityOf, scope, anchorId, edges));
  const field = source.fields.find((f) => f.relationship === scope.relationship);
  if (!field) return items.filter((item) => linked.has(item));
  return items.filter((item) => {
    if (linked.has(item)) return true;
    const value = field.value(item, ctx);
    return Array.isArray(value) ? value.includes(anchorId) : value === anchorId;
  });
}

/// "is" keeps an item having any chosen value, "is not" one having none of them.
function passesOptionFilters<T, C>(
  item: T,
  filters: ActiveFilter[],
  filterValue: (item: T, fieldId: string, ctx: C) => string | string[],
  ctx: C,
): boolean {
  return matchesFilters(filters, (f) => {
    const value = filterValue(item, f.fieldId, ctx);
    const hit = Array.isArray(value)
      ? value.some((v) => f.values.includes(v))
      : f.values.includes(value);
    return f.operator === "is" ? hit : !hit;
  });
}

type Comparable = string | number | null;

function comparableOf<T, C>(field: ViewField<T, C>, item: T, ctx: C): Comparable {
  if (field.sortValue) return field.sortValue(item, ctx);
  if (field.text) {
    const text = field.text(item, ctx);
    return text === "" ? null : text;
  }
  const value = field.value(item, ctx);
  if (Array.isArray(value)) return value.length > 0 ? value.join(" ") : null;
  return value === "" ? null : value;
}

function isNumber(value: Comparable): value is number {
  return typeof value === "number";
}

function compare(a: Comparable, b: Comparable): number {
  if (isNumber(a) && isNumber(b)) return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
}

/// Sorts by each rule in turn. Empty values sink to the bottom whichever way a rule
/// runs, and ties keep the order the items came in. A rule on an unknown field is skipped.
export function sortItems<T, C>(
  items: T[],
  sort: SortRule[],
  fields: ViewField<T, C>[],
  ctx: C,
): T[] {
  const rules = sort.flatMap((rule) => {
    const field = fields.find((f) => f.id === rule.field);
    return field ? [{ field, sign: rule.direction === "desc" ? -1 : 1 }] : [];
  });
  if (rules.length === 0) return items;
  const keyed = items.map((item, index) => ({
    item,
    index,
    keys: rules.map((r) => comparableOf(r.field, item, ctx)),
  }));
  keyed.sort((a, b) => {
    for (let i = 0; i < rules.length; i++) {
      const x = a.keys[i] ?? null;
      const y = b.keys[i] ?? null;
      if (x === null && y === null) continue;
      if (x === null) return 1;
      if (y === null) return -1;
      const order = compare(x, y) * (rules[i]?.sign ?? 1);
      if (order !== 0) return order;
    }
    return a.index - b.index;
  });
  return keyed.map((k) => k.item);
}

/// What a view is run with.
export interface ViewQuery {
  filters: ActiveFilter[];
  conditions: ViewCondition[];
  sort: SortRule[];
  /// Applied only with an `anchorId`, the page the view is shown in, and its `edges`.
  scope?: ViewScope | null;
  anchorId?: string;
  edges?: Relationship[];
}

/// The items a view shows, in order: the source's own order, then the sort.
export function runView<T, C>(source: ViewSource<T, C>, items: T[], ctx: C, query: ViewQuery): T[] {
  const { scope, anchorId, edges } = query;
  const scoped =
    scope && anchorId ? inScope(source, items, ctx, scope, anchorId, edges ?? []) : items;
  const kept = scoped.filter(
    (item) =>
      passesOptionFilters(item, query.filters, source.filterValue, ctx) &&
      passesConditions(item, query.conditions, source.fields, ctx),
  );
  return sortItems(source.order(kept, ctx), query.sort, source.fields, ctx);
}
