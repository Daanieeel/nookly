import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HIGHLIGHT_BACKGROUNDS, HIGHLIGHT_TEXT_ON_LIGHT } from "@nookly/shared/highlight";
import { describe, expect, it } from "vitest";

/// The phone paints highlights from `@nookly/shared/highlight`; the desktop's stylesheet
/// has to say the same, or the two drift.
const css = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");

describe("highlight colors on the phone and the desktop", () => {
  it("are the same, in the light and the dark theme", () => {
    for (const [id, look] of Object.entries(HIGHLIGHT_BACKGROUNDS)) {
      expect(css).toContain(`--mark-bg: ${look.light};`);
      expect(css).toContain(`--mark-bg: ${look.dark};`);
      expect(id.length).toBeGreaterThan(0);
    }
    expect(css).toContain(`color: ${HIGHLIGHT_TEXT_ON_LIGHT};`);
  });
});
