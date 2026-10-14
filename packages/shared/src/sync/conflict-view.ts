import { decodePk, syncedTable } from "../schema.ts";
import type { SqlValue } from "../schema.ts";
import { clockWall } from "./hlc.ts";
import type { Conflict } from "./engine.ts";
import type { SqlDriver } from "./sql.ts";
import { ident, pkSql } from "./sql.ts";

/// What the merge editor shows for a conflict: the item, the field, the two
/// versions, and who made each, in words a person uses ("MacBook, 14:02"), never
/// in a version control's (DECISIONS.md D7).

/// A stretch of text and whether it differs from the other side.
export interface Segment {
  text: string;
  changed: boolean;
}

/// Splits into words and the whitespace between them, so joining gives the text back.
const TOKEN = /\s+|[^\s]+/g;
const tokens = (text: string) => text.match(TOKEN) ?? [];

/// Longest common subsequence of two token lists, by dynamic programming. Pages
/// are far smaller than the quadratic table's limit; past it, whole sides count as changed.
const MAX_TOKENS = 4000;

function commonTokens(a: string[], b: string[]): Set<string> | null {
  if (a.length * b.length > (MAX_TOKENS * MAX_TOKENS) / 4) return null;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] =
        a[i] === b[j]
          ? table[(i + 1) * cols + j + 1] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }
  // Positions in each list that belong to the common subsequence, as "i:j" pairs.
  const pairs = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.add(`${i}:${j}`);
      i++;
      j++;
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) i++;
    else j++;
  }
  return pairs;
}

function segments(list: string[], marks: boolean[]): Segment[] {
  const out: Segment[] = [];
  list.forEach((text, index) => {
    const changed = marks[index];
    const last = out.at(-1);
    if (last && last.changed === changed) last.text += text;
    else out.push({ text, changed });
  });
  return out;
}

/// Both sides of a text diff.
export interface WordDiff {
  left: Segment[];
  right: Segment[];
}

const isSpace = (token: string) => /^\s/.test(token);

/// Which tokens changed, comparing words only: a space counts as changed when the
/// words around it did, so "milk and" reads as one changed stretch.
function marksFor(list: string[], common: Set<number> | null): boolean[] {
  const words = list.map((token, index) => (isSpace(token) ? -1 : index)).filter((i) => i >= 0);
  const wordChanged = new Map(words.map((index, nth) => [index, common ? !common.has(nth) : true]));
  return list.map((token, index) => {
    if (!isSpace(token)) return wordChanged.get(index) ?? true;
    const before = words.filter((i) => i < index).at(-1);
    const after = words.find((i) => i > index);
    const prev = before === undefined ? undefined : wordChanged.get(before);
    const next = after === undefined ? undefined : wordChanged.get(after);
    return (prev ?? next ?? true) && (next ?? prev ?? true);
  });
}

/// The words each side added or changed relative to the other. Each side's
/// segments join back into exactly its own text.
export function diffWords(left: string, right: string): WordDiff {
  const a = tokens(left);
  const b = tokens(right);
  const wordsA = a.filter((t) => !isSpace(t));
  const wordsB = b.filter((t) => !isSpace(t));
  const pairs = commonTokens(wordsA, wordsB);
  const commonA = pairs ? new Set([...pairs].map((p) => Number(p.split(":")[0]))) : null;
  const commonB = pairs ? new Set([...pairs].map((p) => Number(p.split(":")[1]))) : null;
  return {
    left: segments(a, marksFor(a, commonA)),
    right: segments(b, marksFor(b, commonB)),
  };
}

export function isTextValue(value: SqlValue): value is string {
  return value !== null && !(typeof value === "number") && typeof value === "string";
}

/// Both versions in one text, to edit down by hand: the one showing now first, then
/// the other. A title joins with a slash, longer text with a blank line.
export function combinedText(current: string, other: string, field: string | null): string {
  if (current === other) return current;
  if (current === "") return other;
  if (other === "") return current;
  return `${current}${field === "title" ? " / " : "\n\n"}${other}`;
}

export type ConflictSource = "device" | "server";

/// A conflict from the device's own log or from the server's, in one list.
export interface AnyConflict extends Conflict {
  source: ConflictSource;
}

