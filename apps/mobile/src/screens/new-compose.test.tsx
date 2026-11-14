import {
  createLabel,
  createPage,
  createSpace,
  entityLabels,
  getEntity,
  listBlocks,
  listBookmarks,
  relatedItems,
} from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { Text } from "react-native";
import { renderScreens, testData } from "../test/render.tsx";
import { openRow } from "../test/sheet.ts";
import { NewBookmarkScreen, NewPageScreen } from "./NewScreens.tsx";

async function seeded() {
  const data = testData();
  const space = await createSpace(data.db, "Work", "#3b82f6");
  const label = await createLabel(data.db, space, "Reading");
  const page = await createPage(data.db, space, "note", "Meeting notes");
  return { data, space, label, page };
}

async function labelAndLink(screen: Awaited<ReturnType<typeof renderScreens>>) {
  await openRow(screen, "Labels");
  await fireEvent.press(await screen.findByRole("checkbox", { name: "Reading" }));
  await openRow(screen, "Link to");
  await fireEvent.changeText(await screen.findByLabelText("Search Items"), "Meeting");
  await fireEvent.press(await screen.findByRole("radio", { name: "Meeting notes" }));
}

// New Note and New Bookmark were plain forms (a Space, a field, a big button); they are
// the compose sheet of New Task and New Assignment, with labels and a link as pills.
describe("New Note in the compose sheet", () => {
  it("takes a title, its text, labels and a link, then opens the note", async () => {
    const { data, space, label, page } = await seeded();
    const screen = await renderScreens(
      {
        index: () => <NewPageScreen spaceId={space} type="note" />,
        "entity/[id]": () => <Text>Opened</Text>,
      },
      data,
    );
    await fireEvent.changeText(await screen.findByLabelText("Note title"), "Reading list");
    await fireEvent.changeText(screen.getByLabelText("Write something…"), "Three books");
    await labelAndLink(screen);
    await fireEvent.press(screen.getByRole("button", { name: "Create Note" }));
    expect(await screen.findByText("Opened")).toBeTruthy();
    const id = screen.getPathname().split("/").pop() ?? "";
    expect(await getEntity(data.db, id)).toMatchObject({ type: "note", title: "Reading list" });
    expect((await listBlocks(data.db, id)).map((b) => b.content)).toEqual(["Three books"]);
    expect((await entityLabels(data.db, id)).map((l) => l.id)).toEqual([label]);
    expect((await relatedItems(data.db, id)).map((r) => r.entity.id)).toEqual([page]);
  });
});

describe("New Bookmark in the compose sheet", () => {
  it("takes an address, a note, labels and a link", async () => {
    const { data, space, label, page } = await seeded();
    jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("", { status: 404 }));
    const screen = await renderScreens(
      { index: () => <NewBookmarkScreen spaceId={space} /> },
      data,
    );
    await fireEvent.changeText(await screen.findByLabelText("Address"), "nookly.app/docs");
    await fireEvent.changeText(screen.getByLabelText("Add a note…"), "Read later");
    await labelAndLink(screen);
    await fireEvent.press(screen.getByRole("button", { name: "Save Bookmark" }));
    await waitFor(async () => {
      const [bookmark] = await listBookmarks(data.db, space);
      expect(bookmark).toMatchObject({
        url: "https://nookly.app/docs",
        description: "Read later",
        labelIds: [label],
      });
      expect((await relatedItems(data.db, bookmark.entity.id)).map((r) => r.entity.id)).toEqual([
        page,
      ]);
    });
  });
});
