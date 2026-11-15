import { PASTE_BAR_MARGIN, floatingBarShape, screenCornerRadius } from "../ui/FloatingField.tsx";

// The paste bars (Bookmarks, Files) sit at the very bottom of the screen, snug in the
// phone's own rounded corners as Safari's bar does: 8 points from the sides and the bottom,
// their bottom corners following the screen's curve at that distance, the send button's
// corners nested inside the bar's.
describe("the paste bar", () => {
  it("knows the screen's own corner radius from the phone's size", () => {
    expect(screenCornerRadius({ width: 402, height: 874 })).toBe(62);
    expect(screenCornerRadius({ width: 393, height: 852 })).toBe(55);
    expect(screenCornerRadius({ width: 390, height: 844 })).toBeCloseTo(47.33, 2);
    // Turned on its side, the same phone.
    expect(screenCornerRadius({ width: 874, height: 402 })).toBe(62);
    // A phone with square corners (a Home button), or one it does not know.
    expect(screenCornerRadius({ width: 375, height: 667 })).toBe(0);
  });

  it("sits 8 points in, its bottom corners following the screen's", () => {
    expect(PASTE_BAR_MARGIN).toBe(8);
    const shape = floatingBarShape(55);
    expect(shape.bottom).toBe(55 - PASTE_BAR_MARGIN);
    // The top keeps the regular corners, never a pill.
    expect(shape.top).toBeLessThan(shape.height / 2);
    expect(shape.top + shape.bottom).toBeLessThanOrEqual(shape.height);
  });

  it("nests the send button's corners in the bar's", () => {
    const shape = floatingBarShape(55);
    expect(shape.button.top).toBe(shape.top - shape.button.inset);
    expect(shape.button.bottom).toBe(shape.bottom - shape.button.inset);
    expect(shape.button.size).toBe(shape.height - 2 * shape.button.inset);
    expect(shape.button.size).toBeGreaterThanOrEqual(44);
  });

  it("never asks for corners larger than the bar, whatever the screen", () => {
    const shape = floatingBarShape(90);
    expect(shape.top + shape.bottom).toBeLessThanOrEqual(shape.height);
  });

  it("keeps regular corners all round on a phone with square corners", () => {
    const shape = floatingBarShape(0);
    expect(shape.bottom).toBe(shape.top);
  });
});
