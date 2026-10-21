import { addFile, createCourse, createDeck, createSpace, listFiles } from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { RecordingClipboard, RecordingMenu } from "../test/menu.ts";
import { pressBarButton, renderScreens, testData } from "../test/render.tsx";
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
    expect(await screen.findByRole("button", { name: "notes.pdf" })).toBeTruthy();
    expect(screen.getByText(/^PDF · /)).toBeTruthy();
    expect(screen.getByRole("button", { name: "slides.pptx" })).toBeTruthy();
    expect(screen.getByText(/^Downloading from your account · /)).toBeTruthy();
  });

  it("adds a link to a file kept elsewhere, and sends a web page to the bookmarks", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const screen = await renderScreens({ index: () => <FileRows spaceId={space} /> }, data);
    const field = await screen.findByLabelText("Paste a link");
    await fireEvent.changeText(field, "https://example.com/blog/post");
    await fireEvent(field, "submitEditing");
    expect(await screen.findByText(/web page/)).toBeTruthy();
    await fireEvent.changeText(field, "https://www.dropbox.com/s/abc/Report.pdf?dl=0");
    await fireEvent(field, "submitEditing");
    expect(await screen.findByRole("button", { name: "Report.pdf" })).toBeTruthy();
    expect(screen.getByText(/^LINK$/)).toBeTruthy();
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

describe("saving as a Nookly file", () => {
  it("is offered for pages, tasks, decks and assignments, and for nothing else", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const deck = await createDeck(data.db, space, "Sorting");
    const course = await createCourse(data.db, space, "Algorithms");
    const deckMenu = new RecordingMenu();
    const deckScreen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={deck} /> },
      data,
      `/entity/${deck}`,
      { menu: deckMenu },
    );
    await pressBarButton(deckScreen, "More");
    expect(deckMenu.labels()).toContain("Save as Nookly Deck");
    const courseMenu = new RecordingMenu();
    const courseScreen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={course} /> },
      data,
      `/entity/${course}`,
      { menu: courseMenu },
    );
    await pressBarButton(courseScreen, "More");
    expect(courseMenu.labels()).toContain("Pin");
    expect(courseMenu.labels().some((l) => l.startsWith("Save as Nookly"))).toBe(false);
  });
});

describe("copying a link", () => {
  it("puts a mention of the item on the clipboard, as the desktop does", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const deck = await createDeck(data.db, space, "Sorting");
    const menu = new RecordingMenu();
    const clipboard = new RecordingClipboard();
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={deck} /> },
      data,
      `/entity/${deck}`,
      { menu, clipboard },
    );
    await pressBarButton(screen, "More");
    menu.choose("Copy Link");
    expect(clipboard.copied).toEqual([`[Sorting](mention:${deck})`]);
  });
});
