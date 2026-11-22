import { labelsThatFit } from "./label-fit.ts";

describe("labelsThatFit", () => {
  it("keeps every label that fits", () => {
    expect(labelsThatFit([60, 40], 20, 104)).toBe(2);
    expect(labelsThatFit([], 20, 0)).toBe(0);
  });

  it("gives up the last labels, leaving room for the ellipsis in their place", () => {
    // 60 + 4 + 60 + 4 + 60 = 188 does not fit in 150: two labels and the ellipsis do.
    expect(labelsThatFit([60, 60, 60], 20, 150)).toBe(2);
    // Two labels and the ellipsis need 148; in 140 only one label does.
    expect(labelsThatFit([60, 60, 60], 20, 140)).toBe(1);
  });

  it("leaves only the ellipsis when not even one label fits beside it", () => {
    expect(labelsThatFit([120, 60], 20, 100)).toBe(0);
  });
});
