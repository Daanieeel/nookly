import { describe, expect, it } from "vitest";
import { UNLABELLED, labelShelf } from "./label-shelf.ts";

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
