import { shownRoute } from "./follow-router.ts";

// The tablet does not draw the router's stack of pages; it reads which page the router
// was sent to and opens it in a tab (D83).
describe("the route the router shows", () => {
  it("is the deepest focused one", () => {
    const state = {
      index: 1,
      routes: [
        { key: "a", name: "(drawer)" },
        { key: "b", name: "entity/[id]", params: { id: "x1" } },
      ],
    };
    expect(shownRoute(state)).toEqual({ key: "b", path: "/entity/x1" });
  });

  it("reads a page inside the top level stack, drawn or not", () => {
    const drawn = {
      index: 0,
      routes: [
        {
          key: "a",
          name: "(drawer)",
          state: {
            index: 0,
            routes: [
              {
                key: "c",
                name: "module/[spaceId]/[module]",
                params: { spaceId: "s", module: "notes" },
              },
            ],
          },
        },
      ],
    };
    expect(shownRoute(drawn)).toEqual({ key: "c", path: "/module/s/notes" });
    // Not drawn on a tablet: a made up first state, and the page in the params.
    const pending = {
      index: 0,
      routes: [
        {
          key: "a",
          name: "(drawer)",
          params: { screen: "tasks", params: {} },
          state: { routes: [{ name: "index" }] },
        },
      ],
    };
    expect(shownRoute(pending)).toEqual({ key: "a", path: "/tasks" });
  });

  it("leaves out the router's own root", () => {
    const state = {
      routes: [
        {
          key: "r",
          name: "__root",
          state: { routes: [{ key: "e", name: "entity/[id]", params: { id: "x" } }] },
        },
      ],
    };
    expect(shownRoute(state)?.path).toBe("/entity/x");
  });

  it("keeps a page's query", () => {
    const state = {
      routes: [
        { key: "m", name: "moodle/forum/[id]", params: { id: "3", courseId: "2", name: "News" } },
      ],
    };
    expect(shownRoute(state)?.path).toBe("/moodle/forum/3?courseId=2&name=News");
  });
});
