import { afterEach, beforeEach } from "vitest";

/// jsdom has no layout, so a list that windows itself sees a scroll area 0px tall. This
/// gives every element marked `data-scroll-root` a height of `viewport`, and every
/// element with a `data-index` (a row of a windowed list) a height of `row`.
export function useListLayout({ viewport, row }: { viewport: number; row: number }) {
  const original = {
    rect: HTMLElement.prototype.getBoundingClientRect,
    offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight"),
    offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth"),
  };
  beforeEach(() => {
    HTMLElement.prototype.getBoundingClientRect = function rect() {
      const height = this.hasAttribute("data-scroll-root")
        ? viewport
        : this.hasAttribute("data-index")
          ? row
          : 0;
      return new DOMRect(0, 0, 800, height);
    };
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return this.hasAttribute("data-scroll-root") ? viewport : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get: () => 800,
    });
  });
  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = original.rect;
    if (original.offsetHeight) {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", original.offsetHeight);
    }
    if (original.offsetWidth) {
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", original.offsetWidth);
    }
  });
}
