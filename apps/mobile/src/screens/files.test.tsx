import { addFile, createSpace, listFiles } from "@nookly/shared/data";
import { waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { EntityScreen } from "./EntityScreen.tsx";
import { FileRows } from "./FileScreens.tsx";

describe("files", () => {
  it("lists a Space's files with what each is, and which are still downloading", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    await addFile(data.db, space, "notes.pdf", "file:///docs/files/aaa-notes.pdf");
    const remote = await addFile(
      data.db,
      space,
      "slides.pptx",
      "file:///docs/files/bbb-slides.pptx",
    );
    // Another device's file: in the account, not on this phone yet.
    data.driver.rows(
      "UPDATE files SET local_path = NULL, blob = 'abc' WHERE entity_id = ?",
      remote,
    );
    const screen = await renderScreens({ index: () => <FileRows spaceId={space} /> }, data);
    expect(await screen.findByRole("button", { name: "notes.pdf, PDF" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "slides.pptx, Downloading from your account" }),
    ).toBeTruthy();
  });

  it("opens a file's own page with its state and a way to open it elsewhere", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const id = await addFile(data.db, space, "notes.pdf", "file:///docs/files/aaa-notes.pdf");
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={id} /> },
      data,
      `/entity/${id}`,
    );
    expect(await screen.findByRole("button", { name: "Open In…" })).toBeTruthy();
    await waitFor(async () => expect(await listFiles(data.db)).toHaveLength(1));
  });
});
