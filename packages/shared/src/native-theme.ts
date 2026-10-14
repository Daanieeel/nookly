/// The desktop's theme (`packages/ui/src/styles.css`) for NativeWind on the phone:
/// the same variables and the same `@theme inline` mapping, with the dark theme under
/// `prefers-color-scheme` (a phone has no `.dark` class). Fonts are left to the phone,
/// which loads Inter under its own names, and radii become plain lengths. `bun run theme:native` writes the result to
/// `packages/ui/src/native-theme.css`; a test fails while that file is behind.

function block(css: string, selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`styles.css has no ${selector} block`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  return css.slice(open + 1, close);
}

/// Declarations only: comments and blank lines go, each declaration on one line.
function declarations(body: string, drop: RegExp | null = null): string {
  return body
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .split(";")
    .map((d) => d.replaceAll(/\s+/g, " ").trim())
    .filter((d) => d.startsWith("--") && !(drop && drop.test(d)))
    .map((d) => `  ${d};`)
    .join("\n");
}

/// The radii as plain lengths: the phone's style engine can't do `calc()` with a
/// variable, so `calc(var(--radius) - 2px)` becomes `8px` for a radius of `0.625rem`.
function resolveRadius(theme: string, root: string): string {
  const rem = /--radius:\s*([\d.]+)rem/.exec(root);
  if (!rem) throw new Error("styles.css has no --radius in rem");
  const radius = Number(rem[1]) * 16;
  return theme
    .replaceAll(
      /calc\(var\(--radius\) ([+-]) (\d+)px\)/g,
      (_, op: string, px: string) => `${op === "+" ? radius + Number(px) : radius - Number(px)}px`,
    )
    .replaceAll("var(--radius)", `${radius}px`);
}

export function nativeThemeCss(stylesCss: string): string {
  const indent = (text: string) => text.replaceAll(/^/gm, "  ");
  const root = block(stylesCss, ":root");
  return `/* Generated from styles.css by \`bun run theme:native\`. Do not edit. */

:root {
${declarations(root)}
}

@media (prefers-color-scheme: dark) {
  :root {
${indent(declarations(block(stylesCss, ".dark")))}
  }
}

@theme inline {
${resolveRadius(declarations(block(stylesCss, "@theme inline"), /^--font-/), root)}
}
`;
}
