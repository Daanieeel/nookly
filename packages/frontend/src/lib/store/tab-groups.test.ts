import { describe, expect, it } from "vitest";
import type { View } from "./nav.ts";
import type { Tab } from "./tab-model.ts";
import {
  type TabLayout,
  activateTab,
  addTab,
  canSplitRight,
  clampSplitRatio,
  closeOtherTabs,
  closeTab,
  cycleTab,
  focusGroup,
  focusedGroup,
  moveTabToGroup,
  pinTab,
  reorderTab,
  splitRight,
} from "./tab-groups.ts";

const dashboard: View = { kind: "dashboard" };
const tab = (id: string, pinned = false): Tab => ({
  id,
  view: { kind: "entity", entityId: id, spaceId: "s" },
  backStack: [dashboard],
  forwardStack: [],
  pinned,
});
const fresh = () => ({ ...tab("fresh"), view: dashboard, backStack: [] });

function single(...ids: string[]): TabLayout {
  return {
    groups: [{ id: "L", tabs: ids.map((id) => tab(id)), activeTabId: ids[0] }],
    focusedGroupId: "L",
  };
}

function split(left: string[], right: string[], focused = "L"): TabLayout {
  return {
    groups: [
      { id: "L", tabs: left.map((id) => tab(id)), activeTabId: left[0] },
      { id: "R", tabs: right.map((id) => tab(id)), activeTabId: right[0] },
    ],
    focusedGroupId: focused,
  };
}

const ids = (layout: TabLayout) => layout.groups.map((g) => g.tabs.map((t) => t.id));

describe("tab groups, opening", () => {
  it("adds a tab to the focused group only", () => {
    const next = addTab(split(["a"], ["b"], "R"), tab("c"), true);
    expect(ids(next)).toEqual([["a"], ["b", "c"]]);
    expect(focusedGroup(next).activeTabId).toBe("c");
  });

  it("can add a tab in the background", () => {
    const next = addTab(single("a"), tab("b"), false);
    expect(focusedGroup(next).activeTabId).toBe("a");
  });

  it("activating a tab in the other group focuses that group", () => {
    const next = activateTab(split(["a"], ["b", "c"]), "c");
    expect(next.focusedGroupId).toBe("R");
    expect(next.groups[1].activeTabId).toBe("c");
  });

  it("focuses a group, ignoring unknown ones", () => {
    const layout = split(["a"], ["b"]);
    expect(focusGroup(layout, "R").focusedGroupId).toBe("R");
    expect(focusGroup(layout, "nope")).toBe(layout);
  });

  it("cycles within the focused group", () => {
    const layout = split(["a", "b"], ["c", "d"], "R");
    expect(cycleTab(layout, 1).groups[1].activeTabId).toBe("d");
    expect(cycleTab(layout, -1).groups[1].activeTabId).toBe("d");
    expect(cycleTab(layout, 1).groups[0].activeTabId).toBe("a");
  });
});

describe("tab groups, Split Right", () => {
  it("opens a copy in a new right group and focuses it", () => {
    const next = splitRight(single("a"), "a", tab("a2"));
    expect(ids(next)).toEqual([["a"], ["a2"]]);
    expect(next.focusedGroupId).toBe(next.groups[1].id);
  });

  it("adds the copy to the existing right group", () => {
    const next = splitRight(split(["a", "b"], ["c"]), "b", tab("b2"));
    expect(ids(next)).toEqual([
      ["a", "b"],
      ["c", "b2"],
    ]);
    expect(next.groups[1].activeTabId).toBe("b2");
  });

  it("never makes a third group", () => {
    const layout = split(["a"], ["b"]);
    expect(splitRight(layout, "b", tab("b2"))).toBe(layout);
    expect(canSplitRight(layout, "b")).toBe(false);
    expect(canSplitRight(layout, "a")).toBe(true);
  });
});

