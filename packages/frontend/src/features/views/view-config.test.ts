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
