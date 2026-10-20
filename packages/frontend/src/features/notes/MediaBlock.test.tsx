import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { makeEntity, makeFile } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { currentTabs, useNavStore } from "#/lib/store/nav.ts";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { editorExtensions } from "./editor-extensions";

declare global {
  interface Window {
    /// What Tauri's IPC mock leaves on the window; the real one also has `convertFileSrc`.
    __TAURI_INTERNALS__: { convertFileSrc?: (path: string) => string };
  }
}

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

async function open(type: "image" | "file", name: string, attrs: Record<string, string> = {}) {
  // The IPC mock has no asset protocol; an imported copy loads from an asset URL.
  window.__TAURI_INTERNALS__.convertFileSrc = (path: string) => `asset://localhost${path}`;
  mockCommand(
    "get_file",
    makeFile({ localPath: `/data/files/${name}` }, { id: "f1", title: name }),
  );
  mockCommand("get_entity", makeEntity({ id: "f1", type: "file", title: name }));
  mockCommand("plugin:opener|open_path", null);
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: {
      type: "doc",
      content: [{ type, attrs: { blockId: "m1", rows: `[${name}](mention:f1)`, ...attrs } }],
    },
  });
  return renderWithProviders(<EditorContent editor={editor} />);
}

describe("opening media with Cmd or Ctrl and a click", () => {
  it("opens an image", async () => {
    await open("image", "campus.png");
    const image = await screen.findByRole("img", { name: "campus.png" });
    fireEvent.click(image);
    expect(callsOf("plugin:opener|open_path")).toHaveLength(0);
    fireEvent.click(image, { metaKey: true });
    expect(callsOf("plugin:opener|open_path")).toEqual([
      expect.objectContaining({ path: "/data/files/campus.png" }),
    ]);
  });

  // #166: a file block is a link to a file in Nookly, so Cmd or Ctrl opens that file's page in
  // a new tab; the toolbar's Open File still hands it to the system viewer.
  it("opens a file's page in a new tab from its card, with Ctrl too", async () => {
    mockCommand("touch_entity_opened", null);
    useNavStore.setState({ view: { kind: "dashboard" } });
    await open("file", "syllabus.pdf");
    const name = await screen.findByText("syllabus.pdf");
    for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) {
      const before = currentTabs(useNavStore.getState()).length;
      fireEvent.click(name, modifier);
      expect(currentTabs(useNavStore.getState())).toHaveLength(before + 1);
      expect(currentTabs(useNavStore.getState()).at(-1)?.view).toMatchObject({
        kind: "entity",
        entityId: "f1",
      });
    }
    // The page the click came from stays in front.
    expect(useNavStore.getState().view).toMatchObject({ kind: "dashboard" });
    expect(callsOf("plugin:opener|open_path")).toHaveLength(0);
  });

  it("opens a file from the toolbar in the system viewer", async () => {
    await open("file", "syllabus.pdf");
    fireEvent.click(await screen.findByRole("button", { name: "Open File" }));
    expect(callsOf("plugin:opener|open_path")).toEqual([
      expect.objectContaining({ path: "/data/files/syllabus.pdf" }),
    ]);
  });
});

describe("opening an embedded file in Nookly", () => {
  it("opens the file's page when its card is clicked", async () => {
    useNavStore.setState({ view: { kind: "dashboard" } });
    await open("file", "syllabus.pdf");
    fireEvent.click(await screen.findByText("syllabus.pdf"));
    expect(useNavStore.getState().view).toMatchObject({ kind: "entity", entityId: "f1" });
    expect(callsOf("plugin:opener|open_path")).toHaveLength(0);
  });

  it("has an Open in Nookly button on the toolbar", async () => {
    useNavStore.setState({ view: { kind: "dashboard" } });
    await open("image", "campus.png");
    fireEvent.click(await screen.findByRole("button", { name: "Open in Nookly" }));
    expect(useNavStore.getState().view).toMatchObject({ kind: "entity", entityId: "f1" });
  });
});

