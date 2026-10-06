import { describe, expect, it } from "vitest";
import { renderCircuit } from "./render";

describe("renderCircuit", () => {
  it("draws the circuit into the element", async () => {
    const element = document.createElement("div");
    expect(await renderCircuit("Y = A & B", element)).toBeNull();
    expect(element.querySelector("svg")).not.toBeNull();
  });

  it("answers with the problem and draws nothing when the code is wrong", async () => {
    const element = document.createElement("div");
    element.innerHTML = "<svg></svg>";
    expect(await renderCircuit("Y = A &", element)).toMatch(/^Line 1:/);
    expect(element.innerHTML).toBe("");
  });
});
