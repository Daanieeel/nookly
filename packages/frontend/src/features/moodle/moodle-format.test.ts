import { describe, expect, it } from "vitest";
import { fileSize, gradingLabel, moodleDate, submissionLabel } from "./moodle-format.ts";

describe("moodle formats", () => {
  it("has no date for zero", () => {
    expect(moodleDate(0)).toBeNull();
    expect(moodleDate(-1)).toBeNull();
    expect(moodleDate(1_700_000_000)).toMatch(/2023/);
  });

  it("writes sizes", () => {
    expect(fileSize(12)).toBe("12 B");
    expect(fileSize(2048)).toBe("2 KB");
    expect(fileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("names the submission and grading states", () => {
    expect(submissionLabel("submitted")).toBe("Submitted");
    expect(submissionLabel(null)).toBe("Not submitted");
    expect(submissionLabel("something new")).toBe("Not submitted");
    expect(gradingLabel("graded")).toBe("Graded");
    expect(gradingLabel("odd")).toBeNull();
    expect(gradingLabel(null)).toBeNull();
  });
});
