import { createSpace, createTask } from "@nookly/shared/data";
import { fireEvent, within } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { EntityScreen } from "./EntityScreen.tsx";

// A tablet's item page (6): no system bar, its menu a popover hanging from the More button in
// the page's first row, even opened from a keyboard or VoiceOver.
describe("an item on a tablet", () => {
  it("opens its menu as a popover from its More button", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const task = await createTask(data.db, space, "Write report");
    const screen = await renderScreens({ index: () => <EntityScreen id={task} /> }, data, "/", {
      width: 1032,
    });
    await fireEvent.press(await screen.findByRole("button", { name: "More" }));
    const popover = within(await screen.findByTestId("sheet-popover"));
    expect(popover.getByText("Move to Trash")).toBeTruthy();
    expect(popover.getByText("Copy Link")).toBeTruthy();
  });
});
