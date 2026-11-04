import { describe, expect, it } from "vitest";
import { finishedFilter, pendingFilter, suggestNames, withChip } from "./search-query.ts";

const spaces = [
  { id: "s1", name: "Study" },
  { id: "s2", name: "Work" },
];
const labels = [{ name: "Urgent" }, { name: "Later" }];

describe("pendingFilter", () => {
  it("finds the filter at the end of the input and what stays before it", () => {
    expect(pendingFilter("notes in:Stu")).toEqual({
      kind: "space",
      partial: "Stu",
      before: "notes ",
    });
    expect(pendingFilter("#urg")).toEqual({ kind: "label", partial: "urg", before: "" });
    expect(pendingFilter("IN:")).toEqual({ kind: "space", partial: "", before: "" });
  });

  it("ignores a # or in: inside a word", () => {
    expect(pendingFilter("C#")).toBeNull();
    expect(pendingFilter("main:")).toBeNull();
    expect(pendingFilter("plain text")).toBeNull();
  });
});

describe("suggestNames", () => {
  it("lists names that start with the text before names that contain it", () => {
    const names = [{ name: "Spring" }, { name: "Gaming" }, { name: "Ping" }];
    expect(suggestNames(names, "ing").map((n) => n.name)).toEqual(["Spring", "Gaming", "Ping"]);
    expect(suggestNames(names, "p").map((n) => n.name)).toEqual(["Ping", "Spring"]);
  });

  it("ignores case and accents, and lists everything for no text", () => {
    expect(suggestNames([{ name: "Übungen" }], "ubu")).toHaveLength(1);
    expect(suggestNames(spaces, "")).toHaveLength(2);
  });
});

describe("finishedFilter", () => {
  it("turns a finished in: word into a Space chip and takes it out of the text", () => {
    expect(finishedFilter("report in:study ", spaces, labels)).toEqual({
      text: "report ",
      chip: { kind: "space", spaceId: "s1", name: "Study" },
    });
  });

  it("turns a finished # word into a label chip", () => {
    expect(finishedFilter("#urgent ", spaces, labels)?.chip).toEqual({
      kind: "label",
      name: "Urgent",
    });
  });

  it("waits for the space, and for a name that exists", () => {
    expect(finishedFilter("in:study", spaces, labels)).toBeNull();
    expect(finishedFilter("in:nowhere ", spaces, labels)).toBeNull();
    expect(finishedFilter("#nope ", spaces, labels)).toBeNull();
  });
});

describe("withChip", () => {
  it("keeps one Space chip and no label twice", () => {
    const study = { kind: "space", spaceId: "s1", name: "Study" } as const;
    const work = { kind: "space", spaceId: "s2", name: "Work" } as const;
    const urgent = { kind: "label", name: "Urgent" } as const;
    expect(withChip([study], work)).toEqual([work]);
    expect(withChip([urgent], { kind: "label", name: "urgent" })).toEqual([urgent]);
    expect(withChip([urgent], study)).toEqual([urgent, study]);
  });
});
