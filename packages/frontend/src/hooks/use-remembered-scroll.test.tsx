import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRememberedScroll } from "./use-remembered-scroll.ts";

function scroller() {
  const el = document.createElement("div");
  document.body.append(el);
  return { current: el };
}

describe("useRememberedScroll", () => {
  it("puts a remounted view back where it was scrolled to", () => {
    const first = scroller();
    const { unmount } = renderHook(() => useRememberedScroll(first, "file-a"));
    first.current.scrollTop = 420;
    first.current.dispatchEvent(new Event("scroll"));
    unmount();

    const second = scroller();
    renderHook(() => useRememberedScroll(second, "file-a"));
    expect(second.current.scrollTop).toBe(420);
  });

  it("keeps each file's position apart", () => {
    const a = scroller();
    renderHook(() => useRememberedScroll(a, "file-b"));
    a.current.scrollTop = 90;
    a.current.dispatchEvent(new Event("scroll"));

    const other = scroller();
    renderHook(() => useRememberedScroll(other, "file-c"));
    expect(other.current.scrollTop).toBe(0);
  });

  it("waits until the content is ready before restoring", () => {
    const seed = scroller();
    const first = renderHook(() => useRememberedScroll(seed, "file-d"));
    seed.current.scrollTop = 300;
    seed.current.dispatchEvent(new Event("scroll"));
    first.unmount();

    const el = scroller();
    const { rerender } = renderHook(({ ready }) => useRememberedScroll(el, "file-d", ready), {
      initialProps: { ready: false },
    });
    expect(el.current.scrollTop).toBe(0);
    rerender({ ready: true });
    expect(el.current.scrollTop).toBe(300);
  });
});
