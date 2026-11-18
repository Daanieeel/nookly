/// The code blocks' colours, as the editor's web view draws them. Run with `bun test`: Shiki
/// ships only ES modules, which the screens' Jest does not load.
import { describe, expect, it } from "bun:test";
import { codeSpans } from "./src/editor/code-highlight.ts";

describe("highlighting a code block", () => {
  it("colours code as the desktop does, by the block's language", () => {
    const code = "const x = 1;\n// done";
    const spans = codeSpans("typescript", code);
    const keyword = spans.find((s) => code.slice(s.from, s.to) === "const");
    expect(keyword?.style).toContain("var(--accent-pink)");
    const comment = spans.find((s) => code.slice(s.from, s.to).includes("done"));
    expect(comment?.style).toContain("italic");
  });

  it("leaves plain text and unknown languages uncoloured", () => {
    expect(codeSpans("plaintext", "const x")).toEqual([]);
    expect(codeSpans("klingon", "const x")).toEqual([]);
  });
});
