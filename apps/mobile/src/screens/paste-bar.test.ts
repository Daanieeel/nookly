import { SPACE } from "../ui/tokens.ts";
import { PASTE_BAR_BOTTOM } from "./BookmarkList.tsx";

// The paste bar sat above the home indicator, far from the phone's rounded corners; it sits
// as far from the bottom as from the sides, so its round ends follow the screen's corners.
describe("the Bookmarks paste bar", () => {
  it("sits as far from the bottom as from the sides", () => {
    expect(PASTE_BAR_BOTTOM).toBe(SPACE.md);
  });
});
