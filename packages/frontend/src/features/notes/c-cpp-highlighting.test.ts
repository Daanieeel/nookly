import { describe, expect, it } from "vitest";
import { resolveLanguageEntry } from "./code-languages";
import { ensureLanguage, highlightSpans, isLanguageLoaded } from "./highlighter";
import { twinkleplopLanguage } from "./twinkleplop-highlighter";

const C_SOURCE = '#include <stdio.h>\n// hi\nint main(void) { char *s = "x"; return 0x10; }';
const CPP_SOURCE = "template<typename T> class Foo : public Bar { auto f() -> int { return 1; } };";

function styleOf(code: string, spans: ReturnType<typeof highlightSpans>, word: string) {
  const from = code.indexOf(word);
  return spans.find((s) => s.from <= from && s.to >= from + word.length)?.style ?? null;
}

describe("C and C++ code blocks", () => {
  it.each([
    ["c", "c"],
    ["cpp", "cpp"],
    ["c++", "cpp"],
    ["cxx", "cpp"],
    ["cc", "cpp"],
    ["h", "c"],
    ["hpp", "cpp"],
  ])("%s is tokenized by twinkleplop as %s", (spelling, expected) => {
    expect(twinkleplopLanguage(spelling)).toBe(expected);
  });

  it("keeps the picker entries for C and C++", () => {
    expect(resolveLanguageEntry("c")?.label).toBe("C");
    expect(resolveLanguageEntry("cpp")?.label).toBe("C++");
  });

  it("highlights C keywords, strings, comments and the include directive", async () => {
    expect(await ensureLanguage("c")).toBe(true);
    expect(isLanguageLoaded("c")).toBe(true);
    const spans = highlightSpans("c", C_SOURCE);
    expect(styleOf(C_SOURCE, spans, "return")).toContain("accent-pink");
    expect(styleOf(C_SOURCE, spans, "include")).toContain("accent-pink");
    expect(styleOf(C_SOURCE, spans, '"x"')).toContain("accent-green");
    expect(styleOf(C_SOURCE, spans, "// hi")).toContain("muted-foreground");
  });

  it("highlights C++ keywords and class names", async () => {
    expect(await ensureLanguage("cpp")).toBe(true);
    expect(isLanguageLoaded("cpp")).toBe(true);
    const spans = highlightSpans("cpp", CPP_SOURCE);
    expect(styleOf(CPP_SOURCE, spans, "template")).toContain("accent-pink");
    expect(styleOf(CPP_SOURCE, spans, "Foo")).toContain("accent-blue");
  });

  it("resolves the c++ spelling the CLI may store", async () => {
    expect(await ensureLanguage("c++")).toBe(true);
    expect(styleOf(CPP_SOURCE, highlightSpans("c++", CPP_SOURCE), "class")).toContain(
      "accent-pink",
    );
  });
});
