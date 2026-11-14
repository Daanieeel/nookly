import { runOn } from "./handle.ts";

describe("running an editor command from the page", () => {
  // The bug: leaving a page whose web editor had not handed over its methods yet threw
  // "undefined is not a function" and showed the red error screen.
  it("does nothing while the editor's methods are not there yet", () => {
    expect(() => runOn({}, "done")).not.toThrow();
    expect(() => runOn(null, "done")).not.toThrow();
  });

  it("runs the command once they are", () => {
    const ran: string[] = [];
    runOn({ run: (id: string) => ran.push(id) }, "undo");
    expect(ran).toEqual(["undo"]);
  });
});
