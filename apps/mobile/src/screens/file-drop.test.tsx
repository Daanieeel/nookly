import { createSpace, listFiles } from "@nookly/shared/data";
import { Directory, File, Paths } from "expo-file-system";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { FileRows } from "./FileScreens.tsx";

// 10.3: files dragged in from another app (Files, Mail, Safari) land on a tablet's Files page.
describe("files dropped from another app", () => {
  it("adds what is dropped on a tablet's Files page, showing where it will land", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const screen = await renderScreens({ index: () => <FileRows spaceId={space} /> }, data, "/", {
      width: 1032,
    });
    // What the system copies into the temporary folder before handing the drop over.
    const folder = new Directory(Paths.cache, "dropped-1");
    folder.create({ intermediates: true, idempotent: true });
    const dropped = new File(folder, "notes.pdf");
    dropped.write("%PDF-1.7");
    const target = await screen.findByTestId("file-drop");
    act(() => fireEvent(target, "dropActive", { nativeEvent: { active: true } }));
    expect(screen.getByText("Drop to Add to Uni")).toBeTruthy();
    await act(async () =>
      fireEvent(target, "filesDropped", {
        nativeEvent: { files: [{ uri: dropped.uri, name: "notes.pdf" }] },
      }),
    );
    await waitFor(async () =>
      expect((await listFiles(data.db, space)).map((f) => f.originalFilename)).toEqual([
        "notes.pdf",
      ]),
    );
    act(() => fireEvent(target, "dropActive", { nativeEvent: { active: false } }));
    expect(screen.queryByText("Drop to Add to Uni")).toBeNull();
  });

  it("leaves the phone's Files page as it was", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const screen = await renderScreens({ index: () => <FileRows spaceId={space} /> }, data);
    await screen.findByText("No Files");
    expect(screen.queryByTestId("file-drop")).toBeNull();
  });
});
