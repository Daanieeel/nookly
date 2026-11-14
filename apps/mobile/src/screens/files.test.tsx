import {
  addFile,
  createCourse,
  createDeck,
  createLabel,
  createPage,
  createSpace,
  entityLabels,
  listFiles,
  relatedItems,
} from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { RecordingClipboard, RecordingMenu } from "../test/menu.ts";
import { barLabels, pressBarButton, renderScreens, testData } from "../test/render.tsx";
import { openRow } from "../test/sheet.ts";
import type { DocumentScanner } from "../ui/scanner.tsx";
import { EntityScreen } from "./EntityScreen.tsx";
import { FileRows } from "./FileScreens.tsx";
import { ModuleScreen } from "./ModuleScreen.tsx";

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

describe("scanning a document", () => {
  const scanner = (uri: string | null): DocumentScanner => ({
    available: true,
    scan: jest.fn(async () => uri),
  });
  const filesPage = (space: string, data: ReturnType<typeof testData>, scan: DocumentScanner) =>
    renderScreens(
      { "module/[spaceId]/[module]": () => <ModuleScreen spaceId={space} module="files" /> },
      data,
      `/module/${space}/files`,
      { scanner: scan },
    );

  it("offers Scan next to Add Files only where the phone can scan", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const screen = await filesPage(space, data, { available: false, scan: jest.fn() });
    await pressBarButton(screen, "Add Files");
    expect(barLabels(screen)).not.toContain("Scan Document");
    const scanning = await filesPage(space, data, scanner(null));
    await pressBarButton(scanning, "Scan Document");
    expect(barLabels(scanning)).toEqual(expect.arrayContaining(["Scan Document", "Add Files"]));
  });

  it("keeps the scan at once, then names it, labels it and links it as asked", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    await createLabel(data.db, space, "Contracts");
    const page = await createPage(data.db, space, "note", "Moving house");
    const screen = await filesPage(space, data, scanner("file:///docs/files/abc-scan.pdf"));
    await pressBarButton(screen, "Scan Document");
    // In the Space before the sheet is done, so it uploads while the person names it.
    await waitFor(async () => expect(await listFiles(data.db, space)).toHaveLength(1));
    const [scanned] = await listFiles(data.db, space);
    expect(scanned.localPath).toBe("file:///docs/files/abc-scan.pdf");
    expect(scanned.originalFilename).toMatch(/^Scan .+\.pdf$/);
    const name = await screen.findByLabelText("Name");
    expect(name.props.value).toBe(scanned.originalFilename?.replace(/\.pdf$/, ""));
    await fireEvent.changeText(name, "Lease contract");
    await openRow(screen, "Labels");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Contracts" }));
    // The labels float over the sheet as a card; its round button closes it.
    await fireEvent.press(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
    await openRow(screen, "Link to");
    await fireEvent.changeText(await screen.findByLabelText("Search Items"), "Moving");
    await fireEvent.press(await screen.findByRole("radio", { name: "Moving house" }));
    // Nothing the sheet holds is applied before Save.
    expect((await listFiles(data.db, space))[0].originalFilename).not.toBe("Lease contract.pdf");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await waitFor(async () =>
      expect((await listFiles(data.db, space))[0].originalFilename).toBe("Lease contract.pdf"),
    );
    expect((await entityLabels(data.db, scanned.entity.id)).map((l) => l.name)).toEqual([
      "Contracts",
    ]);
    expect((await relatedItems(data.db, scanned.entity.id)).map((r) => r.entity.id)).toEqual([
      page,
    ]);
  });

  it("adds nothing when the person backs out of the camera", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const scan = scanner(null);
    const screen = await filesPage(space, data, scan);
    await pressBarButton(screen, "Scan Document");
    await waitFor(() => expect(scan.scan).toHaveBeenCalled());
    expect(await listFiles(data.db, space)).toHaveLength(0);
    expect(screen.queryByLabelText("Name")).toBeNull();
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
