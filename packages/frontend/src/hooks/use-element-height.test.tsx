import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useElementHeight } from "./use-element-height.ts";

let trigger: () => void = () => {};
let disconnected = 0;
const original = globalThis.ResizeObserver;

beforeEach(() => {
  disconnected = 0;
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) {
      trigger = () => callback([], this);
    }
    observe() {}
    unobserve() {}
    disconnect() {
      disconnected += 1;
    }
  };
});
afterEach(() => {
  globalThis.ResizeObserver = original;
});

function Probe({ height }: { height: number }) {
  const [ref, measured] = useElementHeight();
  return (
    <div>
      <div
        ref={(el) => {
          if (el) el.getBoundingClientRect = () => new DOMRect(0, 0, 10, height);
          ref(el);
        }}
      />
      <output>{measured}</output>
    </div>
  );
}

describe("useElementHeight", () => {
  it("reports the height of the element, and again when it resizes", () => {
    const { rerender } = render(<Probe height={40} />);
    expect(screen.getByRole("status").textContent).toBe("40");
    rerender(<Probe height={64} />);
    act(() => trigger());
    expect(screen.getByRole("status").textContent).toBe("64");
  });

  it("stops watching when the element goes", () => {
    const { unmount } = render(<Probe height={40} />);
    unmount();
    expect(disconnected).toBeGreaterThan(0);
  });
});
