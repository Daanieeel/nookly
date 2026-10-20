import { createPage, createSpace } from "@nookly/shared/data";
import { fireEvent } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { SplitPane } from "./SplitPane.tsx";

describe("the second page of a split view", () => {
  it("shows an item beside the first, named, with a way to close it", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#0070f3");
    const page = await createPage(data.db, space, "note", "Meeting notes");
    let closed = 0;
    const screen = await renderScreens(
      { index: () => <SplitPane path={`/entity/${page}`} onClose={() => (closed += 1)} /> },
      data,
    );
    // Its name in the bar over it, and the item itself under that.
    expect(await screen.findAllByText("Meeting notes")).not.toHaveLength(0);
    expect(await screen.findByLabelText("Title")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Close Split View" }));
    expect(closed).toBe(1);
  });
});
