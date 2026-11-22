import {
  addFile,
  attachLabel,
  createCourse,
  createDeck,
  createLabel,
  createPage,
  createRelationship,
  createSpace,
  createView,
  entityLabels,
  listFiles,
  listViews,
  relatedItems,
} from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { RecordingClipboard, RecordingMenu } from "../test/menu.ts";
import { barLabels, pressBarButton, renderScreens, testData } from "../test/render.tsx";
import { choose, openRow } from "../test/sheet.ts";
import type { DocumentScanner } from "../ui/scanner.tsx";
import { EntityScreen } from "./EntityScreen.tsx";
import { FilePasteBar, FileRows } from "./FileScreens.tsx";
import { FILE_DEFAULT } from "./file-view.ts";
import { forgetPreferences, writePreference } from "../data/preferences.ts";
import { starterViewsKey } from "./use-starter-views.ts";
import { ModuleScreen } from "./ModuleScreen.tsx";

describe("files", () => {
  it("lists a Space's files with what each is, and which are still downloading", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    writePreference(starterViewsKey(space), true);
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

  // A tablet's list of files is the desktop's table (5.5): name, kind, where it is, added.
  it("lists files as a table on a tablet", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    writePreference(starterViewsKey(space), true);
    await addFile(data.db, space, "notes.pdf", "file:///docs/files/aaa-notes.pdf");
    writePreference(`files.display.${space}`, { ...FILE_DEFAULT, layout: "list" });
    const screen = await renderScreens({ index: () => <FileRows spaceId={space} /> }, data, "/", {
      width: 1032,
    });
    expect(await screen.findByRole("button", { name: "notes.pdf" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Added/ })).toBeTruthy();
    expect(screen.getByText("PDF")).toBeTruthy();
    forgetPreferences();
  });

  // The desktop's Filter (kind, labels) and Display (layout, grouping, ordering), D65.
  it("narrows to a kind and a label, and shows a list ordered by name", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    writePreference(starterViewsKey(space), true);
    await addFile(data.db, space, "zebra.pdf", "file:///docs/files/z.pdf");
    const tagged = await addFile(data.db, space, "apple.pdf", "file:///docs/files/a.pdf");
    await addFile(data.db, space, "photo.png", "file:///docs/files/p.png");
    await attachLabel(data.db, tagged, await createLabel(data.db, space, "Exam"));
    const screen = await renderScreens({ index: () => <FileRows spaceId={space} /> }, data);
    expect(await screen.findByRole("button", { name: "photo.png" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    await openRow(screen, "Kind");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "PDF" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "photo.png" })).toBeNull());
    await fireEvent.press(screen.getByRole("button", { name: "Display" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "List" }));
    await choose(screen, "Ordering", "Name");
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("button", { name: /^(apple|zebra)\.pdf$/ })
          .map((b) => b.props.accessibilityLabel),
      ).toEqual(["apple.pdf", "zebra.pdf"]),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Remove Kind Filter" }));
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    await openRow(screen, "Labels");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Exam" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "zebra.pdf" })).toBeNull());
  });

  // Every list filters on what its items have (D73).
  it("filters on pinned, created and updated too", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    writePreference(starterViewsKey(space), true);
    const old = await addFile(data.db, space, "old.pdf", "file:///docs/files/old.pdf");
    await addFile(data.db, space, "new.pdf", "file:///docs/files/new.pdf");
    data.driver.exec(
      "UPDATE entities SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?",
      old,
    );
    const screen = await renderScreens({ index: () => <FileRows spaceId={space} /> }, data);
    expect(await screen.findByRole("button", { name: "old.pdf" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    for (const name of ["Kind", "Labels", "Pinned", "Created", "Updated"]) {
      expect(await screen.findByRole("button", { name: new RegExp(`^${name}`) })).toBeTruthy();
    }
    await openRow(screen, "Created");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Earlier" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "new.pdf" })).toBeNull());
    expect(screen.getByRole("button", { name: "old.pdf" })).toBeTruthy();
  });

  // D81: a View of some labels is built in a sheet, never a row of every label.
  it("makes a View from a name and labels, and shows only the labels picked", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    writePreference(starterViewsKey(space), true);
    const uni = await createLabel(data.db, space, "Uni");
    const math = await createLabel(data.db, space, "Math");
    const both = await addFile(data.db, space, "algebra.pdf", "file:///docs/files/a.pdf");
    const one = await addFile(data.db, space, "essay.pdf", "file:///docs/files/e.pdf");
    await addFile(data.db, space, "loose.pdf", "file:///docs/files/l.pdf");
    await attachLabel(data.db, both, uni);
    await attachLabel(data.db, both, math);
    await attachLabel(data.db, one, uni);
    const screen = await renderScreens({ index: () => <FileRows spaceId={space} /> }, data);
    expect(await screen.findByRole("button", { name: "loose.pdf" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /^Uni/ })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "New View" }));
    await fireEvent.changeText(await screen.findByLabelText("View name"), "Maths");
    await fireEvent.press(screen.getByRole("button", { name: /^Labels/ }));
    // Most used first, each with how many files carry it.
    expect(await screen.findByRole("checkbox", { name: "Uni, 2 files" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Math, 1 file" }));
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("button", { name: "Labels, Math" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Create View" }));
    await waitFor(async () => {
      const saved = (await listViews(data.db, { spaceId: space, module: "files" })).find(
        (v) => v.entity.title === "Maths",
      );
      expect(JSON.parse(saved?.config ?? "{}").display.shelf).toEqual([math]);
    });
    // The new View opens, its label shown on its own.
    await waitFor(() => expect(screen.queryByRole("button", { name: "essay.pdf" })).toBeNull());
    expect(screen.getByRole("button", { name: "algebra.pdf" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^Maths/, selected: true })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /^Uni/ })).toBeNull();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Math ×" }));
    expect(await screen.findByRole("button", { name: "loose.pdf" })).toBeTruthy();
  });

  it("changes the labels shown, and nudges quietly toward the files without one", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    writePreference(starterViewsKey(space), true);
    const uni = await createLabel(data.db, space, "Uni");
    const one = await addFile(data.db, space, "essay.pdf", "file:///docs/files/e.pdf");
    await addFile(data.db, space, "loose.pdf", "file:///docs/files/l.pdf");
    await attachLabel(data.db, one, uni);
    await createView(data.db, space, {
      title: "Uni files",
      module: "files",
      config: JSON.stringify({ filters: [], display: { shelf: [uni] } }),
    });
    const screen = await renderScreens({ index: () => <FileRows spaceId={space} /> }, data);
    await fireEvent.press(await screen.findByRole("tab", { name: /^Uni files/ }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "loose.pdf" })).toBeNull());
    await fireEvent.press(screen.getByRole("button", { name: "Change Labels" }));
    // Taking off the last label keeps the sheet open to pick another.
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Uni, 1 file" }));
    await fireEvent.press(
      await screen.findByRole("checkbox", { name: "Files without a label, 1 file" }),
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "essay.pdf" })).toBeNull());
    expect(screen.getByRole("button", { name: "loose.pdf" })).toBeTruthy();
    expect(screen.getByText(/Give these a label/)).toBeTruthy();
  });

  it("groups by label, a file under each of its labels", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    writePreference(starterViewsKey(space), true);
    const file = await addFile(data.db, space, "algebra.pdf", "file:///docs/files/a.pdf");
    await attachLabel(data.db, file, await createLabel(data.db, space, "Math"));
    await attachLabel(data.db, file, await createLabel(data.db, space, "Exam"));
    await addFile(data.db, space, "loose.pdf", "file:///docs/files/l.pdf");
    const screen = await renderScreens({ index: () => <FileRows spaceId={space} /> }, data);
    expect(await screen.findByRole("button", { name: "loose.pdf" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Display" }));
    await choose(screen, "Grouping", "Label");
    expect(await screen.findByRole("header", { name: "Math" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "Exam" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "No label" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "algebra.pdf" })).toHaveLength(2);
  });

  // The desktop finds files by searching, and shelves them by course: the phone does too.
  describe("finding and filing files", () => {
    async function uni() {
      const data = testData();
      const space = await createSpace(data.db, "Uni", "#3b82f6");
      writePreference(starterViewsKey(space), true);
      const maths = await createCourse(data.db, space, "Maths");
      const algebra = await addFile(data.db, space, "algebra.pdf", "file:///docs/files/a.pdf");
      await createRelationship(data.db, maths, algebra, "attached-file");
      await addFile(data.db, space, "receipt.pdf", "file:///docs/files/r.pdf");
      return { data, space };
    }

    it("narrows to what the search field finds", async () => {
      const { data, space } = await uni();
      const screen = await renderScreens({ index: () => <FileRows spaceId={space} /> }, data);
      expect(await screen.findByRole("button", { name: "receipt.pdf" })).toBeTruthy();
      await fireEvent.changeText(screen.getByLabelText("Search files"), "alge");
      await waitFor(() => expect(screen.queryByRole("button", { name: "receipt.pdf" })).toBeNull());
      expect(screen.getByRole("button", { name: "algebra.pdf" })).toBeTruthy();
      // The course a file belongs to is searchable too.
      await fireEvent.changeText(screen.getByLabelText("Search files"), "maths");
      await waitFor(() => expect(screen.getByRole("button", { name: "algebra.pdf" })).toBeTruthy());
      expect(screen.queryByRole("button", { name: "receipt.pdf" })).toBeNull();
    });

    it("groups by course, the files of none last", async () => {
      const { data, space } = await uni();
      const screen = await renderScreens({ index: () => <FileRows spaceId={space} /> }, data);
      await screen.findByRole("button", { name: "receipt.pdf" });
      await fireEvent.press(screen.getByRole("button", { name: "Display" }));
      await choose(screen, "Grouping", "Course");
      expect(await screen.findByRole("header", { name: "Maths" })).toBeTruthy();
      expect(screen.getByRole("header", { name: "No course" })).toBeTruthy();
    });

    it("narrows to a course from Filter", async () => {
      const { data, space } = await uni();
      const screen = await renderScreens({ index: () => <FileRows spaceId={space} /> }, data);
      await screen.findByRole("button", { name: "receipt.pdf" });
      await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
      await openRow(screen, "Course");
      await fireEvent.press(await screen.findByRole("checkbox", { name: "Maths" }));
      await waitFor(() => expect(screen.queryByRole("button", { name: "receipt.pdf" })).toBeNull());
      expect(screen.getByRole("button", { name: "algebra.pdf" })).toBeTruthy();
    });
  });

  it("opens a Files View saved on the desktop, and saves one the desktop reads", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    writePreference(starterViewsKey(space), true);
    const exam = await createLabel(data.db, space, "Exam");
    const tagged = await addFile(data.db, space, "exam.pdf", "file:///docs/files/x.pdf");
    await attachLabel(data.db, tagged, exam);
    await addFile(data.db, space, "other.pdf", "file:///docs/files/o.pdf");
    await createView(data.db, space, {
      title: "Exam files",
      module: "files",
      config: JSON.stringify({ filters: [], display: { layout: "list", shelf: [exam] } }),
    });
    const screen = await renderScreens({ index: () => <FileRows spaceId={space} /> }, data);
    await fireEvent.press(await screen.findByRole("tab", { name: /^Exam files/ }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "other.pdf" })).toBeNull());
    // Changing its labels waits in the save bar, which saves it into the View.
    await fireEvent.press(screen.getByRole("button", { name: "Change Labels" }));
    await fireEvent.press(
      await screen.findByRole("checkbox", { name: "Files without a label, 1 file" }),
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "exam.pdf" })).toBeNull());
    expect(screen.getByRole("button", { name: "other.pdf" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      const saved = (await listViews(data.db, { spaceId: space, module: "files" })).find(
        (v) => v.entity.title === "Exam files",
      );
      expect(JSON.parse(saved?.config ?? "{}").display.shelf).toEqual(["none"]);
    });
  });

  it("adds a link to a file kept elsewhere, and sends a web page to the bookmarks", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    writePreference(starterViewsKey(space), true);
    const screen = await renderScreens(
      {
        index: () => (
          <>
            <FileRows spaceId={space} />
            <FilePasteBar spaceId={space} />
          </>
        ),
      },
      data,
    );
    // The bar floats as on Bookmarks; files come from the + in the bar at the top.
    expect(await screen.findByTestId("floating-field")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Choose Files" })).toBeNull();
    const field = screen.getByLabelText("Paste a link to add it");
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
    writePreference(starterViewsKey(space), true);
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
    writePreference(starterViewsKey(space), true);
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
    writePreference(starterViewsKey(space), true);
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
    writePreference(starterViewsKey(space), true);
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
    writePreference(starterViewsKey(space), true);
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
    writePreference(starterViewsKey(space), true);
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
