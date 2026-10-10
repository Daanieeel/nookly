import { describe, expect, it } from "vitest";
import { labelForType, pluralLabel } from "./entity-title.ts";

describe("pluralLabel", () => {
  it.each([
    ["note", "Notes"],
    ["file", "Files"],
    ["session", "Sessions"],
    ["study_block", "Study Blocks"],
    ["index_card_deck", "Decks"],
    ["course_notes", "Course Notes"],
    ["never_heard_of_it", "Items"],
  ])("lists %s as %s", (type, label) => {
    expect(pluralLabel(type)).toBe(label);
  });

  it("agrees with the singular label", () => {
    expect(labelForType("note")).toBe("Note");
  });
});
