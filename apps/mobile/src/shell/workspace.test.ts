import {
  type Workspace,
  activePath,
  back,
  closeOtherTabs,
  closeTab,
  forward,
  keepPreview,
  newWorkspace,
  open,
  parseWorkspace,
  pinTab,
  splitRight,
  visibleGroups,
} from "./workspace.ts";

let n = 0;
const ids = () => `id-${++n}`;
const start = () => newWorkspace(ids);
const focusedTabs = (ws: Workspace) =>
  ws.layout.groups.find((g) => g.id === ws.layout.focusedGroupId)?.tabs ?? [];

// The tablet's window is the desktop's: groups of tabs side by side, each tab with its own
// Back and Forward, so a tab's history is the navigation (D83, 1.4 to 1.6, 1.10).
describe("the tablet's workspace", () => {
  it("closes the other tabs but keeps the pinned ones, as the desktop's tab menu does", () => {
    let ws = open(start(), "/trash", "here", ids);
    ws = open(ws, "/pinned", "newTab", ids);
    ws = open(ws, "/calendar", "newTab", ids);
    const [trash, , calendar] = focusedTabs(ws);
    ws = pinTab(ws, trash.id, true);
    ws = closeOtherTabs(ws, calendar.id);
    expect(focusedTabs(ws).map((t) => t.view)).toEqual(["/trash", "/calendar"]);
  });

  it("opens a page in the tab shown, and goes back and forward in that tab only", () => {
    let ws = open(start(), "/tasks", "here", ids);
    ws = open(ws, "/entity/a", "here", ids);
    expect(activePath(ws)).toBe("/entity/a");
    ws = open(ws, "/calendar", "newTab", ids);
    expect(focusedTabs(ws)).toHaveLength(2);
    expect(back(ws)).toBe(ws);
    ws = open(ws, "/pinned", "here", ids);
    ws = back(ws);
    expect(activePath(ws)).toBe("/calendar");
    // The first tab kept its own history.
    const first = focusedTabs(ws)[0];
    expect(first.view).toBe("/entity/a");
    expect(first.backStack).toEqual(["/", "/tasks"]);
    ws = forward(ws);
    expect(activePath(ws)).toBe("/pinned");
  });

  // A tab's history grew with every step for as long as the app ran, and was saved whole
  // on each one; the desktop keeps the last 50.
  it("keeps the last 50 steps of a tab's history, as the desktop", () => {
    let ws = start();
    for (let i = 0; i < 60; i++) ws = open(ws, `/trash?step=${i}`, "here", ids);
    const [tab] = focusedTabs(ws);
    expect(tab.backStack).toHaveLength(50);
    expect(tab.backStack.at(-1)).toBe("/trash?step=58");
  });

  it("does not count the page shown again as a step", () => {
    const ws = open(start(), "/tasks", "here", ids);
    expect(open(ws, "/tasks", "here", ids)).toBe(ws);
  });

  it("opens an item beside the list it was picked from, replacing the last one picked", () => {
    let ws = open(start(), "/module/s/tasks", "here", ids);
    ws = open(ws, "/entity/a", "beside", ids);
    expect(ws.layout.groups).toHaveLength(2);
    // The list keeps the focus, so the next pick goes beside it as well.
    expect(activePath(ws)).toBe("/module/s/tasks");
    const right = ws.layout.groups[1];
    expect(right.tabs.map((t) => t.view)).toEqual(["/entity/a"]);
    ws = open(ws, "/entity/b", "beside", ids);
    expect(ws.layout.groups[1].tabs.map((t) => t.view)).toEqual(["/entity/b"]);
    // Once kept (edited or pinned), the next pick opens a tab of its own.
    ws = keepPreview(ws, ws.layout.groups[1].tabs[0].id);
    ws = open(ws, "/entity/c", "beside", ids);
    expect(ws.layout.groups[1].tabs.map((t) => t.view)).toEqual(["/entity/b", "/entity/c"]);
  });

  it("opens on the right as a tab of its own and focuses it", () => {
    let ws = open(start(), "/tasks", "here", ids);
    ws = open(ws, "/entity/a", "right", ids);
    expect(ws.layout.groups).toHaveLength(2);
    expect(activePath(ws)).toBe("/entity/a");
    expect(ws.preview).toEqual({});
  });

  it("splits a copy of the tab with its history", () => {
    let ws = open(start(), "/tasks", "here", ids);
    ws = open(ws, "/entity/a", "here", ids);
    ws = splitRight(ws, ids);
    const [left, right] = ws.layout.groups;
    expect(right.tabs[0].view).toBe("/entity/a");
    expect(right.tabs[0].backStack).toEqual(["/", "/tasks"]);
    expect(right.tabs[0].id).not.toBe(left.tabs[0].id);
    expect(ws.layout.focusedGroupId).toBe(right.id);
  });

  it("closes the right group with its last tab, and leaves a Dashboard after the last of all", () => {
    let ws = open(open(start(), "/tasks", "here", ids), "/entity/a", "right", ids);
    ws = closeTab(ws, ws.layout.groups[1].tabs[0].id, ids);
    expect(ws.layout.groups).toHaveLength(1);
    ws = closeTab(ws, ws.layout.groups[0].tabs[0].id, ids);
    expect(activePath(ws)).toBe("/");
  });

  it("keeps pinned tabs first", () => {
    let ws = open(start(), "/calendar", "newTab", ids);
    ws = pinTab(ws, focusedTabs(ws)[1].id, true);
    expect(focusedTabs(ws).map((t) => t.view)).toEqual(["/calendar", "/"]);
  });

  it("shows only the focused group where two do not fit", () => {
    const ws = open(open(start(), "/tasks", "here", ids), "/entity/a", "beside", ids);
    const [left, right] = ws.layout.groups;
    expect(visibleGroups(ws, 1100).map((g) => g.id)).toEqual([left.id, right.id]);
    // Each needs 360: a 13-inch iPad in portrait less the sidebar is 752, enough; a mini is not.
    expect(visibleGroups(ws, 752).map((g) => g.id)).toEqual([left.id, right.id]);
    expect(visibleGroups(ws, 700).map((g) => g.id)).toEqual([left.id]);
    expect(visibleGroups({ ...ws, zoomed: true }, 1100).map((g) => g.id)).toEqual([left.id]);
  });

  it("reads what was saved, and starts afresh from anything else", () => {
    const ws = open(open(start(), "/tasks", "here", ids), "/entity/a", "beside", ids);
    expect(parseWorkspace(JSON.stringify(ws), ids)).toEqual(ws);
    expect(activePath(parseWorkspace("{broken", ids))).toBe("/");
    // The tabs of the first tablet version carry over.
    const old = JSON.stringify({
      tabs: [
        { id: "t1", path: "/tasks", right: "/entity/a" },
        { id: "t2", path: "/calendar", right: null },
      ],
      active: "t2",
    });
    const carried = parseWorkspace(null, ids, old);
    expect(carried.layout.groups[0].tabs.map((t) => t.view)).toEqual(["/tasks", "/calendar"]);
    expect(activePath(carried)).toBe("/calendar");
  });
});
