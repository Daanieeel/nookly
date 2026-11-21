import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom lacks the layout APIs Radix calls; they do nothing here.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver;
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;

// Neither the toaster nor the mascot's gaze runs without it.
// SAFETY: only the members the toaster and the mascot call are given; no test reads the rest.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

afterEach(() => {
  cleanup();
  // The platform picked is remembered; one test's choice is not the next one's.
  localStorage.clear();
  history.replaceState(null, "", "/");
});
