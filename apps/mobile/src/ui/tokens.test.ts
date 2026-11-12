import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEMANTIC, TINT, TYPE, withAlpha } from "./tokens.ts";

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/;

describe("design tokens", () => {
  it("define every semantic colour for light and dark", () => {
    for (const color of Object.values(SEMANTIC)) {
      expect(color.light).toMatch(HEX);
      expect(color.dark).toMatch(HEX);
      expect(color.ios.length).toBeGreaterThan(0);
    }
  });

  it("take Nookly's accents from the desktop's own tokens", () => {
    const css = readFileSync(join(__dirname, "../../../../packages/ui/src/theme.css"), "utf8");
    const at = css.indexOf("@variant dark {");
    const [light, dark] = [css.slice(0, at), css.slice(at)];
    for (const name of ["blue", "green", "pink", "purple", "yellow"] as const) {
      expect(light).toContain(`--accent-${name}: ${TINT[name].light};`);
      expect(dark).toContain(`--accent-${name}: ${TINT[name].dark};`);
    }
  });

  it("tint a colour for a badge's background", () => {
    expect(withAlpha("#0070f3", 0.14)).toBe("#0070f324");
    expect(withAlpha("#0070f3", 2)).toBe("#0070f3ff");
  });

  it("order the text styles from largest to smallest, each with room between lines", () => {
    const sizes = Object.values(TYPE).map((t) => t.fontSize);
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
    for (const style of Object.values(TYPE)) {
      expect(style.lineHeight).toBeGreaterThan(style.fontSize);
    }
  });
});
