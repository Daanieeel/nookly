import { screen, waitFor } from "@testing-library/react";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { editorExtensions } from "./editor-extensions";
import { parseMentionQuery } from "./mention-extension";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

const entities = [
  makeEntity({ id: "f1", type: "file", title: "Report", key: "FIL-1" }),
  makeEntity({ id: "n1", type: "note", title: "Notes", key: "NTE-1" }),
];

async function open() {
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => entities }),
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
  const view = renderWithProviders(<EditorContent editor={editor} />);
  editor.commands.focus();
  return { ...view, editor };
}

/// The text nodes of the first paragraph, with the link each one carries.
function links(target: Editor) {
  const doc: JSONContent = target.getJSON();
  return (doc.content?.[0]?.content ?? []).map((node) => ({
    text: node.text,
    href: node.marks?.find((m) => m.type === "link")?.attrs?.href,
  }));
}

describe("parseMentionQuery", () => {
  it.each([
    ["report", { search: "report", page: null }],
    ["report#12", { search: "report", page: 12 }],
    ["report#", { search: "report", page: null }],
    ["report#x", { search: "report", page: null }],
    ["#7", { search: "", page: 7 }],
  ])("reads %j", (query, expected) => {
    expect(parseMentionQuery(query)).toEqual(expected);
  });
});

describe("mentioning a page of a file", () => {
  it("ranks by the words before the # and links the page", async () => {
    const { user, editor: target } = await open();
    target.commands.insertContent("@report#12");
    await user.click((await screen.findAllByRole("button"))[0] ?? document.body);
    await waitFor(() =>
      expect(links(target)).toContainEqual({ text: "Report (p. 12)", href: "mention:f1#p12" }),
    );
  });

  it("links the whole file without a page number", async () => {
    const { user, editor: target } = await open();
    target.commands.insertContent("@report");
    await user.click((await screen.findAllByRole("button"))[0] ?? document.body);
    await waitFor(() =>
      expect(links(target)).toContainEqual({ text: "Report", href: "mention:f1" }),
    );
  });

  it("ignores a page number for something that is not a file", async () => {
    const { user, editor: target } = await open();
    target.commands.insertContent("@notes#3");
    await user.click((await screen.findAllByRole("button"))[0] ?? document.body);
    await waitFor(() =>
      expect(links(target)).toContainEqual({ text: "Notes", href: "mention:n1" }),
    );
  });

  it("hints at the page number while a file is offered", async () => {
    const { editor: target } = await open();
    target.commands.insertContent("@report");
    expect(await screen.findByText(/Add a page number: type #12/)).toBeTruthy();
  });
});
