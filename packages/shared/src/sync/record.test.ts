import { describe, expect, it } from "vitest";
import { makeClock } from "./hlc.ts";
import {
  EMPTY_RECORD,
  type RecordState,
  findLosses,
  findPushLosses,
  isAlive,
  mergeRecords,
} from "./record.ts";

const c = (wall: number, device = "a") => makeClock(wall, 0, device);

function rec(
  fields: RecordState["fields"],
  clocks: RecordState["clocks"],
  deletedClock: string | null = null,
): RecordState {
  return { fields, clocks, deletedClock };
}

describe("merging a record", () => {
  it("keeps each field's newest value", () => {
    const left = rec({ title: "A", due: "mon" }, { title: c(2), due: c(1) });
    const right = rec({ title: "B", due: "tue" }, { title: c(1, "b"), due: c(3, "b") });
    expect(mergeRecords(left, right).fields).toEqual({ title: "A", due: "tue" });
  });

  it("takes fields only one side knows", () => {
    const merged = mergeRecords(rec({ a: 1 }, { a: c(1) }), rec({ b: 2 }, { b: c(1) }));
    expect(merged.fields).toEqual({ a: 1, b: 2 });
  });

  it("breaks a tie at the same millisecond by device, the same way on both sides", () => {
    const left = rec({ a: "left" }, { a: c(5, "a") });
    const right = rec({ a: "right" }, { a: c(5, "b") });
    expect(mergeRecords(left, right).fields.a).toBe("right");
    expect(mergeRecords(right, left).fields.a).toBe("right");
  });
});

describe("deleting", () => {
  it("hides a record edited before the delete", () => {
    const deleted = rec({ a: 1 }, { a: c(1) }, c(2, "b"));
    expect(isAlive(mergeRecords(rec({ a: 1 }, { a: c(1) }), deleted))).toBe(false);
  });

  it("brings a record back that was edited after the delete", () => {
    const merged = mergeRecords(rec({ a: 1 }, { a: c(1) }, c(2, "b")), rec({ a: 9 }, { a: c(3) }));
    expect(isAlive(merged)).toBe(true);
    expect(merged.fields.a).toBe(9);
  });

  it("keeps a deleted record's last values, so it can come back whole", () => {
    const merged = mergeRecords(rec({ a: 2 }, { a: c(2) }), rec({ a: 1 }, { a: c(1) }, c(3, "b")));
    expect(merged.fields.a).toBe(2);
    expect(isAlive(merged)).toBe(false);
  });
});

describe("finding the edits that lost", () => {
  const base = rec({ title: "Old", due: "mon" }, { title: c(1), due: c(1) });

  it("reports nothing when only one side changed a field", () => {
    const local = rec({ title: "Mine", due: "mon" }, { title: c(5), due: c(1) });
    const remote = rec({ title: "Old", due: "fri" }, { title: c(1), due: c(4, "b") });
    expect(findLosses(base, local, remote)).toEqual([]);
  });

  it("reports the older of two edits to one field", () => {
    const local = rec({ title: "Mine" }, { title: c(3) });
    const remote = rec({ title: "Theirs" }, { title: c(5, "b") });
    expect(findLosses(base, local, remote)).toEqual([
      { side: "local", field: "title", value: "Mine", clock: c(3), winningClock: c(5, "b") },
    ]);
    expect(findLosses(base, remote, local)).toEqual([
      { side: "remote", field: "title", value: "Mine", clock: c(3), winningClock: c(5, "b") },
    ]);
  });

  it("reports nothing when both made the same edit", () => {
    const local = rec({ title: "Same" }, { title: c(3) });
    const remote = rec({ title: "Same" }, { title: c(5, "b") });
    expect(findLosses(base, local, remote)).toEqual([]);
  });

  it("reports edits a delete never saw", () => {
    const local = rec({ title: "Mine", due: "mon" }, { title: c(2), due: c(1) });
    const remote = { ...base, deletedClock: c(3, "b") };
    expect(findLosses(base, local, remote)).toEqual([
      {
        side: "local",
        field: null,
        value: JSON.stringify({ title: "Mine" }),
        clock: c(2),
        winningClock: c(3, "b"),
      },
    ]);
  });

  it("reports nothing for a new record only one side has", () => {
    expect(findLosses(EMPTY_RECORD, EMPTY_RECORD, base)).toEqual([]);
  });
});

describe("merging is safe to repeat and to reorder", () => {
  const samples: RecordState[] = [
    rec({ a: 1, b: "x" }, { a: c(1), b: c(4) }),
    rec({ a: 2 }, { a: c(3, "b") }),
    rec({ b: "y", c: null }, { b: c(2, "c"), c: c(7, "c") }),
    rec({ a: 5 }, { a: c(2, "d") }, c(5, "d")),
    rec({}, {}, c(9, "e")),
    EMPTY_RECORD,
  ];

  it("gives the same result in any order", () => {
    for (const x of samples) {
      for (const y of samples) {
        expect(mergeRecords(x, y)).toEqual(mergeRecords(y, x));
        for (const z of samples) {
          expect(mergeRecords(mergeRecords(x, y), z)).toEqual(mergeRecords(x, mergeRecords(y, z)));
        }
      }
    }
  });

  it("changes nothing when merged with itself", () => {
    for (const x of samples) expect(mergeRecords(x, x)).toEqual(x);
  });
});

describe("finding what a push loses", () => {
  const stored = rec({ title: "Server", due: "mon" }, { title: c(5, "b"), due: c(1) });

  it("reports nothing for an edit that saw the stored value", () => {
    const change = { ...rec({ title: "Mine" }, { title: c(7) }), baseClocks: { title: c(5, "b") } };
    expect(findPushLosses(stored, change)).toEqual([]);
  });

  it("reports the stored value a concurrent, newer edit replaces", () => {
    const change = { ...rec({ title: "Mine" }, { title: c(7) }), baseClocks: { title: c(1) } };
    expect(findPushLosses(stored, change)).toEqual([
      { side: "remote", field: "title", value: "Server", clock: c(5, "b"), winningClock: c(7) },
    ]);
  });

  it("reports the pushed value when the stored one is newer", () => {
    const change = { ...rec({ title: "Mine" }, { title: c(3) }), baseClocks: {} };
    expect(findPushLosses(stored, change)).toEqual([
      { side: "local", field: "title", value: "Mine", clock: c(3), winningClock: c(5, "b") },
    ]);
  });

  it("reports nothing for a record new to the server", () => {
    const change = { ...rec({ title: "New" }, { title: c(3) }), baseClocks: {} };
    expect(findPushLosses(null, change)).toEqual([]);
  });
});

describe("fields nobody decides on", () => {
  it("never count as a conflict: a timestamp both sides touched is not a disagreement", () => {
    const base: RecordState = { fields: { title: "a", updated_at: "t0" }, clocks: { title: "1-1-a", updated_at: "1-1-a" }, deletedClock: null };
    const local: RecordState = { fields: { title: "b", updated_at: "t1" }, clocks: { title: "5-1-a", updated_at: "5-1-a" }, deletedClock: null };
    const remote: RecordState = { fields: { title: "c", updated_at: "t2" }, clocks: { title: "6-1-b", updated_at: "6-1-b" }, deletedClock: null };
    expect(findLosses(base, local, remote).map((l) => l.field)).toEqual(["title"]);
    expect(
      findPushLosses(remote, { ...local, baseClocks: { title: "1-1-a", updated_at: "1-1-a" } }).map((l) => l.field),
    ).toEqual(["title"]);
  });
});
