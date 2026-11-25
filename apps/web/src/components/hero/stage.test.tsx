import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@nookly/ui/components/tooltip";
import { HeroStage, TOUR } from "./stage";

function show(locale: "en" | "de" = "en") {
  return render(
    <TooltipProvider>
      <HeroStage locale={locale} />
    </TooltipProvider>,
  );
}

function view(container: HTMLElement) {
  return container.querySelector("[data-stage-window]")?.getAttribute("data-view");
}

/// Runs the clock until the tour shows `target`, a step at a time, and fails if it never does.
function advanceUntil(container: HTMLElement, target: string) {
  for (let i = 0; i < 200 && view(container) !== target; i++) {
    act(() => {
      vi.advanceTimersByTime(100);
    });
  }
  expect(view(container)).toBe(target);
}

/// A whole tour draws four devices again for every step: more than the usual limit allows
/// on a machine that is running every other test at the same time.
const WHOLE_TOUR = { timeout: 30_000 };

describe("HeroStage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("opens on the Dashboard", () => {
    const { container } = show();
    expect(view(container)).toBe("dashboard");
    // The phone, both iPads and the desktop are all drawn; CSS shows the one that fits.
    expect(screen.getAllByText("Good morning, Mia.")).toHaveLength(4);
  });

  it("clicks through the app's features in order, then starts over", WHOLE_TOUR, () => {
    const { container } = show();
    for (const stop of TOUR) advanceUntil(container, stop.view);
    expect(view(container)).toBe("dashboard");
    advanceUntil(container, TOUR[0]!.view);
  });

  it("marks the page it shows as active in the sidebar and the titlebar", () => {
    const { container } = show();
    advanceUntil(container, "tasks");
    const active = container.querySelector("[data-tour-target][data-active=true]");
    expect(active?.getAttribute("data-tour-target")).toBe("tasks");
    expect(container.querySelector("[data-breadcrumb]")?.textContent).toContain("Tasks");
  });

  it("opens the command palette over the page", () => {
    const { container } = show();
    advanceUntil(container, "palette");
    expect(container.querySelector("[cmdk-root]")).not.toBeNull();
  });

  it("opens a recent note from the palette, the way the app's Search does", () => {
    const { container } = show();
    advanceUntil(container, "palette");
    expect(
      container.querySelector('[cmdk-item][data-value="Sequences and series"]'),
    ).not.toBeNull();
    advanceUntil(container, "note");
    expect(container.querySelector("[cmdk-root]")).toBeNull();
    expect(container.querySelector("[data-breadcrumb]")?.textContent).toContain("NOT-115");
  });

  it("moves the macOS arrow on the desktop, and shows the hand over what it clicks", () => {
    const { container } = show();
    const cursor = () =>
      container
        .querySelector('[data-variant="desktop"] [data-cursor]')
        ?.getAttribute("data-cursor");
    act(() => {
      vi.advanceTimersByTime(2300);
    });
    expect(cursor()).toBe("arrow");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(cursor()).toBe("hand");
  });

  it("draws the cursors in the page, so a click never shows a broken image while one loads", () => {
    const { container } = show();
    const cursor = container.querySelector('[data-variant="desktop"] [data-cursor]');
    expect(cursor?.querySelector("img")).toBeNull();
    expect(cursor?.querySelectorAll("svg")).toHaveLength(2);
  });

  it("keeps the window the same height on every page", WHOLE_TOUR, () => {
    const { container } = show();
    const height = () =>
      container.querySelector("[data-stage-window]")?.className.match(/h-\[\d+px\]/g);
    const first = height();
    for (const stop of TOUR) {
      advanceUntil(container, stop.view);
      expect(height()).toEqual(first);
    }
  });

  it("stops where it is when paused, and goes on when played", () => {
    const { container } = show();
    fireEvent.click(screen.getByRole("button", { name: "Pause the demo" }));
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(view(container)).toBe("dashboard");
    fireEvent.click(screen.getByRole("button", { name: "Play the demo" }));
    advanceUntil(container, "tasks");
  });

  it("holds still on the Dashboard when the visitor prefers reduced motion", () => {
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
    const { container } = show();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(view(container)).toBe("dashboard");
    expect(screen.getByRole("button", { name: "Play the demo" })).toBeInTheDocument();
  });

  it("keeps the app out of reach of the keyboard and screen readers", () => {
    const { container } = show();
    const app = container.querySelector("[data-stage-window]");
    expect(app?.hasAttribute("inert")).toBe(true);
    expect(app?.getAttribute("aria-hidden")).toBe("true");
  });
});
