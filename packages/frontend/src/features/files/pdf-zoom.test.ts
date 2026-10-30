import { describe, expect, it } from "vitest";
import {
  canvasPixelRatio,
  clampScale,
  fitWidthScale,
  MAX_CANVAS_PIXELS,
  MAX_SCALE,
  MIN_SCALE,
  pinchScale,
  stepScale,
} from "./pdf-zoom";

describe("stepScale", () => {
  it("grows and shrinks by the same factor, so a step feels alike at every zoom", () => {
    expect(stepScale(1, 1)).toBe(1.25);
    expect(stepScale(1.25, 1)).toBe(1.56);
    expect(stepScale(2, 1) / 2).toBeCloseTo(stepScale(1, 1) / 1, 2);
    expect(stepScale(1, -1)).toBe(0.8);
  });

  it("comes back to where it started after a step each way", () => {
    expect(stepScale(stepScale(1, 1), -1)).toBe(1);
  });

  it("stops at the limits", () => {
    expect(stepScale(MAX_SCALE, 1)).toBe(MAX_SCALE);
    expect(stepScale(MIN_SCALE, -1)).toBe(MIN_SCALE);
    expect(stepScale(2.8, 1)).toBe(MAX_SCALE);
  });
});

describe("pinchScale", () => {
  it("zooms in on a pinch out (negative delta) and out on a pinch in", () => {
    expect(pinchScale(1, -10)).toBeGreaterThan(1);
    expect(pinchScale(1, 10)).toBeLessThan(1);
  });

  it("changes by the same share at every zoom", () => {
    expect(pinchScale(2, -5) / 2).toBeCloseTo(pinchScale(1, -5), 6);
  });

  it("keeps tiny deltas, which only add up over a whole gesture", () => {
    expect(pinchScale(1, -0.1)).toBeGreaterThan(1);
  });

  it("stays within the limits", () => {
    expect(pinchScale(MAX_SCALE, -100)).toBe(MAX_SCALE);
    expect(pinchScale(MIN_SCALE, 100)).toBe(MIN_SCALE);
  });
});

describe("clampScale", () => {
  it("keeps a zoom within the limits", () => {
    expect(clampScale(10)).toBe(MAX_SCALE);
    expect(clampScale(0.1)).toBe(MIN_SCALE);
    expect(clampScale(1.5)).toBe(1.5);
  });
});

describe("fitWidthScale", () => {
  it("makes the page as wide as the room it has", () => {
    expect(fitWidthScale(500, 250)).toBe(2);
  });

  it("stays within the limits", () => {
    expect(fitWidthScale(5000, 250)).toBe(MAX_SCALE);
    expect(fitWidthScale(50, 250)).toBe(MIN_SCALE);
  });

  it("gives nothing when there is no room or no page to measure", () => {
    expect(fitWidthScale(0, 250)).toBeNull();
    expect(fitWidthScale(500, 0)).toBeNull();
  });
});

describe("canvasPixelRatio", () => {
  it("keeps the screen's ratio for a page of normal size", () => {
    expect(canvasPixelRatio(2, 612, 792, 1)).toBe(2);
  });

  it("lowers the ratio so one canvas never passes the pixel limit", () => {
    const ratio = canvasPixelRatio(2, 612, 792, 3);
    expect(ratio).toBeLessThan(2);
    expect(612 * 3 * ratio * (792 * 3 * ratio)).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
  });

  it("never goes below one canvas pixel per screen pixel of the page", () => {
    expect(canvasPixelRatio(2, 20000, 20000, 3)).toBe(1);
  });
});
