import { createRelationship, createSpace, createTask } from "@nookly/shared/data";
import { fireEvent } from "expo-router/testing-library";
import { EntityScreen } from "../screens/EntityScreen.tsx";
import { RecordingMenu } from "../test/menu.ts";
import { renderScreens, testData } from "../test/render.tsx";

async function setup() {
  const data = testData();
  const space = await createSpace(data.db, "Work", "#0070f3");
  const task = await createTask(data.db, space, "Write report");
  const other = await createTask(data.db, space, "Send report");
  await createRelationship(data.db, task, other, "blocks");
  return { data, task };
}

describe("the details of an item on a phone", () => {
  it("wait behind the page, and the menu brings them out", async () => {
    const { data, task } = await setup();
    const menu = new RecordingMenu();
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={task} /> },
      data,
      `/entity/${task}`,
      { menu, width: 390 },
    );
    await fireEvent.press(await screen.findByRole("button", { name: "More" }));
    expect(menu.labels()[0]).toBe("Show Details");
    // The details are in the tree behind the page, with what the item is linked to.
    expect(await screen.findByText("Send report")).toBeTruthy();
    expect(screen.getByLabelText("Details")).toBeTruthy();
  });

  it("do not repeat on the page: its links are only in the details", async () => {
    const { data, task } = await setup();
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={task} /> },
      data,
      `/entity/${task}`,
      { width: 390 },
    );
    // Once, in the details behind the page.
    expect(await screen.findAllByText("Related")).toHaveLength(1);
  });
});
