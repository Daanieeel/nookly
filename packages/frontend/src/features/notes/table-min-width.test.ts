import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { editorExtensions } from "./editor-extensions.ts";

function tableHtml(columns: number): string {
  const cells = (tag: string) =>
    Array.from({ length: columns }, () => `<${tag}><p>x</p></${tag}>`).join("");
  return `<table><tr>${cells("th")}</tr><tr>${cells("td")}</tr></table>`;
}

describe("table columns in the note editor", () => {
  it("keep a readable minimum width, so a wide table scrolls instead of squeezing", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: editorExtensions({ spaceId: "s1", pageId: "p1", getEntities: () => [] }),
      content: tableHtml(8),
    });
    const table = editor.view.dom.querySelector("table");
    const minWidth = Number.parseFloat(table?.style.minWidth ?? "0");
    expect(minWidth).toBeGreaterThanOrEqual(8 * 100);
    editor.destroy();
  });
});
