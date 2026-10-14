import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DARK, LIGHT, type Palette } from "./tokens.ts";

const css = readFileSync(new URL("../../ui/src/styles.css", import.meta.url), "utf8");

function variables(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf("}", start));
  return new Map(
    [...block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
}

const kebab = (name: string) => name.replaceAll(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function expectMatches(palette: Palette, selector: string) {
  const vars = variables(selector);
  for (const [name, value] of Object.entries(palette)) {
    if (name === "positive" || name === "caution") continue;
    expect(value, `--${kebab(name)} in ${selector}`).toBe(vars.get(kebab(name)));
  }
}

describe("the shared design tokens", () => {
  it("match the desktop's light theme", () => expectMatches(LIGHT, ":root"));
  it("match the desktop's dark theme", () => expectMatches(DARK, ".dark"));

  it("use the same success and caution colors", () => {
    expect(LIGHT.positive).toBe(LIGHT.accentGreen);
    expect(DARK.caution).toBe(DARK.accentYellow);
  });
});
