// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Read from disk: the test run turns imported style sheets into empty modules.
const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

/// The classes `vim-extension.ts` puts on the editor and its cursor need styles, or normal
/// mode has no visible cursor. They were lost once when the highlight styles were rewritten.
describe("Vim mode styles", () => {
  it("hide the editor's caret in normal and visual mode", () => {
    for (const mode of ["vim-normal", "vim-visual", "vim-visual-line"]) {
      expect(css).toContain(`.tiptap-content.${mode}`);
    }
  });

  it("draw the block cursor, also on an empty line", () => {
    expect(css).toContain(".tiptap-content .vim-cursor {");
    expect(css).toContain(".tiptap-content .vim-cursor-empty::before");
  });
});
