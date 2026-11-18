import { runOnce } from "./run-once.ts";

describe("what the app makes once per run", () => {
  it("is made the first time and handed back after the file runs again (a hot reload)", () => {
    let made = 0;
    const make = () => ({ n: ++made });
    const first = runOnce("test-thing", make);
    // A hot reload runs the module again: a new `make`, the same key.
    const again = runOnce("test-thing", () => ({ n: ++made }));
    expect(again).toBe(first);
    expect(made).toBe(1);
  });

  it("keeps different things apart", () => {
    expect(runOnce("test-a", () => "a")).toBe("a");
    expect(runOnce("test-b", () => "b")).toBe("b");
  });
});
