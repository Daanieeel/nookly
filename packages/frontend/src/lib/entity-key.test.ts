import { describe, expect, it } from "vitest";
import { matchesTitleOrKey } from "./entity-key.ts";

describe("matchesTitleOrKey with accents", () => {
  const file = { title: "Analysis: Übungsblatt 1 - Logik.pdf", key: "FIL-459" };
  it("finds a macOS style decomposed title by what the keyboard types", () => {
    expect(matchesTitleOrKey(file, "Übungsblatt")).toBe(true);
    expect(matchesTitleOrKey(file, "ubung")).toBe(true);
  });
});
