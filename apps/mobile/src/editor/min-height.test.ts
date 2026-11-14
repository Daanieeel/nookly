import { DESCRIPTION_HEIGHT, editorMinHeight } from "./LivePage.tsx";

describe("how tall an editor is at least", () => {
  // The bug: an item's description (a task's, a course's) kept 160 points and more under
  // its text, empty space that was not part of anything.
  it("keeps an item's description as tall as a line, no more", () => {
    expect(editorMinHeight(false, 300, 900)).toBe(DESCRIPTION_HEIGHT);
    expect(DESCRIPTION_HEIGHT).toBeLessThanOrEqual(48);
  });

  it("lets a page reach the bottom of the screen", () => {
    expect(editorMinHeight(true, 200, 900)).toBe(580);
  });
});
