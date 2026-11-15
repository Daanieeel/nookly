import { placePopover } from "./placement.ts";

const WINDOW = { width: 1376, height: 1032 };

// A popover opens under what opened it and flips above or aside where there is no room,
// never over its anchor, 12 from the window's edges and above the keyboard (D83, 2.1).
describe("where a popover goes", () => {
  it("opens under its anchor, lined up with its left edge", () => {
    const at = placePopover({
      anchor: { x: 400, y: 100, width: 120, height: 44 },
      size: { width: 320, height: 300 },
      window: WINDOW,
    });
    expect(at).toEqual({ left: 400, top: 152, maxHeight: WINDOW.height - 152 - 12, side: "below" });
  });

  it("flips above when there is more room there", () => {
    const at = placePopover({
      anchor: { x: 400, y: 900, width: 120, height: 44 },
      size: { width: 320, height: 300 },
      window: WINDOW,
    });
    expect(at.side).toBe("above");
    expect(at.top).toBe(900 - 8 - 300);
  });

  it("stays inside the window at its right edge", () => {
    const at = placePopover({
      anchor: { x: 1300, y: 100, width: 44, height: 44 },
      size: { width: 320, height: 200 },
      window: WINDOW,
    });
    expect(at.left).toBe(WINDOW.width - 12 - 320);
  });

  it("keeps above the keyboard", () => {
    const at = placePopover({
      anchor: { x: 100, y: 500, width: 200, height: 44 },
      size: { width: 320, height: 400 },
      window: WINDOW,
      keyboard: 400,
    });
    // Under the anchor there are only 32 points above the keyboard: it goes above.
    expect(at.side).toBe("above");
    expect(at.top + Math.min(400, at.maxHeight)).toBeLessThanOrEqual(500 - 8);
  });

  it("opens beside an anchor too tall for room above or below", () => {
    const at = placePopover({
      anchor: { x: 200, y: 40, width: 200, height: 950 },
      size: { width: 320, height: 300 },
      window: WINDOW,
    });
    expect(at.side).toBe("right");
    expect(at.left).toBe(408);
  });

  it("shrinks to the room it has, and scrolls", () => {
    const at = placePopover({
      anchor: { x: 100, y: 100, width: 100, height: 44 },
      size: { width: 320, height: 2000 },
      window: WINDOW,
    });
    expect(at.side).toBe("below");
    expect(at.maxHeight).toBe(WINDOW.height - 152 - 12);
  });
});
