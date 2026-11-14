import { describe, expect, it } from "vitest";
import { moodleDate } from "./moodle-format.ts";

describe("moodleDate", () => {
  it("has no date for zero", () => {
    expect(moodleDate(0)).toBeNull();
    expect(moodleDate(-1)).toBeNull();
    expect(moodleDate(1_700_000_000)).toMatch(/2023/);
  });
});
