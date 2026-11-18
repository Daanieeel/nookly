import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PlatformColor } from "react-native";
import { CHARCOAL, SEMANTIC, TINT, TYPE, semantic, withAlpha } from "./tokens.ts";

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

  it("put a deep charcoal, not black, behind everything in dark mode, as the desktop does", () => {
    const css = readFileSync(join(__dirname, "../../../../packages/ui/src/theme.css"), "utf8");
    const dark = css.slice(css.indexOf("@variant dark {"));
    const page = /--background: (#[0-9a-f]{6});/.exec(dark)?.[1];
    expect(page).toBe(CHARCOAL);
    expect(SEMANTIC.background.dark).toBe(CHARCOAL);
    expect(SEMANTIC.groupedBackground.dark).toBe(CHARCOAL);
    // On iOS too, where the system's own background would be black.
    expect(semantic("background", "dark")).not.toEqual(PlatformColor("systemBackground"));
    expect(semantic("groupedBackground", "dark")).not.toEqual(
      PlatformColor("systemGroupedBackground"),
    );
    // Still below the cards and sheets that sit on it.
    const card = /--card: (#[0-9a-f]{6});/.exec(dark)?.[1] ?? "";
    expect(parseInt(CHARCOAL.slice(1, 3), 16)).toBeLessThan(parseInt(card.slice(1, 3), 16));
  });

  // A sheet is iOS's thick material, about #252525 over the dark page: what sits on it (a
  // group of options, a field) is lighter, so it reads as raised, never sunk in.
  it("draw what sits on a sheet lighter than the sheet", () => {
    const red = (hex: string) => parseInt(hex.slice(1, 3), 16);
    expect(red(SEMANTIC.sheetCard.dark)).toBeGreaterThan(0x25 + 8);
    expect(red(SEMANTIC.sheetCard.dark)).toBeGreaterThan(red(SEMANTIC.surface.dark));
    expect(SEMANTIC.sheetCard.light).toBe("#ffffff");
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
