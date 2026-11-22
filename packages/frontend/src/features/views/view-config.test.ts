import { describe, expect, it } from "vitest";
import { parseViewConfig, serializeViewConfig } from "./view-config.ts";

const display = (stored: Partial<{ layout: string }>) => ({ layout: stored.layout ?? "list" });

describe("view config filters", () => {
  it("keeps how a filter is joined to the one before it", () => {
    const raw = serializeViewConfig(
      [
        { fieldId: "status", operator: "is", values: ["a"] },
        { fieldId: "labels", operator: "isNot", values: ["b"], join: "or" },
      ],
      display({}),
    );
    expect(parseViewConfig(raw, display).filters).toEqual([
      { fieldId: "status", operator: "is", values: ["a"] },
      { fieldId: "labels", operator: "isNot", values: ["b"], join: "or" },
    ]);
  });

  it("reads a View saved before filters could be joined as and", () => {
    const raw = '{"filters":[{"fieldId":"status","operator":"is","values":["a"]}]}';
    expect(parseViewConfig(raw, display).filters).toEqual([
      { fieldId: "status", operator: "is", values: ["a"] },
    ]);
  });

  it("drops a join it does not know", () => {
    const raw = '{"filters":[{"fieldId":"status","operator":"is","values":["a"],"join":"xor"}]}';
    expect(parseViewConfig(raw, display).filters).toEqual([
      { fieldId: "status", operator: "is", values: ["a"] },
    ]);
  });
});

describe("view config query", () => {
  it("keeps the search text a View was saved with", () => {
    const raw = serializeViewConfig([], display({}), "fourier");
    expect(parseViewConfig(raw, display).query).toBe("fourier");
  });

  it("leaves the key out when there is no search text, so older Views read the same", () => {
    expect(serializeViewConfig([], display({}), "")).toBe(serializeViewConfig([], display({})));
    expect(parseViewConfig('{"filters":[]}', display).query).toBeUndefined();
  });

  it("ignores a query that is not text", () => {
    expect(parseViewConfig('{"query":4}', display).query).toBeUndefined();
  });
});
