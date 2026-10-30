import { describe, expect, it } from "vitest";
import { CODE_LANGUAGES, resolveLanguageEntry } from "./code-languages";
import { ensureLanguage, highlightSpans, isLanguageLoaded } from "./highlighter";

const SOURCE = [
  "section .text",
  "global _start",
  "_start:",
  "  mov eax, 0x10 ; load",
  "  jmp _start",
].join("\n");

/// The highlight style of the first run that covers `word` in `SOURCE`.
function styleOf(spans: ReturnType<typeof highlightSpans>, word: string, nth = 0): string | null {
  const from = SOURCE.split(word)
    .slice(0, nth + 1)
    .join(word).length;
  const span = spans.find((s) => s.from <= from && s.to >= from + word.length);
  return span?.style ?? null;
}

describe("assembly in code blocks", () => {
  it("is offered in the language picker with a readable label", () => {
    const entry = CODE_LANGUAGES.find((l) => l.value === "asm");
    expect(entry?.label).toBe("Assembly");
  });

  it.each(["asm", "assembly", "nasm", "yasm", "s"])("recognizes %s as assembly", (spelling) => {
    expect(resolveLanguageEntry(spelling)?.value).toBe("asm");
  });

  it.each(["asm", "assembly", "nasm"])("highlights a block set to %s", async (spelling) => {
    expect(await ensureLanguage(spelling)).toBe(true);
    expect(isLanguageLoaded(spelling)).toBe(true);
    const spans = highlightSpans(spelling, SOURCE);

    const instruction = styleOf(spans, "mov");
    const register = styleOf(spans, "eax");
    const number = styleOf(spans, "0x10");
    const label = styleOf(spans, "_start:");
    const directive = styleOf(spans, "global");
    const comment = styleOf(spans, "; load");

    for (const style of [instruction, register, number, label, directive, comment]) {
      expect(style).toMatch(/^color:var\(--/);
    }
    // Instructions, registers, numbers and labels each read differently.
    expect(new Set([instruction, register, number, label]).size).toBe(4);
    expect(comment).toContain("var(--muted-foreground)");
  });

  it("follows the app's colors, not fixed ones", async () => {
    await ensureLanguage("asm");
    for (const span of highlightSpans("asm", SOURCE)) expect(span.style).toContain("var(--");
  });

  it("leaves other languages alone", async () => {
    await ensureLanguage("cpp");
    const code = "int x = 0x10; // note";
    const numberSpan = highlightSpans("cpp", code).find((s) => code.slice(s.from, s.to) === "0x10");
    expect(numberSpan).toBeUndefined();
  });
});
