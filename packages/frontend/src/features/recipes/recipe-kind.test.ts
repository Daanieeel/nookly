import { describe, expect, it } from "vitest";
import { RECIPE_TIME_BUCKETS, recipeTime } from "./recipe-kind.ts";

describe("a recipe's time filter", () => {
  it("sorts a recipe by how long it takes, or says it is not known", () => {
    expect(RECIPE_TIME_BUCKETS.map((b) => b.label)).toEqual([
      "15 minutes or less",
      "30 minutes or less",
      "An hour or less",
      "Longer",
      "Not set",
    ]);
    expect(recipeTime(10)).toBe("15");
    expect(recipeTime(15)).toBe("15");
    expect(recipeTime(25)).toBe("30");
    expect(recipeTime(60)).toBe("60");
    expect(recipeTime(90)).toBe("longer");
    expect(recipeTime(null)).toBe("none");
  });
});
