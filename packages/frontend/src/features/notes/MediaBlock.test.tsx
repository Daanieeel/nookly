import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { makeEntity, makeFile } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { useNavStore } from "#/lib/store/nav.ts";
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

  it("opens a file from its card, with Ctrl too", async () => {
    await open("file", "syllabus.pdf");
    const name = await screen.findByText("syllabus.pdf");
    fireEvent.click(name);
    expect(callsOf("plugin:opener|open_path")).toHaveLength(0);
    fireEvent.click(name, { ctrlKey: true });
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
