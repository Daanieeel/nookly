import { PASTE_BAR_MARGIN, pasteBarCorners, screenCornerRadius } from "../ui/FloatingField.tsx";

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
    const corners = pasteBarCorners(55);
    expect(corners.bottom).toBe(55 - PASTE_BAR_MARGIN);
    // The top keeps the regular corners, never a pill.
    expect(corners.top).toBeLessThan(corners.height / 2);
    expect(corners.top + corners.bottom).toBeLessThanOrEqual(corners.height);
  });

  it("nests the send button's corners in the bar's", () => {
    const corners = pasteBarCorners(55);
    expect(corners.button.top).toBe(corners.top - corners.button.inset);
    expect(corners.button.bottom).toBe(corners.bottom - corners.button.inset);
    expect(corners.button.size).toBe(corners.height - 2 * corners.button.inset);
    expect(corners.button.size).toBeGreaterThanOrEqual(44);
  });

  it("never asks for corners larger than the bar, whatever the screen", () => {
    const corners = pasteBarCorners(90);
    expect(corners.top + corners.bottom).toBeLessThanOrEqual(corners.height);
  });

  it("keeps regular corners all round on a phone with square corners", () => {
    const corners = pasteBarCorners(0);
    expect(corners.bottom).toBe(corners.top);
  });
});
