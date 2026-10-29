import { QueryClient } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextMenuHost } from "#/components/context-menu/context-menu-host.tsx";
import {
  ACTION_GROUPS,
  type MenuHelpers,
  actionsFor,
  contextTarget,
} from "#/components/context-menu/registry.ts";
import { settings } from "#/lib/settings/settings.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { editorExtensions } from "../notes/editor-extensions";
import type { NoteBlockTarget } from "../notes/context-actions";
import "../notes/context-actions.tsx";
import { replaceMisspelled } from "./spell-actions.tsx";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

beforeEach(() => {
  settings.reset("notes.spellcheck");
  settings.set("notes.spellcheck", true);
  mockCommand("spell_configure", ["en"]);
  mockCommand("spell_suggest", ["wrong", "wring", "wrung"]);
  mockCommand("spell_ignore", null);
  mockCommand("spell_add_word", null);
});

function open() {
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "a wrng b" }] }],
    },
  });
  return editor;
}

function target(e: Editor, misspelled = { word: "wrng", from: 3, to: 7 }): NoteBlockTarget {
  return {
    editor: e,
    blockId: "b1",
    entityId: "p",
    resolveStoredId: async () => null,
    misspelled,
  };
}

const helpers: MenuHelpers = {
  queryClient: new QueryClient(),
  close: () => {},
  refresh: async () => {},
  openPopover: () => {},
  openDialog: () => {},
};

const action = (id: string) => actionsFor("note.block").find((a) => a.id === id);

describe("the spelling actions of a block's menu", () => {
  it("show only on a misspelled word", () => {
    const e = open();
    const plain: NoteBlockTarget = { ...target(e), misspelled: undefined };
    for (const id of ["spell-suggestions", "spell-ignore", "spell-add"]) {
      expect(action(id)?.when?.(plain), id).toBe(false);
      expect(action(id)?.when?.(target(e)), id).toBe(true);
    }
  });

  it("come first in the menu", () => {
    expect(ACTION_GROUPS[0]).toBe("spelling");
    for (const id of ["spell-suggestions", "spell-ignore", "spell-add"]) {
      expect(action(id)?.group).toBe("spelling");
    }
  });

  it("add the word to the dictionary file", async () => {
    const e = open();
    await action("spell-add")?.run?.(target(e), helpers);
    expect(callsOf("spell_add_word")).toEqual([{ word: "wrng" }]);
  });

  it("ignore the word for now, without saving it", async () => {
    const e = open();
    await action("spell-ignore")?.run?.(target(e), helpers);
    expect(callsOf("spell_ignore")).toEqual([{ word: "wrng" }]);
    expect(callsOf("spell_add_word")).toEqual([]);
  });
});

describe("the suggestions", () => {
  function Harness({ e }: { e: Editor }) {
    return (
      <div>
        <button type="button" {...contextTarget("note.block", target(e))}>
          Word
        </button>
        <ContextMenuHost />
      </div>
    );
  }

  it("list the corrections and put the picked one in place of the word", async () => {
    const e = open();
    const { user } = renderWithProviders(<Harness e={e} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Word" }));
    await user.click(await screen.findByRole("menuitem", { name: "Spelling Suggestions" }));
    const menu = await screen.findByRole("menu", { name: "Spelling Suggestions" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual(["wrong", "wring", "wrung"]);
    await user.click(within(menu).getByRole("menuitem", { name: "wring" }));
    await waitFor(() => expect(e.state.doc.textContent).toBe("a wring b"));
    expect(callsOf("spell_suggest")[0]).toEqual({ word: "wrng" });
  });

  it("leave the page alone when the text moved on since the menu opened", () => {
    const e = open();
    e.commands.insertContentAt(1, "zz");
    expect(replaceMisspelled(target(e), "wrong")).toBe(false);
    expect(e.state.doc.textContent).toBe("zza wrng b");
  });

  it("replace the word when it is still there", () => {
    const e = open();
    expect(replaceMisspelled(target(e), "wrong")).toBe(true);
    expect(e.state.doc.textContent).toBe("a wrong b");
    e.commands.undo();
    expect(e.state.doc.textContent).toBe("a wrng b");
  });

  it("have no accessibility violations", async () => {
    const e = open();
    renderWithProviders(<Harness e={e} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Word" }));
    await screen.findByRole("menuitem", { name: "Add to Dictionary" });
    await expectNoA11yViolations();
  });
});
