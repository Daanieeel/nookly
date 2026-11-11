import { z } from "zod";

/// What the editor keeps about a mind map beside its outline: where the user dragged nodes.
/// It lives in the block's `layout` attr, never in the outline text, so exports, the CLI and
/// the markdown stay as written.
///
/// A node is kept by an id per outline line (`ids`, in line order), so editing the outline
/// does not lose a position. A position is how far the node was dragged from where the
/// automatic layout puts it; its whole subtree moves with it.

export interface MindOffset {
  x: number;
  y: number;
}

export interface MindLayout {
  v: 1;
  /// One id per line of the outline text, blank lines included.
  ids: string[];
  /// Only nodes that were moved.
  positions: Record<string, MindOffset>;
}

export type ParsedLayout =
  | { kind: "none" }
  | { kind: "known"; layout: MindLayout }
  /// Written by a version that knows more than this one: kept as it is, never read.
  | { kind: "unknown" }
  | { kind: "broken" };

/// No node is dragged further than this from its automatic place.
const MAX_OFFSET = 4000;
/// Past this many cells, the part of an outline that changed is not searched for the
/// longest run of lines it kept; edited lines are still paired up.
const MAX_SEARCH = 1_000_000;

/// A short random id for an outline line.
export const newId = () => Math.random().toString(36).slice(2, 8);

const linesOf = (text: string): string[] => text.split("\n");

const layoutSchema = z.object({
  v: z.literal(1),
  ids: z.array(z.string()),
  positions: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
});
const versionSchema = z.object({ v: z.number() });

/// The stored value of a `layout` attr, which anything may have written to: the editor,
/// the CLI, a newer version of Nookly.
export function readLayout(raw: string): ParsedLayout {
  if (!raw.trim()) return { kind: "none" };
  let data: ReturnType<typeof JSON.parse>;
  try {
    data = JSON.parse(raw);
  } catch {
    return { kind: "broken" };
  }
  const known = layoutSchema.safeParse(data);
  if (known.success) return { kind: "known", layout: known.data };
  const version = versionSchema.safeParse(data);
  return version.success && version.data.v !== 1 ? { kind: "unknown" } : { kind: "broken" };
}

/// The layout as stored, or `""` when nothing was moved: ids are only worth keeping while
/// they hold a position.
function write(layout: MindLayout): string {
  return Object.keys(layout.positions).length === 0 ? "" : JSON.stringify(layout);
}

/// The layout when it was made for `text`, which is when it has an id for each line.
function layoutFitting(text: string, raw: string): MindLayout | null {
  const parsed = readLayout(raw);
  if (parsed.kind !== "known") return null;
  return parsed.layout.ids.length === linesOf(text).length ? parsed.layout : null;
}

/// The offsets to lay `text` out with, by the outline line each belongs to. Empty when the
/// layout was not made for this text, such as an outline pasted or written from outside.
export function offsetsFor(text: string, raw: string): Map<number, MindOffset> {
  const layout = layoutFitting(text, raw);
  const offsets = new Map<number, MindOffset>();
  layout?.ids.forEach((id, line) => {
    const offset = layout.positions[id];
    if (offset) offsets.set(line, offset);
  });
  return offsets;
}

/// A new id that is not in `used`, which it is added to. A generator that keeps giving
/// the same id still ends: the id gets a number after it.
function unusedId(used: Set<string>, fresh: () => string): string {
  let id = fresh();
  for (let tries = 0; used.has(id); tries++) id = tries < 20 ? fresh() : `${id}${used.size}`;
  used.add(id);
  return id;
}

