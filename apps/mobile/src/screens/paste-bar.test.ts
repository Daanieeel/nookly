import { PASTE_BAR, PASTE_BAR_MARGIN, PASTE_BAR_STACK } from "../ui/FloatingField.tsx";
import { RADIUS } from "../ui/tokens.ts";

// The bars floating at the bottom of a page (the paste bars of Bookmarks and Files, the save
// bar) sit clear of the home indicator and have regular corners, like a card, not a pill.
describe("the floating bars", () => {
  it("have corners that run alongside their button's", () => {
    // The button's corners are a regular button's; the bar's are those and the distance
    // between the two curves: the button's inset and the bar's own edge.
    expect(PASTE_BAR.radius).toBe(RADIUS.control + PASTE_BAR.inset + PASTE_BAR.edge);
    expect(PASTE_BAR.radius).toBeLessThan(PASTE_BAR.height / 2);
  });

  it("are as tall as their 44 point button and its inset on both sides", () => {
    expect(PASTE_BAR.height).toBe(44 + 2 * (PASTE_BAR.inset + PASTE_BAR.edge));
  });

  it("stack the save bar over the paste bar with a gap", () => {
    expect(PASTE_BAR_STACK).toBeGreaterThan(PASTE_BAR.height);
    expect(PASTE_BAR_MARGIN).toBeGreaterThan(0);
  });
});
