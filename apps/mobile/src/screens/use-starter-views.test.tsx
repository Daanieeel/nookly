import { addFile, createSpace, listViews, trashEntity } from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { FileRows } from "./FileScreens.tsx";

// Unsorted was a chip on the Files page; it is a view the app adds, next to the user's own.
describe("the Unsorted view Files comes with", () => {
  it("is added once, counts the files still to file and shows just those", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    await addFile(data.db, space, "loose.pdf", "file:///docs/files/l.pdf");
    const screen = await renderScreens({ index: () => <FileRows spaceId={space} /> }, data);
    const tab = await screen.findByRole("tab", { name: "Unsorted 1" });
    expect(screen.queryByRole("button", { name: /^Unsorted/ })).toBeNull();
    await fireEvent.press(tab);
    expect(await screen.findByRole("button", { name: "loose.pdf" })).toBeTruthy();
    expect(await listViews(data.db, { spaceId: space, module: "files" })).toHaveLength(1);
    screen.unmount();
    // Opened again, it is not added a second time.
    const again = await renderScreens({ index: () => <FileRows spaceId={space} /> }, data);
    await again.findByRole("tab", { name: "Unsorted 1" });
    await waitFor(async () =>
      expect(await listViews(data.db, { spaceId: space, module: "files" })).toHaveLength(1),
    );
  });

  it("is not added back once it was deleted", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    await addFile(data.db, space, "loose.pdf", "file:///docs/files/l.pdf");
    const first = await renderScreens({ index: () => <FileRows spaceId={space} /> }, data);
    await first.findByRole("tab", { name: "Unsorted 1" });
    const [view] = await listViews(data.db, { spaceId: space, module: "files" });
    await trashEntity(data.db, view?.entity.id ?? "");
    first.unmount();
    const second = await renderScreens({ index: () => <FileRows spaceId={space} /> }, data);
    await second.findByRole("button", { name: "loose.pdf" });
    expect(second.queryByRole("tab", { name: /^Unsorted/ })).toBeNull();
    expect(await listViews(data.db, { spaceId: space, module: "files" })).toHaveLength(0);
  });
});