/// The ids for the lines of `after`, from those of `before`. Unchanged lines and lines
/// moved elsewhere keep theirs; a line edited in place, between lines that stayed, keeps
/// its id too; every other new line gets a fresh one.
function followLines(
  before: string[],
  after: string[],
  ids: string[],
  fresh: () => string,
): string[] {
  const next: (string | undefined)[] = Array.from({ length: after.length }, () => undefined);
  const taken = new Set<number>();
  /// Pairs of (old line, new line) that stayed in place, which edited lines are found between.
  const anchors: [number, number][] = [];
  const keep = (oldLine: number, newLine: number) => {
    next[newLine] = ids[oldLine];
    taken.add(oldLine);
  };

  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) {
    keep(head, head);
    anchors.push([head, head]);
    head++;
  }
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++;
  }
  for (let i = tail - 1; i >= 0; i--) {
    keep(before.length - 1 - i, after.length - 1 - i);
  }

  // The longest run of lines kept in the middle.
  const oldMiddle = before.slice(head, before.length - tail);
  const newMiddle = after.slice(head, after.length - tail);
  if (oldMiddle.length * newMiddle.length <= MAX_SEARCH) {
    const width = newMiddle.length + 1;
    const table = new Uint32Array((oldMiddle.length + 1) * width);
    for (let i = oldMiddle.length - 1; i >= 0; i--) {
      for (let j = newMiddle.length - 1; j >= 0; j--) {
        table[i * width + j] =
          oldMiddle[i] === newMiddle[j]
            ? (table[(i + 1) * width + j + 1] ?? 0) + 1
            : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
      }
    }
    let i = 0;
    let j = 0;
    while (i < oldMiddle.length && j < newMiddle.length) {
      if (oldMiddle[i] === newMiddle[j]) {
        keep(head + i, head + j);
        anchors.push([head + i, head + j]);
        i++;
        j++;
      } else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) i++;
      else j++;
    }
  }
  for (let i = tail - 1; i >= 0; i--) {
    anchors.push([before.length - 1 - i, after.length - 1 - i]);
  }

  // A line that moved: the same text, still unclaimed.
  const loose = new Map<string, number[]>();
  before.forEach((line, i) => {
    if (taken.has(i)) return;
    const queue = loose.get(line) ?? [];
    queue.push(i);
    loose.set(line, queue);
  });
  after.forEach((line, j) => {
    if (next[j] !== undefined) return;
    const from = loose.get(line)?.shift();
    if (from !== undefined) keep(from, j);
  });

  // A line edited in place: what is left between two lines that stayed, when as many
  // lines went as came.
  const bounds: [number, number][] = [[-1, -1], ...anchors, [before.length, after.length]];
  for (let k = 1; k < bounds.length; k++) {
    const [fromOld, fromNew] = bounds[k - 1] ?? [-1, -1];
    const [toOld, toNew] = bounds[k] ?? [before.length, after.length];
    const gone: number[] = [];
    for (let i = fromOld + 1; i < toOld; i++) if (!taken.has(i)) gone.push(i);
    const came: number[] = [];
    for (let j = fromNew + 1; j < toNew; j++) if (next[j] === undefined) came.push(j);
    if (gone.length === came.length) gone.forEach((oldLine, n) => keep(oldLine, came[n] ?? 0));
  }

  const used = new Set(next.filter((id): id is string => id !== undefined));
  return next.map((id) => id ?? unusedId(used, fresh));
}

/// The layout after the outline changed from `before` to `after`: each line keeps its id
/// through a line diff, and positions of lines that are gone are dropped. A layout that was
/// not made for `before` cannot be followed and is cleared; one written by a newer version
/// is left alone.
export function reconcileLayout(
  before: string,
  after: string,
  raw: string,
  fresh: () => string,
): string {
  const parsed = readLayout(raw);
  if (parsed.kind === "none" || parsed.kind === "unknown") return raw;
  if (before === after) return raw;
  if (parsed.kind === "broken") return "";
  const { layout } = parsed;
  const old = linesOf(before);
  if (layout.ids.length !== old.length) return "";
  const ids = followLines(old, linesOf(after), layout.ids, fresh);
  const alive = new Set(ids);
  const positions = Object.fromEntries(
    Object.entries(layout.positions).filter(([id]) => alive.has(id)),
  );
  return write({ v: 1, ids, positions });
}

const clamp = (n: number) => Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, Math.round(n)));

/// The layout with the node on outline line `line` dragged to `offset`. The first drag of
/// an outline gives every line its id; a zero offset puts the node back.
export function setOffset(
  text: string,
  raw: string,
  line: number,
  offset: MindOffset,
  fresh: () => string,
): string {
  const lines = linesOf(text);
  const fitting = layoutFitting(text, raw);
  let ids = fitting?.ids;
  if (!ids) {
    const made = new Set<string>();
    ids = lines.map(() => unusedId(made, fresh));
  }
  const id = ids[line];
  if (id === undefined) return raw;
  const positions = { ...fitting?.positions };
  const [x, y] = [clamp(offset.x), clamp(offset.y)];
  if (x === 0 && y === 0) delete positions[id];
  else positions[id] = { x, y };
  return write({ v: 1, ids, positions });
}

/// The layout with every node back at its automatic place, or `null` when none was moved.
export function resetLayout(raw: string): string | null {
  return raw.trim() ? "" : null;
}
