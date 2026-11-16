import { EditorState, type Transaction } from "prosemirror-state";
import { findPlugin, findResult, findQuery, findStep } from "./find.ts";
import { pageSchema } from "./schema.ts";

const page = (...lines: string[]) =>
  EditorState.create({
    schema: pageSchema,
    doc: pageSchema.node(
      "doc",
      null,
      lines.map((line) => pageSchema.node("paragraph", null, line ? pageSchema.text(line) : [])),
    ),
    plugins: [findPlugin()],
  });

/// Runs a command that dispatches, returning the state after it.
const run = (
  state: EditorState,
  command: (s: EditorState, d: (tr: Transaction) => void) => void,
) => {
  let next = state;
  command(state, (tr) => {
    next = next.apply(tr);
  });
  return next;
};

// The desktop's find in page (`find-in-page.ts`) for the tablet's editor (6.1): every match
// of what is typed, ignoring case, the current one selected, stepping round in both ways.
describe("find in the page", () => {
  it("finds every match, ignoring case, and selects the first", () => {
    const state = run(page("Plan the trip", "Book the train", "THE end"), findQuery("the"));
    expect(findResult(state)).toEqual({ count: 3, index: 1 });
    const { from, to } = state.selection;
    expect(state.doc.textBetween(from, to)).toBe("the");
  });

  it("steps forward and back, wrapping round at either end", () => {
    let state = run(page("one a", "two a", "three a"), findQuery(" a"));
    state = run(state, findStep(1));
    expect(findResult(state)).toEqual({ count: 3, index: 2 });
    state = run(state, findStep(1));
    state = run(state, findStep(1));
    expect(findResult(state)).toEqual({ count: 3, index: 1 });
    state = run(state, findStep(-1));
    expect(findResult(state)).toEqual({ count: 3, index: 3 });
  });

  it("finds nothing for an empty query or a word not there", () => {
    expect(findResult(run(page("Plan"), findQuery("")))).toEqual({ count: 0, index: 0 });
    expect(findResult(run(page("Plan"), findQuery("zebra")))).toEqual({ count: 0, index: 0 });
  });

  it("keeps the matches up to date as the page changes", () => {
    let state = run(page("cat"), findQuery("cat"));
    state = state.apply(state.tr.insertText(" cat", state.doc.content.size - 1));
    expect(findResult(state).count).toBe(2);
  });
});
