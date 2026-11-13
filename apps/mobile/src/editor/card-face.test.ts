import type { CardBlock } from "@nookly/shared/data";
import { faceDoc, docFace, sameFace } from "./card-face.ts";

const FACE: CardBlock[] = [
  { type: "heading2", content: "Euler", language: null, filename: null, attrs: { toggle: "" } },
  {
    type: "equation",
    content: "e^{i\\pi} + 1 = 0",
    language: null,
    filename: null,
    attrs: { view: "rendered" },
  },
  { type: "paragraph", content: "**bold** and $x$", language: null, filename: null, attrs: {} },
];

describe("a card's face in the page editor", () => {
  it("comes back out of the editor's document as the blocks it went in as", () => {
    const back = docFace(faceDoc(FACE));
    expect(back.map((b) => [b.type, b.content])).toEqual(FACE.map((b) => [b.type, b.content]));
    expect(sameFace(back, FACE)).toBe(true);
  });

  it("starts an empty face with one empty line", () => {
    expect(docFace(faceDoc([]))).toEqual([]);
  });

  it("tells a changed face from an unchanged one", () => {
    const changed = FACE.map((b, i) => (i === 2 ? { ...b, content: "other" } : b));
    expect(sameFace(changed, FACE)).toBe(false);
  });
});
