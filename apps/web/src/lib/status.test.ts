import { describe, expect, it } from "vitest";
import { dayState, emptyStatus, incidents, recordCheck, statusSchema, uptime } from "./status";

const at = (iso: string) => new Date(iso);

describe("recordCheck", () => {
  it("counts each check into its UTC day and keeps the last one", () => {
    let data = emptyStatus();
    data = recordCheck(
      data,
      "sync",
      { ok: true, ms: 120, version: "1.0.0" },
      at("2026-11-19T10:00:00Z"),
    );
    data = recordCheck(data, "sync", { ok: false, ms: 5000 }, at("2026-11-19T10:05:00Z"));
    expect(data.components.sync?.days["2026-11-19"]).toEqual({
      checks: 2,
      down: 1,
      slow: 0,
      ms: 120,
    });
    expect(data.components.sync?.last).toEqual({
      at: "2026-11-19T10:05:00.000Z",
      ok: false,
      ms: 5000,
      version: null,
    });
    expect(data.updatedAt).toBe("2026-11-19T10:05:00.000Z");
  });

  it("reads a stored history and refuses anything else", () => {
    const stored = recordCheck(
      emptyStatus(),
      "sync",
      { ok: true, ms: 9 },
      at("2026-11-19T00:00:00Z"),
    );
    expect(statusSchema.parse(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
    expect(statusSchema.safeParse({ components: "nope" }).success).toBe(false);
  });

  it("counts a slow answer as slow, not down, and averages only answers that came", () => {
    let data = emptyStatus();
    data = recordCheck(data, "website", { ok: true, ms: 100 }, at("2026-11-19T00:00:00Z"));
    data = recordCheck(data, "website", { ok: true, ms: 4000 }, at("2026-11-19T00:05:00Z"));
    expect(data.components.website?.days["2026-11-19"]).toEqual({
      checks: 2,
      down: 0,
      slow: 1,
      ms: 2050,
    });
  });

  it("forgets days older than 90", () => {
    let data = emptyStatus();
    data = recordCheck(data, "sync", { ok: true, ms: 1 }, at("2026-08-01T00:00:00Z"));
    data = recordCheck(data, "sync", { ok: true, ms: 1 }, at("2026-11-19T00:00:00Z"));
    expect(Object.keys(data.components.sync?.days ?? {})).toEqual(["2026-11-19"]);
  });
});

describe("reading the history", () => {
  it("rates a day by how much of it was up", () => {
    expect(dayState(undefined)).toBe("unknown");
    expect(dayState({ checks: 288, down: 0, slow: 0, ms: 1 })).toBe("up");
    expect(dayState({ checks: 288, down: 0, slow: 20, ms: 1 })).toBe("degraded");
    expect(dayState({ checks: 288, down: 2, slow: 0, ms: 1 })).toBe("degraded");
    expect(dayState({ checks: 288, down: 40, slow: 0, ms: 1 })).toBe("down");
  });

  it("gives uptime over the days it has, and lists troubled days newest first", () => {
    let data = emptyStatus();
    for (let i = 0; i < 3; i++) {
      data = recordCheck(data, "sync", { ok: true, ms: 1 }, at(`2026-11-18T0${i}:00:00Z`));
    }
    data = recordCheck(data, "sync", { ok: false, ms: 0 }, at("2026-11-19T00:00:00Z"));
    data = recordCheck(data, "sync", { ok: true, ms: 1 }, at("2026-11-19T00:05:00Z"));
    // SAFETY: recorded above.
    const sync = data.components.sync!;
    expect(uptime(sync)).toBeCloseTo(80);
    expect(incidents(data)).toEqual([{ day: "2026-11-19", component: "sync", minutes: 5 }]);
  });
});
