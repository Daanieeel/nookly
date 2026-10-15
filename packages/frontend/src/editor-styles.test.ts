/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");

/// The body of the first rule whose selector contains `selector`.
function ruleFor(selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) return "";
  return css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
}

// jsdom does no layout, so this pins the stylesheet instead: long pages stay fast because the
// browser skips layout and paint for top level blocks that are scrolled out of view.
describe("long pages in the editor", () => {
  const rule = ruleFor(".tiptap-content > :not(.ProseMirror-selectednode)");

  it("skips rendering top level blocks that are out of view", () => {
    expect(rule).toContain("content-visibility: auto");
  });

  it("reserves a remembered height for a skipped block, so the scrollbar does not jump", () => {
    expect(rule).toMatch(/contain-intrinsic-size:\s*auto\s/);
  });

  it("keeps a selected block rendered in full, as its outline reaches past the block", () => {
    expect(css).toContain(
      ".tiptap-content > :not(.ProseMirror-selectednode):not(:has(> .ProseMirror-selectednode)) {",
    );
  });
});
