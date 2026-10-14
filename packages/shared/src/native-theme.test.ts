import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nativeThemeCss } from "./native-theme.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("the phone's theme", () => {
  it("is the desktop's, regenerated (bun run theme:native)", () => {
    const generated = nativeThemeCss(read("../../ui/src/styles.css"));
    expect(read("../../ui/src/native-theme.css")).toBe(generated);
  });

  it("keeps every color, the dark ones by system setting, and leaves fonts out", () => {
    const css = nativeThemeCss(read("../../ui/src/styles.css"));
    expect(css).toContain("  --primary: #0070f3;");
    expect(css).toMatch(
      /prefers-color-scheme: dark\) \{\n {2}:root \{\n[^}]*--background: #000000;/,
    );
    expect(css).toContain("--color-primary: var(--primary);");
    expect(css).toContain("--radius-md: 8px;");
    expect(css).toContain("--radius-xl: 14px;");
    expect(css).toContain("--radius-lg: 10px;");
    expect(css).not.toContain("--font-");
  });
});
