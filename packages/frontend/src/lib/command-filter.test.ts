import { describe, expect, it } from "vitest";
import { accentInsensitiveFilter } from "./command-filter.ts";

describe("accentInsensitiveFilter", () => {
  it("matches composed and decomposed accents and bare letters alike", () => {
    const decomposed = "Übungsblatt";
    for (const query of ["Übungs", "Übungs", "ubungs"]) {
      expect(accentInsensitiveFilter(decomposed, query)).toBeGreaterThan(0);
    }
    expect(accentInsensitiveFilter("Übungsblatt", "Übungs")).toBeGreaterThan(0);
  });

  it("finds by keywords and rejects what is not there", () => {
    expect(accentInsensitiveFilter("Task", "tsk14", ["TSK-14", "TSK14"])).toBeGreaterThan(0);
    expect(accentInsensitiveFilter("Übungsblatt", "xyz")).toBe(0);
  });
});
