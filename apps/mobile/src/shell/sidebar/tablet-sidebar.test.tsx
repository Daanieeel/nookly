import {
  addSpaceModule,
  createSpace,
  createView,
  getEntity,
  listSpaces,
} from "@nookly/shared/data";
import { act, fireEvent, waitFor, within } from "expo-router/testing-library";
import { renderScreens, testData } from "../../test/render.tsx";
import { stepSpace } from "./space-step.ts";
import { noteTouch } from "../../ui/sheet/touch-point.ts";
import { TabletSidebar } from "./TabletSidebar.tsx";

jest.setTimeout(30_000);

async function setup(
  before?: (db: ReturnType<typeof testData>["db"], work: string) => Promise<void>,
) {
  const data = testData();
  const work = await createSpace(data.db, "Work", "#0070f3");
  const home = await createSpace(data.db, "Home", "#16a34a");
  await before?.(data.db, work);
  const screen = await renderScreens({ index: () => <TabletSidebar width={280} /> }, data, "/", {
    width: 1376,
    height: 1032,
  });
  return { ...screen, data, work, home };
}

// The desktop's sidebar at touch size (D83, 1.2): the Space's own menu as a popover with
// its steps, the Spaces switched by the desktop's keys, the top rows customized in place.
describe("the tablet's sidebar", () => {
  it("offers the desktop's Space menu, and renames the Space in a step of it", async () => {
    const screen = await setup();
    await fireEvent.press(await screen.findByRole("button", { name: "Work Menu" }));
    const popover = within(await screen.findByTestId("sheet-popover"));
    for (const label of ["Rename", "Change Icon", "Change Color", "Labels", "Add Module"]) {
      expect(popover.getByText(label)).toBeTruthy();
    }
    expect(popover.getByText("Delete Space")).toBeTruthy();
    await fireEvent.press(popover.getByText("Rename"));
    const field = await screen.findByLabelText("Name");
    await fireEvent.changeText(field, "Office");
    await fireEvent.press(screen.getByRole("button", { name: "Rename" }));
    await waitFor(async () =>
      expect((await listSpaces(screen.data.db)).map((s) => s.name)).toContain("Office"),
    );
  });

  it("shows the next Space with the desktop's keys", async () => {
    const screen = await setup();
    expect(await screen.findByRole("button", { name: "Work Menu" })).toBeTruthy();
    act(() => stepSpace(1));
    expect(await screen.findByRole("button", { name: "Home Menu" })).toBeTruthy();
    act(() => stepSpace(-1));
    expect(await screen.findByRole("button", { name: "Work Menu" })).toBeTruthy();
  });

  it("customizes its top rows in a popover", async () => {
    const screen = await setup();
    await fireEvent.press(await screen.findByRole("button", { name: "Customize Sidebar" }));
    const popover = within(await screen.findByTestId("sheet-popover"));
    expect(popover.getByLabelText("Show Calendar")).toBeTruthy();
  });

  // A saved View's own menu (5.16): renamed in a step, its icon changed, deleted with Undo.
  it("renames a saved View from its menu", async () => {
    let view = "";
    const screen = await setup(async (db, work) => {
      await addSpaceModule(db, work, "tasks");
      view = await createView(db, work, { title: "Mine", module: "tasks", config: "{}" });
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Expand Tasks" }));
    const row = await screen.findByRole("button", { name: "Mine, saved View" });
    // A finger rests on the row: its menu floats there.
    noteTouch({ nativeEvent: { pageX: 120, pageY: 300 } });
    await fireEvent(row, "longPress");
    const popover = within(await screen.findByTestId("sheet-popover"));
    for (const label of ["Rename", "Change Icon", "Delete View"]) {
      expect(popover.getByText(label)).toBeTruthy();
    }
    await fireEvent.press(popover.getByText("Rename"));
    await fireEvent.changeText(await screen.findByLabelText("Name"), "Mine this week");
    await fireEvent.press(screen.getByRole("button", { name: "Rename" }));
    await waitFor(async () =>
      expect((await getEntity(screen.data.db, view))?.title).toBe("Mine this week"),
    );
  });
});
