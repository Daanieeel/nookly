import { describe, expect, it } from "vitest";
import { CODE_LANGUAGES, resolveLanguageEntry } from "./code-languages";
import { ensureLanguage, highlightSpans, isLanguageLoaded } from "./highlighter";

// Reported: the code block's language picker had C++ and C# but no plain C.
describe("the C language", () => {
  it("is in the picker next to C++ and C#", () => {
    const labels = CODE_LANGUAGES.map((lang) => lang.label);
    expect(labels).toContain("C");
    expect(resolveLanguageEntry("c")?.label).toBe("C");
    expect(resolveLanguageEntry("cpp")?.label).toBe("C++");
  });

  it("is highlighted", async () => {
    await ensureLanguage("c");
    expect(isLanguageLoaded("c")).toBe(true);
    const code = "int main(void) { return 0; }";
    const spans = highlightSpans("c", code);
    const keyword = spans.find((s) => code.slice(s.from, s.to) === "return");
    expect(keyword).toBeDefined();
  });
});
