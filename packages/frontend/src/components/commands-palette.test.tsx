import { act, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { editorExtensions } from "#/features/notes/editor-extensions.ts";
import { trackActiveEditor } from "#/lib/active-editor.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { makeSpace } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { CommandsPalette } from "./commands-palette.tsx";

describe("Import from File in the commands palette", () => {
  beforeEach(() => {
    useNavStore.setState({ importOpen: false });
  });

  it("opens the import dialog, and the palette closes", async () => {
    mockCommand("list_spaces", [makeSpace({ id: "space-1", name: "Uni" })]);
    mockCommand("list_space_modules", ["notes"]);
    act(() => useNavStore.getState().setActiveSpace("space-1"));
    const { user } = renderWithProviders(<CommandsPalette />);
    act(() => useNavStore.getState().setCommandsOpen(true));
    await user.type(await screen.findByPlaceholderText("Run a command…"), "import page");
    await user.click(await screen.findByText("Import from File"));
    expect(useNavStore.getState().importOpen).toBe(true);
    expect(useNavStore.getState().commandsOpen).toBe(false);
  });
});

describe("New Tab in the commands palette", () => {
  beforeEach(() => {
    mockCommand("list_spaces", []);
  });

  it("opens a new tab and closes the palette", async () => {
    const before = useNavStore.getState().tabs.length;
    const { user } = renderWithProviders(<CommandsPalette />);
    act(() => useNavStore.getState().setCommandsOpen(true));
    await user.type(await screen.findByPlaceholderText("Run a command…"), "new tab");
    await user.click(await screen.findByText("New Tab"));
    expect(useNavStore.getState().tabs.length).toBe(before + 1);
    expect(useNavStore.getState().commandsOpen).toBe(false);
  });

  it("shows the shortcut next to the action", async () => {
    const { user } = renderWithProviders(<CommandsPalette />);
    act(() => useNavStore.getState().setCommandsOpen(true));
    await user.type(await screen.findByPlaceholderText("Run a command…"), "new tab");
    const action = (await screen.findByText("New Tab")).closest("[cmdk-item]");
    expect(action?.querySelector("kbd")).not.toBeNull();
  });
});

describe("Highlight Selected Text in the commands palette", () => {
  let editor: Editor | null = null;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  function openEditor(selection: [number, number]) {
    editor = new Editor({
      element: document.createElement("div"),
      extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
      content: "<p>hello world</p>",
    });
    const opened = editor;
    const stop = trackActiveEditor(opened);
    // jsdom has no focus for a detached editor, so the event is sent by hand.
    opened.emit("focus", {
      editor: opened,
      event: new FocusEvent("focus"),
      transaction: opened.state.tr,
    });
    opened.view.dispatch(
      opened.state.tr.setSelection(TextSelection.create(opened.state.doc, ...selection)),
    );
    return { opened, stop };
  }

  beforeEach(() => {
    mockCommand("list_spaces", []);
  });

  it("highlights the selection of the page last written in", async () => {
    const { opened, stop } = openEditor([1, 6]);
    const { user } = renderWithProviders(<CommandsPalette />);
    act(() => useNavStore.getState().setCommandsOpen(true));
    await user.type(await screen.findByPlaceholderText("Run a command…"), "highlight");
    await user.click(await screen.findByText("Highlight Selected Text"));
    expect(opened.getHTML()).toContain("<mark>hello</mark> world");
    expect(useNavStore.getState().commandsOpen).toBe(false);
    stop();
  });

  it("is not offered without a selection", async () => {
    const { stop } = openEditor([3, 3]);
    const { user } = renderWithProviders(<CommandsPalette />);
    act(() => useNavStore.getState().setCommandsOpen(true));
    await user.type(await screen.findByPlaceholderText("Run a command…"), "highlight");
    expect(screen.queryByText("Highlight Selected Text")).toBeNull();
    stop();
  });

  it("is not offered when no page was written in", async () => {
    const { user } = renderWithProviders(<CommandsPalette />);
    act(() => useNavStore.getState().setCommandsOpen(true));
    await user.type(await screen.findByPlaceholderText("Run a command…"), "highlight");
    expect(screen.queryByText("Highlight Selected Text")).toBeNull();
  });
});
