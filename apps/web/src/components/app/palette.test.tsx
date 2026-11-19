import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PaletteMock } from "./palette";

describe("PaletteMock", () => {
  // The palette sits far down the home page. Its first row is selected on load, and the
  // palette used to scroll that row into view, which dragged the visitor down the page.
  it("does not scroll the page when it loads", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<PaletteMock locale="en" />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("keeps a first row selected so the palette looks live", () => {
    Element.prototype.scrollIntoView = vi.fn();
    const { container } = render(<PaletteMock locale="en" />);
    expect(container.querySelector("[cmdk-item][aria-selected=true]")).not.toBeNull();
  });

  it("moves the selection with the arrow keys", () => {
    Element.prototype.scrollIntoView = vi.fn();
    const { container } = render(<PaletteMock locale="en" />);
    const root = container.querySelector("[cmdk-root]")!;
    const before = container.querySelector("[cmdk-item][aria-selected=true]")?.textContent;
    fireEvent.keyDown(root, { key: "ArrowDown" });
    const after = container.querySelector("[cmdk-item][aria-selected=true]")?.textContent;
    expect(after).not.toBe(before);
  });
});
