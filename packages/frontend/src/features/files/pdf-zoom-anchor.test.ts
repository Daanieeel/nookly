import { describe, expect, it } from "vitest";
import { findZoomAnchor as findAnchor, scrollDeltaForAnchor } from "./pdf-zoom-anchor";

const rects = [
  { page: 1, top: -900, height: 800 },
  { page: 2, top: -84, height: 800 },
  { page: 3, top: 732, height: 800 },
];

/// Finds the anchor over pages laid out as `rects` and records which pages were measured.
function findZoomAnchor(y: number, list: typeof rects, measured: number[] = []) {
  return findAnchor(
    y,
    list.map((r) => r.page),
    (page) => {
      measured.push(page);
      return list.find((r) => r.page === page);
    },
  );
}

describe("findZoomAnchor", () => {
  it("anchors to the page under the top of the scroll area", () => {
    // Scroll area top is at 0: page 2 spans -84..716, so 84 / 800 into it.
    expect(findZoomAnchor(0, rects)).toEqual({ page: 2, fraction: 0.105 });
  });

  it("anchors to the next page when the top sits in a gap", () => {
    const gap = [
      { page: 1, top: -900, height: 800 },
      { page: 2, top: 20, height: 800 },
    ];
    expect(findZoomAnchor(0, gap)).toEqual({ page: 2, fraction: 0 });
  });

  it("returns null without pages", () => {
    expect(findZoomAnchor(0, [])).toBeNull();
  });

  it("returns null when the point lies below every page", () => {
    expect(findZoomAnchor(5000, rects)).toBeNull();
  });

  it("anchors at a point below the top, such as the cursor", () => {
    // 400px down the scroll area: page 2 spans -84..716, so 484 / 800 into it.
    expect(findZoomAnchor(400, rects)).toEqual({ page: 2, fraction: 0.605 });
  });

  it("measures only a few pages of a long document", () => {
    const long = Array.from({ length: 1000 }, (_, i) => ({
      page: i + 1,
      top: i * 816 - 400_000,
      height: 800,
    }));
    const measured: number[] = [];
    expect(findZoomAnchor(0, long, measured)?.page).toBe(491);
    expect(measured.length).toBeLessThanOrEqual(12);
  });
});

describe("scrollDeltaForAnchor", () => {
  it("keeps the same spot in the page after the layout grows", () => {
    // Page 2 now starts far lower because every page above it grew.
    const delta = scrollDeltaForAnchor(
      { page: 2, fraction: 0.105 },
      { top: 1500, height: 1600 },
      0,
    );
    expect(delta).toBe(1668);
  });
});
