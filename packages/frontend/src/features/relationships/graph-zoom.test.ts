import { describe, expect, it } from "vitest";
import { clampZoom, fitZoom, MAX_ZOOM, MIN_ZOOM, stepZoom, wheelZoom } from "./graph-zoom.ts";

describe("clampZoom", () => {
  it("keeps the zoom between the smallest and biggest allowed", () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(50)).toBe(MAX_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });
});

describe("stepZoom", () => {
  it("zooms in and out by a fixed factor and stops at the limits", () => {
    expect(stepZoom(1, 1)).toBeGreaterThan(1);
    expect(stepZoom(1, -1)).toBeLessThan(1);
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });
});

describe("wheelZoom", () => {
  it("zooms out when scrolling down and in when scrolling up", () => {
    expect(wheelZoom(1, 40)).toBeLessThan(1);
    expect(wheelZoom(1, -40)).toBeGreaterThan(1);
  });
});

describe("fitZoom", () => {
  it("shrinks a canvas bigger than the view so all of it shows", () => {
    expect(fitZoom(2000, 1000, 800)).toBeCloseTo(0.4);
  });

  it("never blows a small canvas up past its natural size", () => {
    expect(fitZoom(400, 1000, 800)).toBe(1);
  });

  it("never goes below the smallest zoom", () => {
    expect(fitZoom(100000, 500, 500)).toBe(MIN_ZOOM);
  });

  it("stays at the natural size when the view has no size yet", () => {
    expect(fitZoom(2000, 0, 0)).toBe(1);
  });
});
