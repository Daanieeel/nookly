/// The phone's JavaScript engine (Hermes) lacks the copying array methods the shared code
/// uses (`toSorted`, `toReversed`); without them What's New and an item's links crashed.
describe("array polyfills", () => {
  const names = ["toSorted", "toReversed", "toSpliced", "with"] as const;
  const saved = Object.fromEntries(
    names.map((n) => [n, Object.getOwnPropertyDescriptor(Array.prototype, n)]),
  );
  afterEach(() => {
    for (const n of names) {
      const d = saved[n];
      if (d) Object.defineProperty(Array.prototype, n, d);
    }
  });

  it("adds what the engine lacks, copying and leaving the array as it was", () => {
    for (const n of names) Reflect.deleteProperty(Array.prototype, n);
    jest.isolateModules(() => {
      require("./polyfills.ts");
    });
    const list = [3, 1, 2];
    expect(list.toSorted()).toEqual([1, 2, 3]);
    expect(list.toSorted((a, b) => b - a)).toEqual([3, 2, 1]);
    expect(list.toReversed()).toEqual([2, 1, 3]);
    expect(list.toSpliced(1, 1, 9, 8)).toEqual([3, 9, 8, 2]);
    expect(list.with(-1, 7)).toEqual([3, 1, 7]);
    expect(list).toEqual([3, 1, 2]);
    expect(Object.keys(list)).toEqual(["0", "1", "2"]);
    expect(() => list.with(5, 0)).toThrow(RangeError);
  });

  it("keeps the engine's own where it has them", () => {
    const own = Array.prototype.toSorted;
    jest.isolateModules(() => {
      require("./polyfills.ts");
    });
    expect(Array.prototype.toSorted).toBe(own);
  });
});
