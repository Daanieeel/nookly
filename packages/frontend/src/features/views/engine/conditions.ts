import { z } from "zod";
import { toDay } from "#/features/tasks/task-model.ts";
import { includesFolded } from "#/lib/text-search.ts";
import type {
  ConditionOperator,
  StoredEntry,
  FieldKind,
  FieldValue,
  ViewCondition,
  ViewField,
} from "./types.ts";

/// The richer filters: empty checks, text search, date ranges and number comparisons.
/// Every condition must hold (they join with "and"), on top of the option filters.

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const isDay = (v: string | undefined) => v !== undefined && DAY.test(v);
const isNumber = (v: string | undefined) =>
  v !== undefined && v.trim() !== "" && Number.isFinite(Number(v));

/// Each operator and whether its values fit it.
const OPERATORS = {
  isEmpty: () => true,
  isNotEmpty: () => true,
  contains: (v: string[]) => v.length === 1 && !!v[0]?.trim(),
  notContains: (v: string[]) => v.length === 1 && !!v[0]?.trim(),
  before: (v: string[]) => v.length === 1 && isDay(v[0]),
  after: (v: string[]) => v.length === 1 && isDay(v[0]),
  between: (v: string[]) => v.length === 2 && isDay(v[0]) && isDay(v[1]),
  eq: (v: string[]) => v.length === 1 && isNumber(v[0]),
  lt: (v: string[]) => v.length === 1 && isNumber(v[0]),
  lte: (v: string[]) => v.length === 1 && isNumber(v[0]),
  gt: (v: string[]) => v.length === 1 && isNumber(v[0]),
  gte: (v: string[]) => v.length === 1 && isNumber(v[0]),
} satisfies Record<ConditionOperator, (values: string[]) => boolean>;

const storedCondition = z.object({
  fieldId: z.string().min(1),
  operator: z.enum([
    "isEmpty",
    "isNotEmpty",
    "contains",
    "notContains",
    "before",
    "after",
    "between",
    "eq",
    "lt",
    "lte",
    "gt",
    "gte",
  ] satisfies ConditionOperator[]),
  values: z.array(z.string()),
});

/// The operators a field of `kind` offers, in menu order.
export function operatorsFor(kind: FieldKind): ConditionOperator[] {
  const empty: ConditionOperator[] = ["isEmpty", "isNotEmpty"];
  if (kind === "date") return ["before", "after", "between", ...empty];
  if (kind === "number") return ["eq", "lt", "lte", "gt", "gte", ...empty];
  return ["contains", "notContains", ...empty];
}

/// A stored condition, or `null` when its operator is unknown or its values do not fit.
export function readCondition(stored: StoredEntry | ViewCondition): ViewCondition | null {
  const parsed = storedCondition.safeParse(stored);
  if (!parsed.success) return null;
  const { fieldId, operator, values } = parsed.data;
  if (!OPERATORS[operator](values)) return null;
  // The empty checks compare with nothing.
  const kept = operator === "isEmpty" || operator === "isNotEmpty" ? [] : values;
  return { fieldId, operator, values: kept };
}

function isEmptyValue(value: FieldValue): boolean {
  return value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function isText(value: FieldValue): value is string {
  return typeof value === "string";
}

function isNumeric(value: FieldValue): value is number {
  return typeof value === "number";
}

/// A day or timestamp as the local day it falls on, so "before Nov 9" means the same in
/// every timezone.
function dayOf(value: FieldValue): string | null {
  if (!isText(value) || !value) return null;
  if (DAY.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : toDay(date);
}

function textOf<T, C>(field: ViewField<T, C>, item: T, ctx: C, value: FieldValue): string {
  if (field.text) return field.text(item, ctx);
  if (Array.isArray(value)) return value.join(" ");
  return value === null ? "" : String(value);
}

export function matchesCondition<T, C>(
  field: ViewField<T, C>,
  condition: ViewCondition,
  item: T,
  ctx: C,
): boolean {
  const value = field.value(item, ctx);
  const [first = "", second = ""] = condition.values;
  switch (condition.operator) {
    case "isEmpty":
      return isEmptyValue(value);
    case "isNotEmpty":
      return !isEmptyValue(value);
    case "contains":
      return includesFolded(textOf(field, item, ctx, value), first.trim());
    case "notContains":
      return !includesFolded(textOf(field, item, ctx, value), first.trim());
    case "before": {
      const day = dayOf(value);
      return day !== null && day < first;
    }
    case "after": {
      const day = dayOf(value);
      return day !== null && day > first;
    }
    case "between": {
      const day = dayOf(value);
      const [from, to] = first <= second ? [first, second] : [second, first];
      return day !== null && day >= from && day <= to;
    }
    default: {
      if (!isNumeric(value)) return false;
      const n = Number(first);
      if (condition.operator === "eq") return value === n;
      if (condition.operator === "lt") return value < n;
      if (condition.operator === "lte") return value <= n;
      if (condition.operator === "gt") return value > n;
      return value >= n;
    }
  }
}

/// Whether an item passes every condition. A condition on a field the source does not have
/// is skipped, so a View keeps working when a field goes away.
export function passesConditions<T, C>(
  item: T,
  conditions: ViewCondition[],
  fields: ViewField<T, C>[],
  ctx: C,
): boolean {
  return conditions.every((condition) => {
    const field = fields.find((f) => f.id === condition.fieldId);
    return !field || matchesCondition(field, condition, item, ctx);
  });
}
