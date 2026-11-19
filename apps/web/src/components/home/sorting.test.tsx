import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sorting } from "./sorting";

function placed(container: HTMLElement) {
  return [...container.querySelectorAll("[data-place]")].map(
    (row) => row.getAttribute("data-placed") === "true",
  );
}

function scrap(container: HTMLElement, i: number) {
  return container.querySelectorAll("[data-scrap]")[i]?.getAttribute("data-scrap");
}

/// Runs the clock a step at a time, so each step the scene schedules after a render fires.
function run(ms: number) {
  for (let left = ms; left > 0; left -= 100) {
    act(() => {
      vi.advanceTimersByTime(100);
    });
  }
}

describe("Sorting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("starts with the three scraps loose and their places in the window still empty", () => {
    const { container } = render(<Sorting locale="en" />);
    expect(container.querySelectorAll("[data-scrap]")).toHaveLength(3);
    expect(placed(container)).toEqual([false, false, false]);
    expect(container.textContent).toContain("New assignment");
    expect(container.textContent).toContain("Fill in the rental form");
  });

  it("files each scrap into its place, one after the other", () => {
    const { container } = render(<Sorting locale="en" />);
    run(700);
    expect(scrap(container, 0)).toBe("flying");
    expect(scrap(container, 1)).toBe("loose");
    run(1000);
    expect(placed(container)).toEqual([true, false, false]);
    run(3_000);
    expect(placed(container)).toEqual([true, true, true]);
    expect(scrap(container, 2)).toBe("filed");
  });

  it("leaves an outline where each scrap lay once it has flown off", () => {
    const { container } = render(<Sorting locale="en" />);
    const outlines = () =>
      [...container.querySelectorAll("[data-outline]")].map((o) => o.getAttribute("data-outline"));
    expect(outlines()).toEqual(["hidden", "hidden", "hidden"]);
    run(700);
    expect(outlines()).toEqual(["shown", "hidden", "hidden"]);
    run(4_000);
    expect(outlines()).toEqual(["shown", "shown", "shown"]);
  });

  it("rests a few seconds, plays backwards, rests again and starts over, for ever", () => {
    const { container } = render(<Sorting locale="en" />);
    const scraps = () =>
      [...container.querySelectorAll("[data-scrap]")].map((s) => s.getAttribute("data-scrap"));
    run(5_000);
    expect(placed(container)).toEqual([true, true, true]);
    // Rests on the Dashboard for a few seconds first.
    run(2_500);
    expect(placed(container)).toEqual([true, true, true]);
    // Then the last one goes back first.
    run(1_000);
    expect(placed(container)).toEqual([true, true, false]);
    run(4_000);
    expect(placed(container)).toEqual([false, false, false]);
    expect(scraps()).toEqual(["loose", "loose", "loose"]);
    // Rests loose for a few seconds, then plays again.
    run(2_000);
    expect(scraps()).toEqual(["loose", "loose", "loose"]);
    run(4_000);
    expect(placed(container)[0]).toBe(true);
  });

  it("counts the new item in its panel's tab once it has landed", () => {
    const { container } = render(<Sorting locale="en" />);
    const tab = () => container.querySelector("[data-tab-count]")?.textContent;
    expect(tab()).toBe("4");
    run(5_000);
    expect(tab()).toBe("5");
  });

  it("shows everything in its place at once when the visitor prefers reduced motion", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: query.includes("reduce"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    const { container } = render(<Sorting locale="en" />);
    expect(placed(container)).toEqual([true, true, true]);
  });

  it("is a picture, hidden from screen readers", () => {
    const { container } = render(<Sorting locale="de" />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(container.textContent).toContain("Mieterformular ausfüllen");
  });
});
