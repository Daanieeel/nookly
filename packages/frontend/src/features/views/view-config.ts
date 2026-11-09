import type { ActiveFilter, FilterJoin, FilterOperator } from "#/components/filter-menu.tsx";
import { type ViewModule, viewSourceOf } from "#/lib/api/views.ts";
import { readCondition } from "./engine/conditions.ts";
import { z } from "zod";
import {
  type ScopeDirection,
  type StoredEntry,
  VIEW_CONFIG_VERSION,
  storedEntry,
  type ViewCondition,
  type ViewScope,
} from "./engine/types.ts";

export { VIEW_CONFIG_VERSION };

/// What a saved View remembers of its page: the applied filters and the display
/// options (layout, grouping, hidden columns, table columns...). `D` is the module's own
/// `DisplayOptions`. `conditions` are the richer filters (date ranges, empty, contains,
/// number comparisons), stored in the same `filters` list as the option filters.
export interface ViewConfig<D> {
  filters: ActiveFilter[];
  conditions: ViewCondition[];
  display: D;
}

/// What a View config says about itself, which the page that opens it does not edit.
export interface ViewMeta {
  /// 1 for a config saved before configs had a version.
  version: number;
  /// The entity type shown. A View of a module page that stored none shows its module's.
  source: string | null;
  scope: ViewScope | null;
  /// Saved by a newer Nookly. It opens with what this one can read, and the backend
  /// refuses to save over it.
  newer: boolean;
}

const DIRECTIONS: ScopeDirection[] = ["outgoing", "incoming", "both"];

/// A stored config, checked key by key: a key that does not read falls back on its own,
/// and keys this version does not know are kept (`looseObject`) so a save can write them back.
const storedConfig = z.looseObject({
  version: z.number().int().positive().optional().catch(undefined),
  source: z.string().min(1).optional().catch(undefined),
  scope: z
    .object({ relationship: z.string().min(1), direction: z.enum(DIRECTIONS) })
    .optional()
    .catch(undefined),
  filters: z.array(storedEntry).optional().catch(undefined),
  display: z.looseObject({}).optional().catch(undefined),
});
type StoredConfig = z.infer<typeof storedConfig>;

const optionFilter = z.object({
  fieldId: z.string().min(1),
  operator: z.enum(["is", "isNot"] satisfies FilterOperator[]),
  values: z.array(z.json()),
  join: z.json().optional(),
});
const join = z.enum(["and", "or"] satisfies FilterJoin[]);
const text = z.string();

/// The stored JSON object, or an empty one when it is not one.
function readStored(raw: string | undefined): StoredConfig {
  if (!raw) return {};
  try {
    const parsed = storedConfig.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    // An unreadable config opens as the module's defaults.
    return {};
  }
}

function readFilter(entry: StoredEntry): ActiveFilter | null {
  const parsed = optionFilter.safeParse(entry);
  if (!parsed.success) return null;
  const { fieldId, operator, values } = parsed.data;
  const joined = join.safeParse(parsed.data.join);
  return {
    fieldId,
    operator,
    values: values.flatMap((v) => {
      const value = text.safeParse(v);
      return value.success ? [value.data] : [];
    }),
    ...(joined.success && { join: joined.data }),
  };
}

/// Reads a View's JSON back, checking every field like `readDisplay` does, so an
/// outdated or hand edited (CLI) config loses only what is invalid.
export function parseViewConfig<D>(
  raw: string,
  normalizeDisplay: (stored: Partial<D>) => D,
): ViewConfig<D> {
  const stored = readStored(raw);
  const filters = stored.filters ?? [];
  return {
    filters: filters.flatMap((f) => readFilter(f) ?? []),
    conditions: filters.flatMap((f) => readCondition(f) ?? []),
    // SAFETY: only a guess at the stored shape; `normalizeDisplay` checks every field
    // before use, so a stale one only loses that field.
    display: normalizeDisplay((stored.display ?? {}) as Partial<D>),
  };
}

export function parseViewMeta(raw: string, module?: ViewModule): ViewMeta {
  const stored = readStored(raw);
  const version = stored.version ?? 1;
  return {
    version,
    source: stored.source ?? (module ? viewSourceOf(module) : null),
    scope: stored.scope ?? null,
    newer: version > VIEW_CONFIG_VERSION,
  };
}

/// The conditions worth storing: one still being typed (a "contains" with no text yet)
/// matches everything and is left out.
export function completeConditions(conditions: ViewCondition[]): ViewCondition[] {
  return conditions.filter((c) => readCondition(c) !== null);
}

/// The config to store. Over a stored one (`previous`), whatever this version can not read
/// is kept as it was: unknown keys, filters it could not read and unknown display options,
/// so saving never drops what a newer Nookly or the CLI wrote.
export function serializeViewConfig<D>({
  filters,
  conditions = [],
  display,
  module,
  previous,
}: {
  filters: ActiveFilter[];
  conditions?: ViewCondition[];
  display: D;
  module?: ViewModule;
  previous?: string;
}): string {
  const stored = readStored(previous);
  const unread = (stored.filters ?? []).filter((f) => !readFilter(f) && !readCondition(f));
  const source = module ? viewSourceOf(module) : stored.source;
  return JSON.stringify({
    ...stored,
    version: VIEW_CONFIG_VERSION,
    ...(source !== undefined && { source }),
    filters: [...filters, ...completeConditions(conditions), ...unread],
    display: { ...stored.display, ...display },
  });
}

/// Whether the page differs from what the View saved.
export function sameViewConfig<D>(a: ViewConfig<D>, b: ViewConfig<D>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
