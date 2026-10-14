/// The phone's stylesheet, compiled as the app compiles it (Tailwind, then NativeWind's
/// `react-native-css`): the desktop's classes turn into the desktop's values, in both
/// themes. Run with `bun test` (the screens run with Jest).
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import tailwind from "@tailwindcss/postcss";
import { buttonVariants } from "@nookly/ui/classes";
import postcss from "postcss";
import { compile } from "react-native-css/compiler";

const from = join(import.meta.dir, "src/global.css");
const css = (await postcss([tailwind()]).process(readFileSync(from, "utf8"), { from })).css;
const sheet = JSON.stringify(compile(css, { inlineRem: 16 }).stylesheet());

/// The compiled rules of one class, as JSON.
function rules(name: string): string {
  const at = sheet.indexOf(`["${name}",`);
  if (at < 0) return "";
  return sheet.slice(at, sheet.indexOf(`]],["`, at));
}

describe("the phone's styles", () => {
  it("size things as the desktop does", () => {
    expect(rules("h-9")).toContain('"height":36');
    expect(rules("text-sm")).toContain('"fontSize":14');
    expect(rules("rounded-md")).toContain('"borderRadius":8');
    expect(rules("rounded-xl")).toContain('"borderRadius":14');
  });

  it("take colors from the desktop's theme, dark by the system's setting", () => {
    expect(rules("bg-primary")).toContain('"var","primary"');
    const dark = '[["=","prefers-color-scheme","dark"]]';
    expect(sheet).toContain(`["background",[["#000",${dark}],["#f2f2f2"]]]`);
    expect(sheet).toContain(`["destructive",[["#ff4d8d",${dark}],["#d6336c"]]]`);
  });

  it("set Inter by weight", () => {
    expect(rules("font-sans")).toContain("Inter_400Regular");
    expect(rules("font-medium")).toContain("Inter_500Medium");
    expect(rules("font-heading")).toContain("InterTight_600SemiBold");
  });

  it("compile every class a primary button uses that a phone can draw", () => {
    const native = buttonVariants()
      .split(" ")
      .filter(
        (c) =>
          !/^(hover|focus-visible|\[|transition|outline|whitespace|inline-flex|disabled:pointer)/.test(
            c,
          ),
      );
    for (const name of native) expect(rules(name), name).not.toBe("");
  });
});
