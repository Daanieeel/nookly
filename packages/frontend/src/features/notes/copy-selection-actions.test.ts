import { QueryClient } from "@tanstack/react-query";
import { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ACTION_GROUPS, type MenuHelpers, actionsFor } from "#/components/context-menu/registry.ts";
import { parseDeepLink } from "#/lib/deep-link-url.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { z } from "zod";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { parseMentionHref, quoteFragment } from "../relationships/mention-utils";
import { editorExtensions } from "./editor-extensions";
import type { NoteBlockTarget } from "./context-actions";
import "#/components/context-menu/entity-actions.tsx";
import "./context-actions.tsx";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

const helpers: MenuHelpers = {
  queryClient: new QueryClient(),
  close: () => {},
  refresh: async () => {},
  openPopover: () => {},
  openDialog: () => {},
};

/// What the clipboard last got: the text of a copied link, or the text of a copied mention.
function lastCopied(command: "write_html" | "write_text"): string {
  const calls = callsOf(`plugin:clipboard-manager|${command}`);
  const last = z
    .object({ altText: z.string().optional(), text: z.string().optional() })
    .parse(calls.at(-1));
  return last.altText ?? last.text ?? "";
}

beforeEach(() => {
  mockCommand("plugin:clipboard-manager|write_text", null);
  mockCommand("plugin:clipboard-manager|write_html", null);
  mockCommand("get_entity", makeEntity({ id: "page-1", key: "NOT-58", title: "Notes" }));
});

function open() {
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "c1" },
          content: [{ type: "text", text: "The cat sat on the mat" }],
        },
        {
          type: "paragraph",
          attrs: { blockId: "c2" },
          content: [{ type: "text", text: "Another block" }],
        },
      ],
    },
  });
  return editor;
}

const target = (
  e: Editor,
  blockId = "c1",
  stored: string | null = "stored-9",
): NoteBlockTarget => ({
  editor: e,
  blockId,
  entityId: "page-1",
  resolveStoredId: async () => stored,
});

const action = (id: string) => actionsFor("note.block").find((a) => a.id === id);

describe("the actions for selected text", () => {
  it("are named for the selection and sit with the block ones", () => {
    const ids = actionsFor("note.block").map((a) => a.id);
    expect(action("copy-selection-mention")?.label).toBe("Copy Mention for Selection");
    expect(action("copy-selection-deep-link")?.label).toBe("Copy Link for Selection");
    expect(ids.indexOf("copy-selection-deep-link")).toBe(ids.indexOf("copy-selection-mention") + 1);
    // Their own group, so the menu draws a line between them and the block ones, above it.
    expect(action("copy-selection-mention")?.group).toBe("selection");
    expect(action("copy-selection-deep-link")?.group).toBe("selection");
    expect(action("copy-block-link")?.group).toBe("share");
    expect(ACTION_GROUPS.indexOf("selection")).toBe(ACTION_GROUPS.indexOf("share") - 1);
  });

  it("show only while text of that block is selected", () => {
    const e = open();
    const mention = action("copy-selection-mention");
    expect(mention?.when?.(target(e))).toBe(false);
    e.commands.setTextSelection({ from: 5, to: 8 });
    expect(mention?.when?.(target(e))).toBe(true);
    expect(action("copy-selection-deep-link")?.when?.(target(e))).toBe(true);
    // The selection is in the first block, not the second.
    expect(mention?.when?.(target(e, "c2"))).toBe(false);
  });

  it("copy a mention that carries the selected text, labelled with it", async () => {
    const e = open();
    e.commands.setTextSelection({ from: 5, to: 8 });
    await action("copy-selection-mention")?.run?.(target(e), helpers);
    const fragment = quoteFragment("stored-9", "cat");
    expect(lastCopied("write_html")).toBe(`[cat](mention:NOT-58#${fragment})`);
    expect(parseMentionHref(`mention:NOT-58#${fragment}`)).toMatchObject({
      blockId: "stored-9",
      quote: "cat",
    });
  });

  it("label a long selection with its start", async () => {
    const e = open();
    e.commands.setTextSelection({ from: 1, to: 23 });
    await action("copy-selection-mention")?.run?.(target(e), helpers);
    expect(lastCopied("write_html")).toMatch(/^\[The cat sat on the mat\]\(/);
    e.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "c1" },
          content: [{ type: "text", text: "word ".repeat(40) }],
        },
      ],
    });
    e.commands.setTextSelection({ from: 1, to: 150 });
    callsOf("plugin:clipboard-manager|write_html").length = 0;
    await action("copy-selection-mention")?.run?.(target(e), helpers);
    const label = /^\[(.*?)\]\(/.exec(lastCopied("write_html"))?.[1] ?? "";
    expect(label.endsWith("…")).toBe(true);
    expect(label.length).toBeLessThanOrEqual(61);
  });

  it("copy a link that names the page by its key and carries the text", async () => {
    const e = open();
    e.commands.setTextSelection({ from: 5, to: 8 });
    await action("copy-selection-deep-link")?.run?.(target(e), helpers);
    const text = lastCopied("write_text");
    expect(text).toBe(`nookly://open/NOT-58#${quoteFragment("stored-9", "cat")}`);
    expect(parseDeepLink(text)).toMatchObject({
      entityId: "NOT-58",
      blockId: "stored-9",
      quote: "cat",
    });
  });

  it("copy nothing for a block that was never saved", async () => {
    const e = open();
    e.commands.setTextSelection({ from: 5, to: 8 });
    await expect(
      action("copy-selection-mention")?.run?.(target(e, "c1", null), helpers),
    ).rejects.toThrow("Block not saved yet");
    expect(callsOf("plugin:clipboard-manager|write_html")).toHaveLength(0);
  });
});
