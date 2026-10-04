import { configureAxe } from "vitest-axe";
import { expect } from "vitest";

// jsdom has no layout and no computed colors, so the contrast and region rules can't
// say anything true here. Everything else axe checks runs as usual.
const axe = configureAxe({
  rules: {
    "color-contrast": { enabled: false },
    region: { enabled: false },
  },
});

/// Fails, listing every rule broken and the elements it broke on, when `container`
/// has accessibility violations.
export async function expectNoA11yViolations(container: Element = document.body) {
  const { violations } = await axe(container);
  expect(
    violations.map(
      (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`,
    ),
  ).toEqual([]);
}
