import { COMMANDS, filterCommands } from "./commands.ts";

const titles = (query: string) => filterCommands(COMMANDS, query).map((c) => c.title);

describe("the commands list", () => {
  it("shows everything before anything is typed", () => {
    expect(filterCommands(COMMANDS, "  ")).toEqual(COMMANDS);
  });

  it("puts titles that start with the words first, then words inside, then synonyms", () => {
    // Words beginning with it, in the list's order.
    expect(titles("task")).toEqual(["Go to Tasks", "New Task"]);
    // A title that begins with it comes before one that has it later.
    expect(titles("new t")[0]).toBe("New Task");
    expect(titles("sync")[0]).toBe("Sync Now");
    // Synonyms come last.
    expect(titles("todo")).toEqual(["Go to Tasks", "New Task"]);
  });

  it("needs every typed word to match, in any order", () => {
    expect(titles("collapse sidebar")).toEqual(["Collapse or Expand the Sidebar"]);
    expect(titles("sidebar collapse")).toEqual(["Collapse or Expand the Sidebar"]);
    expect(titles("go tasks")).toEqual(["Go to Tasks"]);
  });

  it("matches in any case and ignores what does not match", () => {
    expect(titles("CALENDAR")).toEqual(["Go to Calendar", "New Calendar Entry"]);
    expect(titles("zzzz")).toEqual([]);
  });

  it("opens every sheet and page it names", () => {
    for (const command of COMMANDS) {
      expect(Boolean(command.route) !== Boolean(command.action)).toBe(true);
      if (command.route) expect(command.route.startsWith("/")).toBe(true);
    }
  });

  it("has no two commands with one id", () => {
    expect(new Set(COMMANDS.map((c) => c.id)).size).toBe(COMMANDS.length);
  });
});
