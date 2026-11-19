import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@nookly/ui/components/tooltip";
import { ScrollToTop } from "./scroll-to-top";

function scrollTo(y: number) {
  act(() => {
    Object.defineProperty(window, "scrollY", { value: y, configurable: true });
    window.dispatchEvent(new Event("scroll"));
  });
}

function setup(locale: "en" | "de" = "en") {
  render(
    <TooltipProvider>
      <ScrollToTop locale={locale} />
    </TooltipProvider>,
  );
  return screen.getByRole("button", { hidden: true });
}

describe("ScrollToTop", () => {
  afterEach(() => scrollTo(0));

  it("is out of sight and out of the tab order at the top of the page", () => {
    scrollTo(0);
    expect(setup().className).toContain("invisible");
  });

  it("shows once the page has scrolled past the first screen", () => {
    scrollTo(0);
    const button = setup();
    scrollTo(1200);
    expect(button.className).not.toContain("invisible");
    scrollTo(100);
    expect(button.className).toContain("invisible");
  });

  it("scrolls smoothly to the top", () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    scrollTo(1500);
    fireEvent.click(setup());
    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("jumps instead when the visitor prefers reduced motion", () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
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
    scrollTo(1500);
    fireEvent.click(setup());
    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("is labelled in the page's language", () => {
    expect(setup("de").getAttribute("aria-label")).toBe("Nach oben");
  });
});
