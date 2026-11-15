import { RADIUS, SPACE } from "../ui/tokens.ts";
import { PASTE_BAR_BOTTOM, PASTE_BAR_HEIGHT, PASTE_BAR_RADIUS } from "./BookmarkList.tsx";

// The paste bar first sat high above the home indicator, then right down at the screen's
// corners, where the user found it too low. It sits a little higher than its side margin.
describe("the Bookmarks paste bar", () => {
  it("sits a little higher than it is from the sides", () => {
    expect(PASTE_BAR_BOTTOM).toBe(SPACE.xl);
    expect(PASTE_BAR_BOTTOM).toBeGreaterThan(SPACE.md);
  });

  // A squircle with the regular corners, not a pill: its corners run alongside the Save
  // button's, which sits 6pt inside it.
  it("is a squircle around its button, not a pill", () => {
    expect(PASTE_BAR_RADIUS).toBe(RADIUS.control + 6);
    expect(PASTE_BAR_RADIUS).toBeLessThan(PASTE_BAR_HEIGHT / 2);
  });
});