describe("tab groups, moving", () => {
  it("moves a tab into a new right group", () => {
    const next = moveTabToGroup(single("a", "b"), "b", "new-right");
    expect(ids(next)).toEqual([["a"], ["b"]]);
    expect(next.groups[0].activeTabId).toBe("a");
    expect(next.focusedGroupId).toBe(next.groups[1].id);
  });

  it("ignores moving the only tab into a new group", () => {
    const layout = single("a");
    expect(moveTabToGroup(layout, "a", "new-right")).toBe(layout);
  });

  it("moves into the existing right group when asked for a new one", () => {
    const next = moveTabToGroup(split(["a", "b"], ["c"]), "a", "new-right");
    expect(ids(next)).toEqual([["b"], ["c", "a"]]);
  });

  it("moves between groups at an index", () => {
    const next = moveTabToGroup(split(["a", "b"], ["c", "d"]), "a", { groupId: "R" }, 1);
    expect(ids(next)).toEqual([["b"], ["c", "a", "d"]]);
    expect(next.groups[0].activeTabId).toBe("b");
    expect(next.groups[1].activeTabId).toBe("a");
    expect(next.focusedGroupId).toBe("R");
  });

  it("closes the group its last tab leaves", () => {
    const next = moveTabToGroup(split(["a"], ["b"]), "b", { groupId: "L" });
    expect(ids(next)).toEqual([["a", "b"]]);
    expect(next.focusedGroupId).toBe("L");
  });

  it("closes the left group when its last tab moves right", () => {
    const next = moveTabToGroup(split(["a"], ["b"]), "a", { groupId: "R" }, 0);
    expect(ids(next)).toEqual([["a", "b"]]);
    expect(next.groups[0].id).toBe("R");
    expect(next.focusedGroupId).toBe("R");
  });

  it("keeps pinned tabs first in the destination", () => {
    const layout: TabLayout = {
      groups: [
        { id: "L", tabs: [tab("a"), tab("b")], activeTabId: "a" },
        { id: "R", tabs: [tab("p", true), tab("c")], activeTabId: "c" },
      ],
      focusedGroupId: "L",
    };
    expect(ids(moveTabToGroup(layout, "a", { groupId: "R" }, 0))).toEqual([["b"], ["p", "a", "c"]]);
  });

  it("reorders within a group", () => {
    expect(ids(reorderTab(split(["a", "b", "c"], ["d"]), "a", 2))).toEqual([
      ["b", "c", "a"],
      ["d"],
    ]);
    const same = moveTabToGroup(split(["a", "b"], ["c"]), "a", { groupId: "L" }, 1);
    expect(ids(same)).toEqual([["b", "a"], ["c"]]);
  });
});

describe("tab groups, closing", () => {
  it("shows the neighbour of a closed active tab", () => {
    const next = closeTab(split(["a", "b"], ["c"]), "a", fresh);
    expect(next.groups[0].activeTabId).toBe("b");
  });

  it("closes a group with its last tab and focuses the other", () => {
    const next = closeTab(split(["a"], ["b"], "R"), "b", fresh);
    expect(ids(next)).toEqual([["a"]]);
    expect(next.focusedGroupId).toBe("L");
  });

  it("leaves a fresh Dashboard tab after the last tab of all", () => {
    const next = closeTab(single("a"), "a", fresh);
    expect(ids(next)).toEqual([["fresh"]]);
    expect(next.groups[0].activeTabId).toBe("fresh");
  });

  it("closes other tabs within the group only", () => {
    const layout = split(["a", "b"], ["c", "d"]);
    const withPin = pinTab(layout, "b", true);
    expect(ids(closeOtherTabs(withPin, "a"))).toEqual([
      ["b", "a"],
      ["c", "d"],
    ]);
  });

  it("pins per group", () => {
    const next = pinTab(split(["a"], ["b", "c"]), "c", true);
    expect(next.groups[1].tabs.map((t) => [t.id, t.pinned])).toEqual([
      ["c", true],
      ["b", false],
    ]);
    expect(next.groups[0].tabs[0].pinned).toBe(false);
  });
});

describe("clampSplitRatio", () => {
  it.each([
    [0.5, 0.5],
    [0.05, 0.2],
    [0.95, 0.8],
    [Number.NaN, 0.5],
  ])("clamps %s to %s", (raw, ratio) => {
    expect(clampSplitRatio(raw)).toBe(ratio);
  });
});
