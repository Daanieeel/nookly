import { matchPage } from "./pages.tsx";

// Every page of the app is a tab on a tablet, drawn from the same route files the phone's
// stack draws; create forms and other modals are not pages.
describe("the tablet's pages", () => {
  it("match a path with the route's params and the query", () => {
    expect(matchPage("/entity/abc")).toMatchObject({
      pattern: "entity/[id]",
      params: { id: "abc" },
    });
    expect(matchPage("/module/s1/notes")).toMatchObject({
      kind: "list",
      params: { spaceId: "s1", module: "notes" },
    });
    expect(matchPage("/moodle/forum/3?courseId=2&name=Week%201")?.params).toEqual({
      id: "3",
      courseId: "2",
      name: "Week 1",
    });
    expect(matchPage("/moodle/file")?.pattern).toBe("moodle/file");
    expect(matchPage("/moodle/7")?.pattern).toBe("moodle/[courseId]");
    // Settings is a dialog over the window on a tablet, never a page in a tab (8.1).
    expect(matchPage("/settings/shortcuts")).toBeNull();
    expect(matchPage("/")?.kind).toBe("list");
  });

  it("leave sheets, signing in and a study session to the router", () => {
    for (const path of [
      "/new/task",
      "/pick/icon",
      "/welcome",
      "/account/sign-in",
      "/study/d1",
      "/calendar-event?id=1",
    ]) {
      expect(matchPage(path)).toBeNull();
    }
  });
});
