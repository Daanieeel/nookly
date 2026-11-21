import { createPage, createSpace, createTask } from "@nookly/shared/data";
import { waitFor } from "expo-router/testing-library";
import { useFindBar } from "../editor/FindBar.tsx";
import { barLabels, pressBarButton, renderScreens, testData } from "../test/render.tsx";
import { EntityScreen } from "./EntityScreen.tsx";

// The desktop searches inside a Note or a Jot; the phone had no way to start it. The system's
// bar over the page carries a magnifying glass, ahead of the details and the more menu.
describe("find in a page", () => {
  beforeEach(() => useFindBar.setState({ open: false }));

  it("has a magnifying glass in the bar of a note and of a jot, which opens the find bar", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    for (const type of ["note", "jot"] as const) {
      const id = await createPage(data.db, space, type, "Moving house");
      const screen = await renderScreens({ index: () => <EntityScreen id={id} /> }, data);
      await waitFor(() => expect(barLabels(screen)).toContain("Find in Page"));
      await pressBarButton(screen, "Find in Page");
      expect(useFindBar.getState().open).toBe(true);
      await pressBarButton(screen, "Find in Page");
      expect(useFindBar.getState().open).toBe(false);
    }
  });

  it("is not there for an item that has no text to search", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const task = await createTask(data.db, space, "Write report");
    const screen = await renderScreens({ index: () => <EntityScreen id={task} /> }, data);
    await waitFor(() => expect(barLabels(screen)).toContain("More"));
    expect(barLabels(screen)).not.toContain("Find in Page");
  });
});