// #136: a file block opens its PDF on a chosen page, so the same file linked from
// different notes can start in different places.
describe("a file block that opens on a page", () => {
  const pageOf = () => editor?.getJSON().content?.[0]?.attrs?.page;
  const pageToOf = () => editor?.getJSON().content?.[0]?.attrs?.pageTo;

  it("opens the file on that page when its card is clicked", async () => {
    useNavStore.setState({ view: { kind: "dashboard" }, focusBlock: null });
    await open("file", "syllabus.pdf", { page: "12" });
    fireEvent.click(await screen.findByText("syllabus.pdf"));
    expect(useNavStore.getState().focusBlock).toMatchObject({ entityId: "f1", page: 12 });
  });

  it("opens from the toolbar on that page too", async () => {
    useNavStore.setState({ view: { kind: "dashboard" }, focusBlock: null });
    await open("file", "syllabus.pdf", { page: "3" });
    fireEvent.click(await screen.findByRole("button", { name: "Open in Nookly" }));
    expect(useNavStore.getState().focusBlock).toMatchObject({ entityId: "f1", page: 3 });
  });

  it("opens on the first page when none is set", async () => {
    useNavStore.setState({ view: { kind: "dashboard" }, focusBlock: null });
    await open("file", "syllabus.pdf");
    fireEvent.click(await screen.findByText("syllabus.pdf"));
    expect(useNavStore.getState().focusBlock).toBeNull();
  });

  it("sets the page from a field that takes digits only, and clears it again", async () => {
    const { user } = await open("file", "syllabus.pdf");
    const field = await screen.findByRole("textbox", { name: "Open on page" });
    expect(field).toHaveAttribute("placeholder", "...");
    expect(field).toHaveValue("");
    await user.type(field, "1a2");
    await waitFor(() => expect(pageOf()).toBe("12"));
    expect(field).toHaveValue("12");
    await user.clear(field);
    await waitFor(() => expect(pageOf()).toBeNull());
    await user.type(field, "0");
    await waitFor(() => expect(pageOf()).toBeNull());
  });

  // #169: an optional last page next to the first one. The file still opens on the first page;
  // the interval is for the reader of the page.
  it("sets the last page from a second field that takes digits only, and clears it again", async () => {
    const { user } = await open("file", "syllabus.pdf", { page: "3" });
    const field = await screen.findByRole("textbox", { name: "Open to page" });
    expect(field).toHaveAttribute("placeholder", "...");
    expect(field).toHaveValue("");
    await user.type(field, "9x");
    await waitFor(() => expect(pageToOf()).toBe("9"));
    expect(field).toHaveValue("9");
    expect(pageOf()).toBe("3");
    await user.clear(field);
    await waitFor(() => expect(pageToOf()).toBeNull());
    expect(pageOf()).toBe("3");
  });

  // The "to" sits right after the first number, however many digits it has.
  it("sizes each page field to its digits, so the to stays next to the first number", async () => {
    const { user } = await open("file", "syllabus.pdf");
    const first = await screen.findByRole("textbox", { name: "Open on page" });
    const width = () => first.style.getPropertyValue("--digits");
    const empty = width();
    await user.type(first, "123");
    await waitFor(() => expect(first).toHaveValue("123"));
    expect(width()).toBe("3ch");
    expect(empty).toBe("3ch");
    await user.type(first, "45");
    expect(width()).toBe("5ch");
  });

  it("opens on the first page of an interval", async () => {
    useNavStore.setState({ view: { kind: "dashboard" }, focusBlock: null });
    await open("file", "syllabus.pdf", { page: "3", pageTo: "9" });
    fireEvent.click(await screen.findByText("syllabus.pdf"));
    expect(useNavStore.getState().focusBlock).toMatchObject({ entityId: "f1", page: 3 });
  });

  it("shows the last page after the first and does not open the file when it is clicked", async () => {
    useNavStore.setState({ view: { kind: "dashboard" }, focusBlock: null });
    const { user } = await open("file", "syllabus.pdf", { page: "3", pageTo: "9" });
    const field = await screen.findByRole("textbox", { name: "Open to page" });
    expect(field).toHaveValue("9");
    await user.click(field);
    expect(useNavStore.getState().view).toMatchObject({ kind: "dashboard" });
  });

  it("reads Pages 3 to 9 as text when the block cannot be edited", async () => {
    await open("file", "syllabus.pdf", { page: "3", pageTo: "9" });
    editor?.setEditable(false);
    expect(await screen.findByText("Pages 3 to 9")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Open to page" })).toBeNull();
  });

  it("shows the field in the line under the name, in place of Stored in Nookly", async () => {
    await open("file", "syllabus.pdf");
    await screen.findByRole("textbox", { name: "Open on page" });
    expect(screen.queryByText("Stored in Nookly")).toBeNull();
  });

  it("does not open the file when the field is clicked", async () => {
    useNavStore.setState({ view: { kind: "dashboard" }, focusBlock: null });
    const { user } = await open("file", "syllabus.pdf");
    await user.click(await screen.findByRole("textbox", { name: "Open on page" }));
    expect(useNavStore.getState().view).toMatchObject({ kind: "dashboard" });
  });

  it("reads Page 12 as text when the block cannot be edited", async () => {
    await open("file", "syllabus.pdf", { page: "12" });
    editor?.setEditable(false);
    expect(await screen.findByText("Page 12")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Open on page" })).toBeNull();
  });

  it("does not offer a page for a file that is not shown page by page", async () => {
    await open("file", "notes.txt");
    await screen.findByText("notes.txt");
    expect(screen.queryByRole("textbox", { name: "Open on page" })).toBeNull();
  });

  it("does not offer a page on an image", async () => {
    await open("image", "campus.png");
    await screen.findByRole("img", { name: "campus.png" });
    expect(screen.queryByRole("textbox", { name: "Open on page" })).toBeNull();
  });
});
