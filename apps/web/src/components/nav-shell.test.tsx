import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NavShell } from "./nav-shell";

function bar() {
  const { container } = render(
    <NavShell
      logo={<a href="/">Nookly</a>}
      links={<nav>Links</nav>}
      actions={<div>Actions</div>}
    />,
  );
  return container.querySelector("header > div")!;
}

function scrollTo(y: number) {
  act(() => {
    Object.defineProperty(window, "scrollY", { value: y, configurable: true });
    window.dispatchEvent(new Event("scroll"));
  });
}

describe("NavShell", () => {
  it("is narrow and transparent at the top of the page", () => {
    scrollTo(0);
    const el = bar();
    expect(el.className).toContain("bg-transparent");
    expect(el.className).not.toContain("bg-card");
  });

  it("widens into a frosted card once the page scrolls", () => {
    scrollTo(0);
    const el = bar();
    scrollTo(200);
    expect(el.className).toContain("max-w-5xl");
    expect(el.className).toContain("bg-card/80");
  });

  it("goes back when the visitor returns to the top", () => {
    scrollTo(0);
    const el = bar();
    scrollTo(200);
    scrollTo(0);
    expect(el.className).toContain("bg-transparent");
  });

  it("starts as a card when the page opens already scrolled", () => {
    scrollTo(500);
    expect(bar().className).toContain("bg-card/80");
    scrollTo(0);
  });
});
