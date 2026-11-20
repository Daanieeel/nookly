import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@nookly/ui/components/tooltip";
import { GalleryShell, matches } from "@/components/gallery-shell";
import { GALLERY } from "./index";

describe("gallery registry", () => {
  it("has unique ids and a source file for every entry", () => {
    const ids = GALLERY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of GALLERY) expect(entry.source).toMatch(/\.tsx$/);
  });

  it.each(GALLERY.map((e) => [e.name, e] as const))("renders %s", (_name, entry) => {
    const { container } = render(<TooltipProvider>{entry.render()}</TooltipProvider>);
    expect(container).not.toBeEmptyDOMElement();
  });
});

describe("gallery shell", () => {
  it("filters by name and source", () => {
    const button = GALLERY.find((e) => e.id === "button")!;
    expect(matches(button, "")).toBe(true);
    expect(matches(button, "BUTTON")).toBe(true);
    expect(matches(button, "button.tsx")).toBe(true);
    expect(matches(button, "no such thing")).toBe(false);
  });

  it("shows only what the filter matches", () => {
    render(<GalleryShell />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter components" }), {
      target: { value: "tooltip" },
    });
    expect(screen.getByRole("heading", { level: 3, name: "Tooltip" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "Button" })).not.toBeInTheDocument();
  });
});
