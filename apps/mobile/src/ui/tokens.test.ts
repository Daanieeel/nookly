import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type BoxShadowValue, PlatformColor } from "react-native";
import {
  CHARCOAL,
  ELEVATION,
  type ElevationName,
  PRIMARY,
  PRIMARY_GLOSS,
  SEMANTIC,
  SOLID,
  TINT,
  TYPE,
  elevation,
  semantic,
  shade,
  solidLook,
  withAlpha,
} from "./tokens.ts";

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/;

describe("design tokens", () => {
  it("give the main button the desktop's depth: a ring, a lit top edge and a glow", () => {
    const shadows = PRIMARY_GLOSS.boxShadow;
    expect(shadows.some((s) => !s.inset && s.spreadDistance === 1 && s.blurRadius === 0)).toBe(
      true,
    );
    expect(shadows.some((s) => s.inset)).toBe(true);
    expect(shadows.some((s) => !s.inset && s.blurRadius > 0)).toBe(true);
    expect(PRIMARY_GLOSS.experimental_backgroundImage).toContain("linear-gradient");
  });

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

  it("fill the main button with the desktop's own primary, the same in both schemes", () => {
    const css = readFileSync(join(__dirname, "../../../../packages/ui/src/theme.css"), "utf8");
    const at = css.indexOf("@variant dark {");
    expect(css.slice(0, at)).toContain(`--primary: ${PRIMARY};`);
    expect(css.slice(at)).toContain(`--primary: ${PRIMARY};`);
    expect(css.slice(0, at)).toContain(`--ring: ${PRIMARY};`);
  });

  it("take the solid status fills from the desktop's own tokens", () => {
    const css = readFileSync(join(__dirname, "../../../../packages/ui/src/theme.css"), "utf8");
    const at = css.indexOf("@variant dark {");
    const [light, dark] = [css.slice(0, at), css.slice(at)];
    for (const name of ["positive", "caution", "warning", "destructive"] as const) {
      expect(light).toContain(`--solid-${name}: ${SOLID[name].light};`);
      expect(dark).toContain(`--solid-${name}: ${SOLID[name].dark};`);
    }
  });

  it("shade a colour toward black by keeping a share of it", () => {
    expect(shade("#ff8040", 0.5)).toBe("#804020");
    expect(shade("#0a9f4a", 1)).toBe("#0a9f4a");
    expect(shade("#ffffff", 0)).toBe("#000000");
  });

  it("draw a solid look with a gloss, a ring of its own colour and near black shadows", () => {
    const look = solidLook(SOLID.positive.dark, "dark");
    expect(look.backgroundColor).toBe(SOLID.positive.dark);
    expect(look.experimental_backgroundImage).toContain("linear-gradient");
    const [ring, ...rest] = look.boxShadow;
    expect(ring?.spreadDistance).toBe(1);
    expect(rest.some((s) => s.inset)).toBe(true);
    // The drop shadows are a shade, never a glow in the colour itself.
    for (const drop of rest.filter((s) => !s.inset && s.blurRadius > 0)) {
      const [r, g, b] =
        /rgba\((\d+),\s*(\d+),\s*(\d+)/.exec(drop.color)?.slice(1).map(Number) ?? [];
      expect(Math.max(r ?? 255, g ?? 255, b ?? 255)).toBeLessThan(60);
    }
  });

  it("keep the main button's shadows a shade with a hint of blue, not a blue glow", () => {
    const drops = PRIMARY_GLOSS.boxShadow.filter((s) => !s.inset && s.blurRadius > 0);
    expect(drops.length).toBeGreaterThan(0);
    for (const drop of drops) {
      const blue = Number(/rgba\(\d+,\s*\d+,\s*(\d+)/.exec(drop.color)?.[1] ?? 255);
      expect(blue).toBeLessThan(60);
    }
  });

  const shadows = (name: ElevationName, scheme: "light" | "dark"): BoxShadowValue[] =>
    ELEVATION[name][scheme];

  it("layer the desktop's elevations for each scheme, lit from above in the dark", () => {
    for (const name of ["control", "card", "popover", "dialog"] as const) {
      for (const scheme of ["light", "dark"] as const) {
        expect(shadows(name, scheme).length).toBeGreaterThan(0);
        expect(elevation(name, scheme).boxShadow).toBe(ELEVATION[name][scheme]);
      }
      // A top highlight is how the dark raises a surface; on light the shadow does it.
      expect(shadows(name, "dark").some((s) => s.inset)).toBe(true);
      expect(shadows(name, "light").some((s) => s.inset)).toBe(false);
    }
    // Deeper things cast a longer shadow.
    const reach = (name: ElevationName) =>
      Math.max(...shadows(name, "light").map((s) => Number(s.blurRadius ?? 0)));
    expect(reach("control")).toBeLessThan(reach("card"));
    expect(reach("card")).toBeLessThan(reach("popover"));
    expect(reach("popover")).toBeLessThanOrEqual(reach("dialog"));
  });
});
