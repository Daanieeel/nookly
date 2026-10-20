import { DEFAULT_TOP, orderedTop, visibleTop } from "./sidebar-top.ts";

describe("the top of the sidebar", () => {
  it("shows everything in the default order", () => {
    expect(visibleTop(DEFAULT_TOP).map((i) => i.id)).toEqual([
      "dashboard",
      "calendar",
      "tasks",
      "assignments",
      "pinned",
      "jot",
    ]);
  });

  it("follows a remembered order and leaves out what is hidden", () => {
    const pref = { order: ["tasks", "dashboard"], hidden: ["calendar"] };
    expect(visibleTop(pref).map((i) => i.id)).toEqual([
      "tasks",
      "dashboard",
      "assignments",
      "pinned",
      "jot",
    ]);
    expect(orderedTop(pref).map((i) => i.id)).toEqual([
      "tasks",
      "dashboard",
      "calendar",
      "assignments",
      "pinned",
      "jot",
    ]);
  });

  it("ignores items it doesn't know, so an older or newer memory never breaks the sidebar", () => {
    expect(
      visibleTop({ order: ["gone", "calendar"], hidden: ["also gone"] }).map((i) => i.id),
    ).toEqual(["calendar", "dashboard", "tasks", "assignments", "pinned", "jot"]);
  });
});
