import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NavShell, ScrolledOnly } from "./nav-shell";

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

  it("tells its contents whether the page has scrolled", () => {
    scrollTo(0);
    const el = bar();
    expect(el.getAttribute("data-scrolled")).toBe("false");
    scrollTo(200);
    expect(el.getAttribute("data-scrolled")).toBe("true");
    scrollTo(0);
  });
});

describe("ScrolledOnly", () => {
  // The hero already has a download button, so the bar's waits until the hero is gone.
  it("is hidden from sight and from the keyboard until the page scrolls", () => {
    scrollTo(0);
    const { getByText } = render(
      <NavShell
        logo={<a href="/">Nookly</a>}
        links={<nav>Links</nav>}
        actions={
          <ScrolledOnly>
            <button type="button">Download</button>
          </ScrolledOnly>
        }
      />,
    );
    const wrapper = getByText("Download").parentElement!;
    expect(wrapper.className).toContain("invisible");
    expect(wrapper.className).toContain("group-data-[scrolled=true]/nav:visible");
  });
});
