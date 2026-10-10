import { screen, waitFor } from "@testing-library/react";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Entity } from "#/lib/api/types.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { editorExtensions } from "./editor-extensions";
import { parseMentionQuery } from "./mention-extension";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

const entities = [
  makeEntity({ id: "f1", type: "file", title: "Report", key: "FIL-1" }),
  makeEntity({ id: "n1", type: "note", title: "Notes", key: "NTE-1" }),
  makeEntity({ id: "f2", type: "file", title: "Photo", key: "FIL-2" }),
];

/// Only the report has pages; the other file is a picture.
const entitiesWithPages = (entity: Entity) => entity.id === "f1";

async function open() {
  editor = new Editor({
    extensions: editorExtensions({
      spaceId: "s",
      pageId: "p",
      getEntities: () => entities,
      hasPages: entitiesWithPages,
    }),
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

  it("offers a page for a file as a button on its row, not for anything else", async () => {
    const { editor: target } = await open();
    target.commands.insertContent("@");
    expect(await screen.findAllByRole("button", { name: "# Page" })).toHaveLength(1);
    expect(screen.getByText(/Press → to add a page number/)).toBeTruthy();
  });

  it("starts the page number when the row's page button is clicked", async () => {
    const { user, editor: target } = await open();
    target.commands.insertContent("@report");
    await user.click(await screen.findByRole("button", { name: "# Page" }));
    await waitFor(() => expect(target.getText()).toBe("@report#"));
    // The list stays open for the number, and says so.
    expect(await screen.findByText(/Type the page number/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "# Page" })).toBeNull();
    // Typing it finishes the link as before.
    target.commands.insertContent("12");
    expect(await screen.findByText(/Page 12/)).toBeTruthy();
    await user.click((await screen.findAllByRole("button"))[0] ?? document.body);
    await waitFor(() =>
      expect(links(target)).toContainEqual({ text: "Report (p. 12)", href: "mention:f1#p12" }),
    );
  });

  it("starts the page number with the right arrow on a highlighted file", async () => {
    const { user, editor: target } = await open();
    target.commands.insertContent("@report");
    await screen.findByRole("button", { name: "# Page" });
    target.view.dom.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(target.getText()).toBe("@report#"));
  });

  it("does not offer a page on a note, and the right arrow does nothing there", async () => {
    const { user, editor: target } = await open();
    target.commands.insertContent("@notes");
    await screen.findByText("Notes");
    expect(screen.queryByRole("button", { name: "# Page" })).toBeNull();
    await user.keyboard("{ArrowRight}");
    expect(target.getText()).toBe("@notes");
  });

  it("shows which page the row will link once a number is typed", async () => {
    const { editor: target } = await open();
    target.commands.insertContent("@report#12");
    expect(await screen.findByText(/Page 12/)).toBeTruthy();
  });
});

describe("which files offer a page", () => {
  it("offers a page only for a file that has pages", async () => {
    const { editor: target } = await open();
    target.commands.insertContent("@");
    // Report has pages; the photo and the note do not.
    expect(await screen.findAllByRole("button", { name: "# Page" })).toHaveLength(1);
    expect(screen.getByText("Photo")).toBeTruthy();
  });

  it("shows no page hint when no file on the list has pages", async () => {
    const { editor: target } = await open();
    target.commands.insertContent("@photo");
    await screen.findByText("Photo");
    expect(screen.queryByText(/Press → to add a page number/)).toBeNull();
    expect(screen.queryByRole("button", { name: "# Page" })).toBeNull();
  });

  it("ignores a typed page number for a file without pages", async () => {
    const { user, editor: target } = await open();
    target.commands.insertContent("@photo#4");
    await user.click(await screen.findByText("Photo"));
    await waitFor(() =>
      expect(links(target)).toContainEqual({ text: "Photo", href: "mention:f2" }),
    );
  });
});

describe("cancelling the mention menu", () => {
  it("opens again for the next @, in the same place and further on", async () => {
    const { user, editor: target } = await open();
    target.commands.insertContent("@rep");
    await screen.findByRole("button", { name: "# Page" });
    target.view.dom.focus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("button", { name: "# Page" })).toBeNull());

    // Further on in the same line.
    target.commands.insertContent(" and @rep");
    expect(await screen.findByRole("button", { name: "# Page" })).toBeTruthy();
    target.view.dom.focus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("button", { name: "# Page" })).toBeNull());

    // And once more, then choosing works.
    target.commands.insertContent(" or @rep");
    await user.click(await screen.findByText("Report"));
    await waitFor(() => expect(links(target).some((l) => l.href === "mention:f1")).toBe(true));
  });

  it("opens again after the menu was closed by deleting the @", async () => {
    const { user, editor: target } = await open();
    target.commands.insertContent("@rep");
    await screen.findByRole("button", { name: "# Page" });
    target.view.dom.focus();
    await user.keyboard("{Escape}");
    target.commands.clearContent();
    target.commands.insertContent("@rep");
    expect(await screen.findByRole("button", { name: "# Page" })).toBeTruthy();
  });

  it("opens again after the menu ended another way than Escape", async () => {
    const { user, editor: target } = await open();
    // A space ends the search (nothing is being mentioned any more).
    target.commands.insertContent("@rep");
    await screen.findByRole("button", { name: "# Page" });
    target.commands.insertContent(" ");
    await waitFor(() => expect(screen.queryByRole("button", { name: "# Page" })).toBeNull());
    target.commands.insertContent("@rep");
    expect(await screen.findByRole("button", { name: "# Page" })).toBeTruthy();

    // A click outside the menu closes it too.
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByRole("button", { name: "# Page" })).toBeNull());
    target.commands.insertContent(" @rep");
    expect(await screen.findByRole("button", { name: "# Page" })).toBeTruthy();
  });

  it("opens again after a mention was chosen", async () => {
    const { user, editor: target } = await open();
    target.commands.insertContent("@rep");
    await user.click(await screen.findByText("Report"));
    await waitFor(() => expect(links(target).some((l) => l.href === "mention:f1")).toBe(true));
    target.commands.insertContent(" @rep");
    expect(await screen.findByRole("button", { name: "# Page" })).toBeTruthy();
  });
});
