import { describe, expect, it } from "vitest";
import { type Tab, makeTab, moveTab, pinnedFirst, tabAfterClose } from "./tab-model.ts";

function tab(id: string, pinned = false): Tab {
  return { ...makeTab({ kind: "dashboard" }, pinned), id };
}
const ids = (tabs: Tab[]) => tabs.map((t) => t.id);

describe("makeTab", () => {
  it("starts a tab without history and with a unique id", () => {
    const a = makeTab({ kind: "pinned" });
    const b = makeTab({ kind: "pinned" });
    expect(a).toMatchObject({
      view: { kind: "pinned" },
      backStack: [],
      forwardStack: [],
      pinned: false,
    });
    expect(a.id).not.toBe(b.id);
  });
});

describe("pinnedFirst", () => {
  it("moves pinned tabs first, keeping both groups in order", () => {
    expect(ids(pinnedFirst([tab("a"), tab("b", true), tab("c"), tab("d", true)]))).toEqual([
      "b",
      "d",
      "a",
      "c",
    ]);
  });
});

describe("tabAfterClose", () => {
  const tabs = [tab("a"), tab("b"), tab("c")];

  it("picks the tab to the right", () => {
    expect(tabAfterClose(tabs, "b")?.id).toBe("c");
  });

  it("picks the tab to the left when closing the last", () => {
    expect(tabAfterClose(tabs, "c")?.id).toBe("b");
  });

  it("finds nothing for the only tab", () => {
    expect(tabAfterClose([tab("a")], "a")).toBeUndefined();
  });
});

describe("moveTab", () => {
  const tabs = [tab("a"), tab("b"), tab("c")];

  it("moves a tab to an index", () => {
    expect(ids(moveTab(tabs, "c", 0))).toEqual(["c", "a", "b"]);
    expect(ids(moveTab(tabs, "a", 2))).toEqual(["b", "c", "a"]);
  });

  it("clamps the index", () => {
    expect(ids(moveTab(tabs, "a", 99))).toEqual(["b", "c", "a"]);
    expect(ids(moveTab(tabs, "c", -4))).toEqual(["c", "a", "b"]);
  });

  it("returns the tabs unchanged for an unknown id", () => {
    expect(moveTab(tabs, "z", 0)).toBe(tabs);
  });

  it("never moves an unpinned tab before a pinned one", () => {
    expect(ids(moveTab([tab("p", true), tab("a"), tab("b")], "b", 0))).toEqual(["p", "b", "a"]);
  });
});
