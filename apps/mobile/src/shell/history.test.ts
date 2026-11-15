import { TOP_LEVEL_SCREEN, pageBar } from "./history.ts";

describe("the pages the sidebar opens", () => {
  it("are not left with a swipe from the screen's edge", () => {
    expect(TOP_LEVEL_SCREEN.gestureEnabled).toBe(false);
  });
});

// A tablet's titlebar goes back and forward, so a page's own bar would hold only a second
// back arrow: no page has one there, as on the desktop.
describe("the system bar", () => {
  it("is left out on a tablet and kept on a phone", () => {
    expect(pageBar(true)).toEqual({ headerShown: false });
    expect(pageBar(false)).toEqual({ headerShown: true });
  });
});
