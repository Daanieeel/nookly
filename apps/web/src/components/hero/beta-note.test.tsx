import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BetaNote } from "./beta-note";

describe("BetaNote", () => {
  it("says the app is in beta, in the words it is given", () => {
    render(<BetaNote label="In Beta" />);
    expect(screen.getByText("In Beta")).toBeTruthy();
  });

  it("is handwritten, in marker yellow, a little crooked", () => {
    render(<BetaNote label="In Beta" />);
    const label = screen.getByText("In Beta");
    expect(label.className).toContain("font-handwriting");
    expect(label.className).toContain("text-accent-yellow");
    expect(label.closest('[class*="-rotate-"]')).not.toBeNull();
  });

  it("looks added by hand afterwards: a scribbled underline and an arrow back at the button", () => {
    const { container } = render(<BetaNote label="In Beta" />);
    const marks = container.querySelectorAll("svg");
    expect(marks).toHaveLength(2);
    for (const mark of marks) expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelectorAll("svg path").length).toBeGreaterThanOrEqual(2);
  });

  it("drops the arrow on a phone, where the note sits under the button, and keeps the underline", () => {
    const { container } = render(<BetaNote label="In Beta" />);
    const [arrow, underline] = [...container.querySelectorAll("svg")];
    expect(arrow?.getAttribute("class")).toContain("hidden");
    expect(underline?.getAttribute("class") ?? "").not.toContain("hidden");
  });

  it("draws the marks in with a stroke, and shows them at once for reduced motion", () => {
    const { container } = render(<BetaNote label="In Beta" />);
    for (const path of container.querySelectorAll("svg path")) {
      expect(path.getAttribute("pathLength")).toBe("1");
      expect(path.getAttribute("class")).toContain("draw");
      expect(path.getAttribute("class")).toContain("motion-reduce:animate-none");
    }
  });

  it("sits beside the download button, and under it on a phone", () => {
    const { container } = render(<BetaNote label="In Beta" />);
    const note = container.firstElementChild?.className ?? "";
    expect(note).toContain("md:left-full");
    expect(note).toContain("top-full");
  });

  it("holds still for people who asked for less motion", () => {
    const { container } = render(<BetaNote label="In Beta" />);
    expect(container.firstElementChild?.className).toContain("motion-reduce:animate-none");
  });
});
