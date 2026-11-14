import { createPage, createSpace, createTask, setPinned, trashEntity } from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { openRow } from "../test/sheet.ts";
import { renderScreens, testData } from "../test/render.tsx";
import { PinnedScreen } from "./PinnedScreen.tsx";
import { TrashScreen } from "./TrashScreen.tsx";

describe("the Pinned page", () => {
  it("lists what is pinned by Space and module", async () => {
    const data = testData();
    const work = await createSpace(data.db, "Work", "#3b82f6");
    await setPinned(data.db, await createTask(data.db, work, "Quarterly report"), true);
    await setPinned(data.db, await createPage(data.db, work, "note", "Meeting notes"), true);
    const screen = await renderScreens({ index: () => <PinnedScreen /> }, data);
    expect(await screen.findByRole("button", { name: "Work" })).toBeTruthy();
    expect(screen.getByText("Tasks")).toBeTruthy();
    expect(screen.getByText("Notes")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Quarterly report/ })).toBeTruthy();
  });

  it("says when nothing is pinned", async () => {
    const screen = await renderScreens({ index: () => <PinnedScreen /> }, testData());
    expect(await screen.findByText(/Nothing pinned yet/)).toBeTruthy();
  });
});

describe("the Trash page", () => {
  it("names what each item was and where, and narrows by what you type", async () => {
    const data = testData();
    const work = await createSpace(data.db, "Work", "#3b82f6");
    await trashEntity(data.db, await createTask(data.db, work, "Old task"));
    await trashEntity(data.db, await createPage(data.db, work, "note", "Old note"));
    const screen = await renderScreens({ index: () => <TrashScreen /> }, data);
    expect(await screen.findByRole("button", { name: /^Old task, Task · Work/ })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Filter Trash"), "note");
    expect(screen.queryByRole("button", { name: /^Old task/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Old note, Note · Work/ })).toBeTruthy();
  });

  // The desktop's Filter: what kind of item, and which Space (D65).
  it("narrows to a type and a Space from Filter", async () => {
    const data = testData();
    const work = await createSpace(data.db, "Work", "#3b82f6");
    const home = await createSpace(data.db, "Home", "#22c55e");
    await trashEntity(data.db, await createTask(data.db, work, "Old task"));
    await trashEntity(data.db, await createPage(data.db, work, "note", "Old note"));
    await trashEntity(data.db, await createPage(data.db, home, "note", "Home note"));
    const screen = await renderScreens({ index: () => <TrashScreen /> }, data);
    expect(await screen.findByRole("button", { name: /^Old task/ })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    await openRow(screen, "Type");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Note" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Old task/ })).toBeNull());
    // Filter again closes the sheet, the third time opens it afresh.
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    await openRow(screen, "Space");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Home" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Old note/ })).toBeNull());
    expect(screen.getByRole("button", { name: /^Home note/ })).toBeTruthy();
  });
});
