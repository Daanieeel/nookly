import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as toast from "@nookly/ui/components/sonner";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { editorExtensions } from "./editor-extensions";

declare global {
  interface Window {
    __TAURI_INTERNALS__: { convertFileSrc?: (path: string) => string };
  }
}

const PATH = "/Users/daniel/Downloads/Handout_Woche3.pdf";

let editor: Editor | null = null;
beforeEach(() => {
  window.__TAURI_INTERNALS__.convertFileSrc = (path: string) => `asset://localhost${path}`;
  mockCommand("check_local_path", { state: "ok", message: "", name: "Handout_Woche3.pdf" });
  mockCommand("open_local_path", null);
  mockCommand("reveal_local_path", null);
});
afterEach(() => {
  editor?.destroy();
  vi.restoreAllMocks();
});

function open(type: "image" | "file" | "video" | "audio", rows: string) {
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: { type: "doc", content: [{ type, attrs: { blockId: "m1", rows } }] },
  });
  return renderWithProviders(<EditorContent editor={editor} />);
}

/// What the block saves for the file, as the page stores it.
const storedRows = () => editor?.getJSON().content?.[0]?.attrs?.rows;

describe("a file block with the path of a file on this computer", () => {
  it("shows the file by its name and its path, and opens it from the toolbar", async () => {
    open("file", PATH);
    expect(await screen.findByText("Handout_Woche3.pdf")).toBeInTheDocument();
    expect(screen.getByText(PATH)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Open File" }));
    await waitFor(() => expect(callsOf("open_local_path")).toEqual([{ path: PATH }]));
    expect(callsOf("plugin:opener|open_path")).toHaveLength(0);
  });

  it("shows it in the folder from the toolbar", async () => {
    open("file", PATH);
    fireEvent.click(await screen.findByRole("button", { name: "Show in Folder" }));
    await waitFor(() => expect(callsOf("reveal_local_path")).toEqual([{ path: PATH }]));
  });

  it("previews an image from the path", async () => {
    open("image", "/Users/daniel/Pictures/campus.png");
    const image = await screen.findByRole("img", { name: "campus.png" });
    expect(image).toHaveAttribute("src", "asset://localhost/Users/daniel/Pictures/campus.png");
  });

  it("works with a Windows path", async () => {
    mockCommand("check_local_path", { state: "ok", message: "", name: "a.pdf" });
    open("file", "C:\\Uni\\a.pdf");
    expect(await screen.findByText("a.pdf")).toBeInTheDocument();
  });

  it("leaves a block that holds a link just as it was", async () => {
    open("file", "https://example.com/a.pdf");
    expect(await screen.findByText("a.pdf")).toBeInTheDocument();
    expect(callsOf("check_local_path")).toHaveLength(0);
  });
});

describe("a path that cannot be used right now", () => {
  it.each([
    ["missing", "was not found", "It may have been moved or renamed"],
    ["unavailable", "drive or network volume", "once it is connected"],
    ["unreadable", "isn't allowed to read", ""],
    ["folder", "is a folder", ""],
  ])("shows an empty state for a %s file and keeps the path", async (state, words, more) => {
    mockCommand("check_local_path", {
      state,
      message: `${PATH}: ${state}`,
      name: "Handout_Woche3.pdf",
    });
    open("file", PATH);
    const card = await screen.findByTestId("media-problem");
    expect(card).toHaveTextContent(words);
    if (more) expect(card).toHaveTextContent(more);
    expect(card).toHaveTextContent(PATH);
    // Nothing is removed or rewritten.
    expect(storedRows()).toBe(PATH);
  });

  it("offers to edit the path, and to replace the file", async () => {
    mockCommand("check_local_path", { state: "missing", message: "", name: "x" });
    open("file", PATH);
    await screen.findByTestId("media-problem");
    expect(screen.getByRole("button", { name: "Edit Path" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace File" })).toBeInTheDocument();
  });

  it("says why on a toast when opening fails", async () => {
    const error = vi.spyOn(toast, "showToast");
    mockCommandWith("open_local_path", () => {
      throw new Error("not found: /Users/daniel/Downloads/Handout_Woche3.pdf was not found.");
    });
    open("file", PATH);
    fireEvent.click(await screen.findByRole("button", { name: "Open File" }));
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(error.mock.calls[0][0]).toBe("error");
    expect(error.mock.calls[0][1]).toBe("Couldn't open the file");
    expect(String(error.mock.calls[0][2]?.description)).toContain("was not found");
  });

  it("has no accessibility violations", async () => {
    mockCommand("check_local_path", { state: "missing", message: "", name: "x" });
    open("file", PATH);
    await expectNoA11yViolations(await screen.findByTestId("media-problem"));
  });
});

describe("editing the path", () => {
  async function startEditing(rows = PATH) {
    const view = open("file", rows);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Path" }));
    const field = await screen.findByRole("textbox", { name: "Path or link to the file" });
    return { ...view, field };
  }

  it("starts from the path and saves a new one", async () => {
    const { user, field } = await startEditing();
    expect(field).toHaveValue(PATH);
    await user.clear(field);
    await user.type(field, "/Users/daniel/Uni/Handout_Woche4.pdf");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(storedRows()).toBe("/Users/daniel/Uni/Handout_Woche4.pdf"));
  });

  it("takes a link as well", async () => {
    const { user, field } = await startEditing();
    await user.clear(field);
    await user.type(field, "https://example.com/handout.pdf");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(storedRows()).toBe("https://example.com/handout.pdf"));
  });

  it("refuses an empty value with a message under the field, and saves nothing", async () => {
    const { user, field } = await startEditing();
    await user.clear(field);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter the full path of a file, or a link.",
    );
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(storedRows()).toBe(PATH);
  });

  it("refuses something that is neither a path nor a link", async () => {
    const { user, field } = await startEditing();
    await user.clear(field);
    await user.type(field, "Handout.pdf");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not a full path or a link");
    expect(storedRows()).toBe(PATH);
  });

  it("goes back without a change on Escape", async () => {
    const { user, field } = await startEditing();
    await user.type(field, "x{Escape}");
    expect(screen.queryByRole("textbox", { name: "Path or link to the file" })).toBeNull();
    expect(storedRows()).toBe(PATH);
  });
});

describe("the empty file block", () => {
  async function startPath() {
    const view = open("file", "");
    await view.user.click(await screen.findByRole("button", { name: "Path" }));
    const field = await screen.findByRole("textbox", { name: "Path or link to the file" });
    return { ...view, field };
  }

  it("offers Path, not Link", async () => {
    open("file", "");
    expect(await screen.findByRole("button", { name: "Path" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link" })).toBeNull();
  });

  it("takes a full path", async () => {
    const { user, field } = await startPath();
    await user.type(field, PATH);
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(storedRows()).toBe(PATH));
  });

  it("takes a link", async () => {
    const { user, field } = await startPath();
    await user.type(field, "https://example.com/a.pdf");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(storedRows()).toBe("https://example.com/a.pdf"));
  });

  it("refuses an empty or malformed value before it is saved", async () => {
    const { user, field } = await startPath();
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter the full path of a file, or a link.",
    );
    await user.type(field, "notes.pdf");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not a full path or a link");
    expect(storedRows()).toBe("");
  });

  it("has no accessibility violations while the path is typed", async () => {
    const { field, user } = await startPath();
    await user.type(field, "notes.pdf");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByRole("alert");
    await expectNoA11yViolations(field.closest("form") ?? field);
  });
});
