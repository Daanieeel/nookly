import type { Row, SqlValue } from "../schema.ts";
import { compareClocks, maxClock } from "./hlc.ts";

/// A synced row as a small CRDT: every field with the clock of its last edit, and
/// the clock of its last delete. Merging two states is commutative, associative and
/// idempotent, so every device and the server end up with the same row whatever
/// order the edits reach them in. A record is alive while some field was edited
/// after its last delete: deleting hides it, a later edit brings it back.
///
/// Each field keeps its newest value. A table that merges per record instead (a
/// card's review schedule, whose fields only make sense together) gets there by
/// every edit stamping all of its fields with one clock, so the newest edit takes
/// the whole row; see `stampChange`.
export interface RecordState {
  fields: Row;
  clocks: Record<string, string>;
  deletedClock: string | null;
}

export const EMPTY_RECORD: RecordState = { fields: {}, clocks: {}, deletedClock: null };

export function newestFieldClock(record: RecordState): string | null {
  let newest: string | null = null;
  for (const clock of Object.values(record.clocks)) newest = maxClock(newest, clock);
  return newest;
}

export function isAlive(record: RecordState): boolean {
  if (record.deletedClock === null) return true;
  const newest = newestFieldClock(record);
  return newest !== null && newest > record.deletedClock;
}

export function mergeRecords(left: RecordState, right: RecordState): RecordState {
  const fields: Row = {};
  const clocks: Record<string, string> = {};
  for (const name of new Set([...Object.keys(left.clocks), ...Object.keys(right.clocks)])) {
    const l = left.clocks[name];
    const r = right.clocks[name];
    const fromLeft = r === undefined || (l !== undefined && compareClocks(l, r) >= 0);
    const winner = fromLeft ? left : right;
    fields[name] = winner.fields[name] ?? null;
    clocks[name] = winner.clocks[name];
  }
  return { fields, clocks, deletedClock: maxClock(left.deletedClock, right.deletedClock) };
}

/// An edit that lost to a concurrent one: one made without seeing it. `field` is
/// null when the record was deleted over edits the delete never saw; `value` then
/// holds those fields as JSON. Losing edits are kept, never silently dropped.
export interface Loss {
  side: "local" | "remote";
  field: string | null;
  value: SqlValue;
  clock: string;
  winningClock: string;
}

/// The fields `side` edited since `base`, with their clocks.
function editedSince(base: RecordState, side: RecordState): Map<string, string> {
  const edited = new Map<string, string>();
  for (const [name, clock] of Object.entries(side.clocks)) {
    if (clock !== base.clocks[name]) edited.set(name, clock);
  }
  return edited;
}

function deletedSince(base: RecordState, side: RecordState): boolean {
  return side.deletedClock !== null && side.deletedClock !== base.deletedClock;
}

/// Fields the app keeps by itself, which two devices always both touch when they edit
/// the same row: the newer value simply wins, and there is nothing to decide.
const AUTOMATIC_FIELDS = new Set(["updated_at"]);

/// The edits that lose when `local` and `remote`, both grown from `base`, merge:
/// a field both changed to different values loses on the side with the older clock,
/// and edits are lost to a delete that wins over them without having seen them.
export function findLosses(base: RecordState, local: RecordState, remote: RecordState): Loss[] {
  const merged = mergeRecords(local, remote);
  const sides = { local, remote };
  const edits = { local: editedSince(base, local), remote: editedSince(base, remote) };
  const losses: Loss[] = [];
  for (const [name, localClock] of edits.local) {
    const remoteClock = edits.remote.get(name);
    if (remoteClock === undefined || AUTOMATIC_FIELDS.has(name)) continue;
    const loser = merged.clocks[name] === localClock ? "remote" : "local";
    const value = sides[loser].fields[name] ?? null;
    if (value === merged.fields[name]) continue;
    losses.push({
      side: loser,
      field: name,
      value,
      clock: loser === "local" ? localClock : remoteClock,
      winningClock: merged.clocks[name],
    });
  }
  if (!isAlive(merged) && merged.deletedClock !== null) {
    for (const side of ["local", "remote"] as const) {
      const other = side === "local" ? "remote" : "local";
      if (!deletedSince(base, sides[other]) || edits[side].size === 0) continue;
      const unseen: Row = {};
      let newest: string | null = null;
      for (const [name, clock] of edits[side]) {
        unseen[name] = sides[side].fields[name] ?? null;
        newest = maxClock(newest, clock);
      }
      if (newest === null) continue;
      losses.push({
        side,
        field: null,
        value: JSON.stringify(unseen),
        clock: newest,
        winningClock: merged.deletedClock,
      });
    }
  }
  return losses;
}

/// What a pushed change loses, or makes the stored record lose, on the server. The
/// change carries `baseClocks`, the clock each field had where it was edited: a
/// stored clock that differs means someone else edited the field meanwhile.
/// "local" is the pushed change, "remote" the stored record.
export function findPushLosses(
  stored: RecordState | null,
  change: RecordState & { baseClocks: Record<string, string> },
): Loss[] {
  if (!stored) return [];
  const changed = new Set(Object.keys(change.clocks));
  const clocks = Object.fromEntries([
    ...Object.entries(stored.clocks).filter(([name]) => !changed.has(name)),
    ...Object.entries(change.baseClocks).filter(([name]) => changed.has(name)),
  ]);
  return findLosses({ fields: {}, clocks, deletedClock: stored.deletedClock }, change, stored);
}
