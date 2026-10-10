import { describe, expect, it } from "vitest";
import {
  ALL_EMOJI,
  featuredEmoji,
  featuredSymbols,
  searchEmoji,
  searchSymbols,
  SYMBOLS,
} from "./emoji.ts";

describe("searchEmoji", () => {
  it("finds smiling faces for smile", () => {
    const [first] = searchEmoji("smile");
    expect(first?.name).toMatch(/smiling/);
  });
  it("ranks a name that starts with the query first", () => {
    expect(searchEmoji("fire")[0]?.name).toBe("fire");
  });
  it("finds nothing for a blank query", () => {
    expect(searchEmoji("  ")).toEqual([]);
  });
  it("respects the limit", () => {
    expect(searchEmoji("face", 3)).toHaveLength(3);
  });
  it("has the whole emoji set", () => {
    expect(ALL_EMOJI.length).toBeGreaterThan(1000);
  });
});

describe("searchSymbols", () => {
  it("finds a symbol by name and by how it is written in ASCII", () => {
    expect(searchSymbols("infinity")[0]?.char).toBe("∞");
    expect(searchSymbols("<=")[0]?.char).toBe("≤");
    expect(searchSymbols("!=")[0]?.char).toBe("≠");
  });
  it("finds Greek letters by name", () => {
    expect(searchSymbols("lambda")[0]?.char).toBe("λ");
  });
  it("lists each character once", () => {
    const chars = SYMBOLS.map((s) => s.char);
    expect(new Set(chars).size).toBe(chars.length);
  });
});

describe("the lists shown before anything is typed", () => {
  it("offer a few symbols and the common emoji, each from the full sets", () => {
    expect(featuredSymbols().length).toBeGreaterThanOrEqual(6);
    expect(featuredEmoji().length).toBeGreaterThanOrEqual(10);
    const known = new Set(ALL_EMOJI.map((e) => e.emoji));
    for (const entry of featuredEmoji()) expect(known.has(entry.emoji)).toBe(true);
    const symbols = new Set(SYMBOLS.map((s) => s.char));
    for (const entry of featuredSymbols()) expect(symbols.has(entry.char)).toBe(true);
  });

  it("have no character twice", () => {
    const chars = [...featuredSymbols().map((s) => s.char), ...featuredEmoji().map((e) => e.emoji)];
    expect(new Set(chars).size).toBe(chars.length);
  });
});
