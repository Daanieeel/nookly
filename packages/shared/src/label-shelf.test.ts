import { describe, expect, it } from "vitest";
import { UNLABELLED, labelCounts, labelShelf, togglePick } from "./label-shelf.ts";

const files = [
  { name: "a", labels: ["uni", "math"] },
  { name: "b", labels: ["uni", "math", "exam"] },
  { name: "c", labels: ["uni"] },
  { name: "d", labels: ["home"] },
  { name: "e", labels: [] },
  { name: "f", labels: [] },
];
const names = new Map([
  ["uni", "Uni"],
  ["math", "Math"],
  ["exam", "Exam"],
  ["home", "Home"],
]);
const shelf = (picked: string[]) =>
  labelShelf(
    files,
    (f) => f.labels,
    picked,
    (id) => names.get(id) ?? id,
  );

describe("the label shelf (D74)", () => {
  it("lists every label with its files, most used first, and the files with none", () => {
    const { shown, labels, unlabelled } = shelf([]);
    expect(shown).toHaveLength(6);
    expect(labels).toEqual([
      { id: "uni", count: 3 },
      { id: "math", count: 2 },
      { id: "exam", count: 1 },
      { id: "home", count: 1 },
    ]);
    expect(unlabelled).toBe(2);
  });

  it("drills in: only files with every picked label, and the labels they also carry", () => {
    const { shown, labels } = shelf(["uni", "math"]);
    expect(shown.map((f) => f.name)).toEqual(["a", "b"]);
    expect(labels).toEqual([{ id: "exam", count: 1 }]);
  });

  it("lists the files with no label when Unlabelled is picked", () => {
    const { shown, labels, unlabelled } = shelf([UNLABELLED]);
    expect(shown.map((f) => f.name)).toEqual(["e", "f"]);
    expect(labels).toEqual([]);
    expect(unlabelled).toBe(2);
  });

  it("forgets a picked label that no file carries anymore", () => {
    expect(shelf(["gone"]).shown).toHaveLength(6);
  });
});

describe("labelCounts", () => {
  it("counts every label, the unused too, most used first, and the items with none", () => {
    const labels = [
      { id: "a", name: "Art" },
      { id: "b", name: "Bio" },
      { id: "c", name: "Chem" },
    ];
    const items = [["b"], ["b", "a"], []];
    const counts = labelCounts(items, (i) => i, labels);
    expect(counts.labels.map((l) => [l.label.id, l.count])).toEqual([
      ["b", 2],
      ["a", 1],
      ["c", 0],
    ]);
    expect(counts.unlabelled).toBe(1);
  });
});

describe("togglePick", () => {
  it("ticks and unticks, and keeps labels and the files without one apart", () => {
    expect(togglePick([], "a")).toEqual(["a"]);
    expect(togglePick(["a"], "b")).toEqual(["a", "b"]);
    expect(togglePick(["a", "b"], "a")).toEqual(["b"]);
    expect(togglePick(["a", "b"], UNLABELLED)).toEqual([UNLABELLED]);
    expect(togglePick([UNLABELLED], "a")).toEqual(["a"]);
  });
});
