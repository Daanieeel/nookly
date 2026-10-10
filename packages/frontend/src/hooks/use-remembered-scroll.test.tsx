import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetScroll, useRememberedScroll } from "./use-remembered-scroll.ts";

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

function scrolled(key: string, top: number) {
  const el = scroller();
  const { unmount } = renderHook(() => useRememberedScroll(el, key));
  el.current.scrollTop = top;
  el.current.dispatchEvent(new Event("scroll"));
  unmount();
}

function restored(key: string): number {
  const el = scroller();
  renderHook(() => useRememberedScroll(el, key));
  return el.current.scrollTop;
}

describe("remembering the scroll of each tab", () => {
  it("keeps the same view in two tabs apart", () => {
    scrolled("tab:one:module:s1:notes", 120);
    scrolled("tab:two:module:s1:notes", 480);
    expect(restored("tab:one:module:s1:notes")).toBe(120);
    expect(restored("tab:two:module:s1:notes")).toBe(480);
  });

  it("forgets every entry under a prefix, and only those", () => {
    scrolled("tab:closed:dashboard", 50);
    scrolled("tab:closed:entity:e1", 60);
    scrolled("tab:open:dashboard", 70);
    forgetScroll("tab:closed:");
    expect(restored("tab:closed:dashboard")).toBe(0);
    expect(restored("tab:closed:entity:e1")).toBe(0);
    expect(restored("tab:open:dashboard")).toBe(70);
  });

  it("starts a view nobody scrolled before at the top, also when the scroller was reused", () => {
    const el = scroller();
    const { rerender } = renderHook(({ key }) => useRememberedScroll(el, key), {
      initialProps: { key: "tab:a:view-1" },
    });
    el.current.scrollTop = 200;
    el.current.dispatchEvent(new Event("scroll"));
    rerender({ key: "tab:a:view-2" });
    expect(el.current.scrollTop).toBe(0);
    rerender({ key: "tab:a:view-1" });
    expect(el.current.scrollTop).toBe(200);
  });
});

describe("restoring before the content is tall enough", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps trying until the content has loaded, without losing the remembered spot", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    scrolled("tab:slow:list", 300);

    // A scroller that can only scroll as far as its content is tall, like a real one.
    const el = scroller();
    let height = 0;
    let top = 0;
    Object.defineProperty(el.current, "scrollTop", {
      get: () => top,
      set: (value: number) => {
        top = Math.min(value, height);
      },
    });
    renderHook(() => useRememberedScroll(el, "tab:slow:list"));
    expect(top).toBe(0);
    // The restore's own clamped scroll event must not overwrite what was remembered.
    el.current.dispatchEvent(new Event("scroll"));

    height = 1000;
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(top).toBe(300);
  });
});
