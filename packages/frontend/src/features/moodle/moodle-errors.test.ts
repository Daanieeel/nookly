import { describe, expect, it } from "vitest";
import { describeMoodleProblem } from "./moodle-errors.ts";

describe("describeMoodleProblem", () => {
  it.each([
    ["Couldn't reach Moodle.", "offline"],
    ["Moodle took too long to answer.", "offline"],
    ["Your Moodle sign in expired. Connect again.", "signed-out"],
    ["Your Moodle sign in is gone. Connect again.", "signed-out"],
    [
      "Moodle doesn't allow Nookly to read this (gradereport_user_get_grade_items: nopermissiontoviewgrades).",
      "grades-hidden",
    ],
    [
      "Moodle doesn't allow Nookly to read this (core_course_get_contents: nopermission).",
      "denied",
    ],
    ["This Moodle site has the mobile app service turned off, so Nookly can't read it.", "denied"],
    ["Moodle answered in a way Nookly can't read.", "unreadable"],
    ["Moodle sent something unexpected.", "unreadable"],
    ["Moodle no longer has that file.", "other"],
    ["Something nobody planned for.", "other"],
  ])("sorts %j as %s", (message, kind) => {
    expect(describeMoodleProblem(message).kind).toBe(kind);
  });

  it("keeps Moodle's own words for the details, and says something kinder up front", () => {
    const message = "Moodle doesn't allow Nookly to read this (x: nopermission).";
    const problem = describeMoodleProblem(message);
    expect(problem.details).toBe(message);
    expect(problem.title).not.toContain("nopermission");
    expect(problem.description).not.toContain("nopermission");
  });

  it("writes no dashes into the copy", () => {
    for (const message of ["Couldn't reach Moodle.", "x", "Moodle sent something unexpected."]) {
      const { title, description } = describeMoodleProblem(message);
      expect(`${title} ${description}`).not.toMatch(/[–—]/);
    }
  });

  it("only offers the Moodle website for problems it can help with", () => {
    expect(describeMoodleProblem("Couldn't reach Moodle.").offerWebsite).toBe(false);
    expect(describeMoodleProblem("Moodle sent something unexpected.").offerWebsite).toBe(true);
    expect(
      describeMoodleProblem("Moodle doesn't allow Nookly to read this (a).").offerWebsite,
    ).toBe(true);
  });
});
