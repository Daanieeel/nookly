import { describe, expect, it, vi } from "vitest";
import type { ExportDocument, ExportImage } from "./document-model.ts";
import { type FigureRenderers, resolveDocument } from "./resolve-document.ts";

const drawn: ExportImage = { png: new Uint8Array([1]), width: 10, height: 5 };

function renderers(patch: Partial<FigureRenderers> = {}): FigureRenderers {
  return {
    math: vi.fn(async () => drawn),
    diagram: vi.fn(async () => drawn),
    circuit: vi.fn(async () => drawn),
    plot: vi.fn(async () => drawn),
    image: vi.fn(async () => drawn),
    mentionUrl: vi.fn(async (id: string) => (id === "b1" ? "https://mdn.dev" : null)),
    ...patch,
  };
}

const doc: ExportDocument = {
  title: "Page",
  blocks: [
    {
      kind: "paragraph",
      runs: [
        { kind: "text", text: "MDN", link: "mention:b1" },
        { kind: "text", text: "a note", link: "mention:n1#block" },
        { kind: "math", latex: "x^2" },
      ],
    },
    { kind: "figure", source: { type: "diagram", source: "graph" }, fallback: "graph" },
    { kind: "figure", source: { type: "plot", source: "y = x" }, fallback: "y = x" },
    {
      kind: "list",
      items: [
        { runs: [{ kind: "text", text: "again", link: "mention:b1" }], marker: "•", children: [] },
      ],
    },
  ],
};

describe("resolveDocument", () => {
  it("draws figures and inline math, and points entity links at their URL", async () => {
    const r = renderers();
    const resolved = await resolveDocument(doc, r);
    expect(resolved.blocks[0]).toEqual({
      kind: "paragraph",
      runs: [
        { kind: "text", text: "MDN", link: "https://mdn.dev" },
        { kind: "text", text: "a note" },
        { kind: "math", latex: "x^2", image: drawn },
      ],
    });
    expect(resolved.blocks[1]).toMatchObject({ image: drawn });
    expect(r.math).toHaveBeenCalledWith("x^2", true);
    expect(r.plot).toHaveBeenCalledWith("y = x");
    // One lookup per entity, however often the page links it.
    expect(r.mentionUrl).toHaveBeenCalledTimes(2);
  });

  it("keeps the source of a figure that failed to draw", async () => {
    const resolved = await resolveDocument(
      doc,
      renderers({
        diagram: async () => {
          throw new Error("bad diagram");
        },
        math: async () => null,
      }),
    );
    expect(resolved.blocks[1]).toEqual(doc.blocks[1]);
    expect(resolved.blocks[0]).toMatchObject({ runs: [{}, {}, { kind: "math", latex: "x^2" }] });
  });
});
