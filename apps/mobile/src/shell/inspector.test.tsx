import { createRelationship, createSpace, createTask } from "@nookly/shared/data";
import { renderScreens, testData } from "../test/render.tsx";
import { EntityScreen } from "../screens/EntityScreen.tsx";
import { InspectorShownProvider } from "../ui/pane.tsx";
import { Inspector } from "./inspector.tsx";

async function setup() {
  const data = testData();
  const space = await createSpace(data.db, "Work", "#0070f3");
  const task = await createTask(data.db, space, "Write report");
  const other = await createTask(data.db, space, "Send report");
  await createRelationship(data.db, task, other, "blocks");
  return { data, task, other };
}

describe("the details pane", () => {
  it("lists labels and what the item is linked to", async () => {
    const { data, task } = await setup();
    const screen = await renderScreens({ index: () => <Inspector id={task} /> }, data);
    expect(await screen.findByText("Details")).toBeTruthy();
    expect(await screen.findByText("Labels")).toBeTruthy();
    expect(await screen.findByText("Related")).toBeTruthy();
    expect(await screen.findByText("Send report")).toBeTruthy();
  });

  it("takes labels and links off the page while it is beside it", async () => {
    const { data, task } = await setup();
    const alone = await renderScreens({ index: () => <EntityScreen id={task} /> }, data);
    // In the details behind the page, which hide them from screen readers while closed.
    expect(await alone.findByText("Related", { includeHiddenElements: true })).toBeTruthy();
    alone.unmount();
    const beside = await renderScreens(
      {
        index: () => (
          <InspectorShownProvider value>
            <EntityScreen id={task} />
          </InspectorShownProvider>
        ),
      },
      data,
    );
    expect(await beside.findByLabelText("Title")).toBeTruthy();
    expect(beside.queryByText("Related")).toBeNull();
    expect(beside.queryByText("Labels")).toBeNull();
  });
});
