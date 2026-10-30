import { describe, expect, it } from "vitest";
import { renderPlot } from "./render";

describe("renderPlot", () => {
  it("draws the legend as formulas once they have loaded", async () => {
    const element = document.createElement("div");
    expect(await renderPlot("f(x) = x^2", element, false)).toBeNull();
    expect(element.querySelectorAll("path[data-c]").length).toBeGreaterThan(0);
    expect(element.textContent).not.toContain("f(x) = x^2");
    // Loaded now, so the next plot has them at once.
    const next = document.createElement("div");
    const done = renderPlot("y = x", next, true);
    expect(next.querySelectorAll("path[data-c]").length).toBeGreaterThan(0);
    await done;
  });

  it("says what is wrong with the code and clears the picture", async () => {
    const element = document.createElement("div");
    element.innerHTML = "<svg></svg>";
    expect(await renderPlot("y = x +", element, false)).toBe(
      "Line 1: the expression ends too early",
    );
    expect(element.innerHTML).toBe("");
  });
});
