import { EditorState } from "prosemirror-state";
import { codeDecorations, codeHighlightPlugin, codeHighlightKey } from "./code-blocks.ts";
import { pageSchema } from "./schema.ts";

const s = pageSchema;
const page = (language: string, code: string) =>
  s.node("doc", null, [
    s.node("paragraph", null, [s.text("Intro")]),
    s.node("codeBlock", { language }, code ? [s.text(code)] : []),
  ]);
// A stand in for Shiki: the first word of the block, in pink.
const firstWord = (_language: string, code: string) => {
  const end = code.indexOf(" ");
  return end > 0 ? [{ from: 0, to: end, style: "color: var(--accent-pink)" }] : [];
};

describe("a code block's colours", () => {
  it("are drawn over the block's own text, at its place in the page", () => {
    const doc = page("typescript", "const x = 1");
    const set = codeDecorations(doc, firstWord, new Map());
    const [found] = set.find();
    // The paragraph "Intro" takes 7 positions, the code block opens at 7, its text at 8.
    expect(found).toMatchObject({ from: 8, to: 13 });
  });

  it("asks the highlighter once per language and code, however often the page changes", () => {
    const spans = jest.fn(firstWord);
    const cache = new Map();
    codeDecorations(page("python", "def f"), spans, cache);
    codeDecorations(page("python", "def f"), spans, cache);
    expect(spans).toHaveBeenCalledTimes(1);
  });

  it("keep their place while the page is typed in, until the new colours arrive", () => {
    const plugin = codeHighlightPlugin(firstWord);
    let state = EditorState.create({ doc: page("typescript", "const x"), plugins: [plugin] });
    state = state.apply(
      state.tr.setMeta(codeHighlightKey, codeDecorations(state.doc, firstWord, new Map())),
    );
    // Typing at the start of the page moves the code down by one.
    state = state.apply(state.tr.insertText("A", 1));
    const [moved] = codeHighlightKey.getState(state)?.find() ?? [];
    expect(moved).toMatchObject({ from: 9, to: 14 });
  });
});
