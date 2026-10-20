import { createPage, createSpace, createTask, setPinned, trashEntity } from "@nookly/shared/data";
import { fireEvent } from "expo-router/testing-library";
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
});
