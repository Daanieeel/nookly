import { describe, expect, it } from "vitest";
import { CALLOUT_VARIANTS, calloutVariant } from "./CalloutBlock";

describe("callout variants", () => {
  it("has an AI comment next to the standard ones", () => {
    expect(CALLOUT_VARIANTS.map((v) => v.value)).toEqual([
      "note",
      "tip",
      "warning",
      "danger",
      "ai",
    ]);
    expect(CALLOUT_VARIANTS.find((v) => v.value === "ai")?.label).toBe("AI Comment");
  });

  it("reads the stored variant, and falls back to a note for an unknown one", () => {
    expect(calloutVariant("ai")).toBe("ai");
    expect(calloutVariant("loud")).toBe("note");
  });
});