/// The device's conflicts and the server's together, newest first. The same
/// disagreement can be in both (a device that saw it and the server that logged
/// it); it is listed once, as the one the device holds.
export function mergeConflictLists(device: Conflict[], server: Conflict[]): AnyConflict[] {
  const key = (c: Conflict) => `${c.table}\u0000${c.pk}\u0000${c.field}\u0000${c.losingClock}`;
  const seen = new Set(device.map(key));
  const all: AnyConflict[] = [
    ...device.map((c) => ({ ...c, source: "device" as const })),
    ...server.filter((c) => !seen.has(key(c))).map((c) => ({ ...c, source: "server" as const })),
  ];
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface Side {
  /// The device's name: "iPhone", or "Another device" when unknown.
  device: string;
  isThisDevice: boolean;
  /// When that edit was made, from its clock.
  at: Date | null;
}

export interface ConflictView {
  id: string;
  source: ConflictSource;
  /// Two versions of one field, or a row removed on one device and edited on the other.
  kind: "field" | "removed";
  table: string;
  pk: string;
  field: string | null;
  /// The entity the row belongs to (the page behind a block), with its title.
  itemId: string | null;
  itemTitle: string;
  fieldLabel: string;
  /// The value in the item now, and the one that lost.
  current: SqlValue;
  other: SqlValue;
  currentSide: Side;
  otherSide: Side;
  isText: boolean;
  createdAt: string;
}

export interface DeviceNames {
  thisDeviceId: string;
  thisDeviceName: string;
  /// Device id (the end of a clock) to its name.
  names: Map<string, string>;
}

const FIELD_LABELS = new Map([
  ["entities.title", "Title"],
  ["entities.icon", "Icon"],
  ["entities.pinned", "Pinned"],
  ["blocks.content", "Text"],
  ["blocks.block_type", "Block type"],
  ["tasks.status_id", "Status"],
  ["tasks.start_date", "Start date"],
  ["tasks.due_date", "Due date"],
  ["tasks.effort", "Effort"],
  ["tasks.repeat_rule", "Repeat"],
]);

/// "due_date" as "Due date" when the field has no name of its own above.
function labelOf(table: string, field: string): string {
  const known = FIELD_LABELS.get(`${table}.${field}`);
  if (known) return known;
  const words = field.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/// A device's name as people read it: "Mac", not "Nookly on Mac".
const plainName = (name: string) => name.replace(/^Nookly on /, "");

function sideOf(clock: string | null, names: DeviceNames): Side {
  const id = clock?.split("-")[2] ?? "";
  const isThisDevice = id !== "" && id === names.thisDeviceId;
  const known = names.names.get(id);
  // Two devices with the same name (two Macs) are told apart by "Another".
  const other = known
    ? plainName(known) === plainName(names.thisDeviceName)
      ? `Another ${plainName(known)}`
      : plainName(known)
    : "Another device";
  return {
    device: isThisDevice ? plainName(names.thisDeviceName) : other,
    isThisDevice,
    at: clock ? new Date(clockWall(clock)) : null,
  };
}

/// The entity a row belongs to, and its title, read from this device's database.
async function itemOf(
  driver: SqlDriver,
  table: string,
  pk: string,
): Promise<{ id: string | null; title: string }> {
  const def = syncedTable(table);
  if (!def) return { id: null, title: table };
  let entityId: string | null = null;
  if (table === "entities") entityId = pk;
  else if (def.scope.kind === "column") {
    const key = decodePk(def, pk);
    const where = def.pk.map((c) => `${ident(c)} = ?`).join(" AND ");
    const rows = await driver.query(
      `SELECT ${ident(def.scope.column)} AS e FROM ${ident(table)} WHERE ${where}`,
      def.pk.map((c) => key[c] ?? null),
    );
    entityId = rows[0]?.e === undefined || rows[0].e === null ? null : String(rows[0].e);
  }
  if (!entityId) return { id: null, title: table };
  const rows = await driver.query("SELECT title FROM entities WHERE id = ?", [entityId]);
  return { id: entityId, title: rows[0] ? String(rows[0].title) : "Deleted item" };
}

async function currentValue(
  driver: SqlDriver,
  table: string,
  pk: string,
  field: string,
): Promise<SqlValue> {
  const def = syncedTable(table);
  if (!def) return null;
  const rows = await driver.query(
    `SELECT ${ident(field)} AS v FROM ${ident(table)} WHERE ${pkSql(def)} = ?`,
    [pk],
  );
  return rows[0]?.v ?? null;
}

export async function describeConflict(
  driver: SqlDriver,
  conflict: Conflict & { source?: ConflictSource },
  names: DeviceNames,
): Promise<ConflictView> {
  const item = await itemOf(driver, conflict.table, conflict.pk);
  const base = {
    id: conflict.id,
    source: conflict.source ?? ("device" as const),
    table: conflict.table,
    pk: conflict.pk,
    field: conflict.field,
    itemId: item.id,
    itemTitle: item.title,
    createdAt: conflict.createdAt,
    currentSide: sideOf(conflict.winningClock, names),
    otherSide: sideOf(conflict.losingClock, names),
  };
  if (conflict.field === null) {
    return {
      ...base,
      kind: "removed",
      fieldLabel: "Removed item",
      current: null,
      other: conflict.losingValue,
      isText: false,
    };
  }
  const current = await currentValue(driver, conflict.table, conflict.pk, conflict.field);
  return {
    ...base,
    kind: "field",
    fieldLabel: labelOf(conflict.table, conflict.field),
    current,
    other: conflict.losingValue,
    isText: isTextValue(current) || isTextValue(conflict.losingValue),
  };
}
