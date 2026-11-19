import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeLink } from "./home-link";

function link(href: string) {
  render(
    <HomeLink href={href} aria-label="Nookly">
      Nookly
    </HomeLink>,
  );
  return screen.getByRole("link", { name: "Nookly" });
}

describe("HomeLink", () => {
  const scrollTo = vi.fn();
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    vi.stubGlobal("scrollTo", scrollTo);
  });
  afterEach(() => {
    scrollTo.mockReset();
    vi.unstubAllGlobals();
  });

  it("scrolls back to the top instead of loading the page it is already on", () => {
    const followed = fireEvent.click(link("/"));
    expect(followed).toBe(false);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it("drops a section from the address, so a reload starts at the top too", () => {
    window.history.replaceState(null, "", "/#faq");
    fireEvent.click(link("/"));
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/");
  });

  it("treats the page with or without its trailing slash as the same page", () => {
    window.history.replaceState(null, "", "/de/");
    expect(fireEvent.click(link("/de"))).toBe(false);
  });

  it("leaves a link to another page to the browser", () => {
    expect(fireEvent.click(link("/de"))).toBe(true);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("leaves a click that opens a new tab or window to the browser", () => {
    const home = link("/");
    expect(fireEvent.click(home, { metaKey: true })).toBe(true);
    expect(fireEvent.click(home, { ctrlKey: true })).toBe(true);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
