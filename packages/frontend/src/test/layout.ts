import { afterEach, beforeEach } from "vitest";

/// The sizes a windowed list reads off its scroll area: the offset sizes, and the client
/// sizes newer TanStack Virtual reads instead.
const SIZES = ["offsetHeight", "clientHeight", "offsetWidth", "clientWidth"] as const;

/// jsdom has no layout, so a list that windows itself sees a scroll area 0px tall. This
/// gives every element marked `data-scroll-root` a height of `viewport`, and every
/// element with a `data-index` (a row of a windowed list) a height of `row`.
export function useListLayout({ viewport, row }: { viewport: number; row: number }) {
  const original = {
    rect: HTMLElement.prototype.getBoundingClientRect,
    sizes: SIZES.map((name) => Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)),
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
    for (const name of SIZES) {
      Object.defineProperty(HTMLElement.prototype, name, {
        configurable: true,
        get(this: HTMLElement) {
          if (name.endsWith("Width")) return 800;
          return this.hasAttribute("data-scroll-root") ? viewport : 0;
        },
      });
    }
  });
  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = original.rect;
    SIZES.forEach((name, i) => {
      const descriptor = original.sizes[i];
      // Without an own descriptor the size came from Element; removing ours restores it.
      if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, name);
    });
  });
}
