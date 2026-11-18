import { createPathFor } from "./create-path.ts";

// The desktop's New (`Cmd+N`) creates in the list or calendar shown (10.1).
describe("what New creates", () => {
  it("makes the item of the page shown, in its Space", () => {
    expect(createPathFor("/module/s1/tasks")).toBe("/new/task?spaceId=s1");
    expect(createPathFor("/module/s1/notes?view=v")).toBe("/new/page?spaceId=s1");
    expect(createPathFor("/module/s1/decks")).toBe("/new/deck?spaceId=s1");
    expect(createPathFor("/module/s1/files")).toBe("/new/import?spaceId=s1");
    expect(createPathFor("/module/s1/calendar")).toBe("/new/entry?spaceId=s1");
    expect(createPathFor("/tasks")).toBe("/new/task");
    expect(createPathFor("/calendar")).toBe("/new/entry");
    expect(createPathFor("/assignments")).toBe("/new/assignment");
  });

  it("makes a page anywhere else", () => {
    expect(createPathFor("/")).toBe("/new/page");
    expect(createPathFor("/entity/abc")).toBe("/new/page");
    expect(createPathFor("/module/s1/grades")).toBe("/new/page?spaceId=s1");
  });
});
