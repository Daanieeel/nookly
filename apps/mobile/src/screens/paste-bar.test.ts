import { SPACE } from "../ui/tokens.ts";
import { PASTE_BAR_BOTTOM } from "./BookmarkList.tsx";

// The paste bar first sat high above the home indicator, then right down at the screen's
// corners, where the user found it too low. It sits a little higher than its side margin.
describe("the Bookmarks paste bar", () => {
  it("sits a little higher than it is from the sides", () => {
    expect(PASTE_BAR_BOTTOM).toBe(SPACE.xl);
    expect(PASTE_BAR_BOTTOM).toBeGreaterThan(SPACE.md);
  });
});
