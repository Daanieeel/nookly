import {
  type TabsState,
  closeOtherTabs,
  closeTab,
  newTab,
  parseTabs,
  selectOffset,
  selectTab,
  setRightPane,
  startTabs,
  titleOfPath,
  visit,
} from "./tabs.ts";

const ids = () => {
  let n = 0;
  return () => `t${++n}`;
};

const paths = (state: TabsState) => state.tabs.map((t) => t.path);

describe("tabs", () => {
  it("start with one, on the dashboard", () => {
    const state = startTabs(ids());
    expect(paths(state)).toEqual(["/"]);
    expect(state.active).toBe(state.tabs[0].id);
  });

  it("follow the page the router shows, in the tab that is open", () => {
    const next = ids();
    let state = startTabs(next);
    state = visit(state, "/tasks");
    expect(paths(state)).toEqual(["/tasks"]);
    state = newTab(state, next);
    state = visit(state, "/entity/a");
    expect(paths(state)).toEqual(["/tasks", "/entity/a"]);
  });

  it("leave sheets out, they are not places a tab lives in", () => {
    const state = visit(startTabs(ids()), "/new/task");
    expect(paths(state)).toEqual(["/"]);
  });

  it("open next to the one open, and the new one is open", () => {
    const next = ids();
    let state = startTabs(next);
    state = newTab(state, next);
    state = selectTab(state, state.tabs[0].id);
    state = newTab(state, next);
    expect(state.tabs.map((t) => t.id)).toEqual(["t1", "t3", "t2"]);
    expect(state.active).toBe("t3");
  });

  it("close, and the one beside takes over; the last one closed leaves a new dashboard", () => {
    const next = ids();
    let state = newTab(newTab(startTabs(next), next), next);
    state = closeTab(state, state.active);
    expect(state.tabs.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(state.active).toBe("t2");
    state = closeTab(closeTab(state, "t2"), "t1");
    expect(paths(state)).toEqual(["/"]);
    expect(state.tabs).toHaveLength(1);
  });

  it("keep one and close the rest", () => {
    const next = ids();
    const state = closeOtherTabs(newTab(newTab(startTabs(next), next), next), "t2");
    expect(state.tabs.map((t) => t.id)).toEqual(["t2"]);
    expect(state.active).toBe("t2");
  });

  it("go round with next and previous", () => {
    const next = ids();
    let state = newTab(newTab(startTabs(next), next), next);
    expect(state.active).toBe("t3");
    state = selectOffset(state, 1);
    expect(state.active).toBe("t1");
    state = selectOffset(state, -1);
    expect(state.active).toBe(state.tabs.at(-1)?.id);
  });

  it("hold a second page beside the first, and let go of it", () => {
    let state = startTabs(ids());
    state = setRightPane(state, "/entity/b");
    expect(state.tabs[0].right).toBe("/entity/b");
    state = setRightPane(state, null);
    expect(state.tabs[0].right).toBeNull();
  });

  it("read back what was saved, or start again from what is not", () => {
    const state = setRightPane(newTab(startTabs(ids()), ids()), "/entity/x");
    expect(parseTabs(JSON.stringify(state), ids())).toEqual(state);
    expect(paths(parseTabs("garbage", ids()))).toEqual(["/"]);
    expect(paths(parseTabs(JSON.stringify({ tabs: [], active: "x" }), ids()))).toEqual(["/"]);
  });
});

describe("a tab's name", () => {
  it("is the page's, for the pages that are not an item", () => {
    expect(titleOfPath("/")).toBe("Dashboard");
    expect(titleOfPath("/calendar")).toBe("Calendar");
    expect(titleOfPath("/tasks")).toBe("Tasks");
    expect(titleOfPath("/settings")).toBe("Settings");
    expect(titleOfPath("/module/s1/notes")).toBe("Notes");
    expect(titleOfPath("/entity/abc")).toBeNull();
  });
});
