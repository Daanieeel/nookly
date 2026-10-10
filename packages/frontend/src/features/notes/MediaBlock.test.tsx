import { fireEvent, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { makeEntity, makeFile } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
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

async function open(type: "image" | "file", name: string) {
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
      content: [{ type, attrs: { blockId: "m1", rows: `[${name}](mention:f1)` } }],
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
