import { describe, expect, it } from "vitest";
import { decodeInline, encodeInline, type JSONNode } from "./block-markdown";

const text = (value: string, ...marks: string[]): JSONNode => ({
  type: "text",
  text: value,
  ...(marks.length > 0 && { marks: marks.map((type) => ({ type })) }),
});
const math = (latex: string, ...marks: string[]): JSONNode => ({
  type: "inlineMath",
  attrs: { latex },
  ...(marks.length > 0 && { marks: marks.map((type) => ({ type })) }),
});
const roundTrip = (markdown: string) => encodeInline(decodeInline(markdown));

describe("highlighted text", () => {
  it("reads ==text== as a highlight", () => {
    expect(decodeInline("a ==b== c")).toEqual([text("a "), text("b", "highlight"), text(" c")]);
  });

  it("writes a highlight back as ==text==", () => {
    expect(encodeInline([text("a "), text("b", "highlight"), text(" c")])).toBe("a ==b== c");
  });

  it("keeps the markers through a save and reload", () => {
    for (const markdown of ["==one==", "x ==one== y ==two== z", "==a b c=="]) {
      expect(roundTrip(markdown)).toBe(markdown);
    }
  });

  it("joins neighbours that share the highlight into one pair of markers", () => {
    const nodes = [
      text("a ", "highlight"),
      text("b", "highlight", "bold"),
      text(" c", "highlight"),
    ];
    expect(encodeInline(nodes)).toBe("==a **b** c==");
  });

  it("works together with bold, italic and code", () => {
    expect(decodeInline("==**b**==")).toEqual([text("b", "bold", "highlight")]);
    expect(decodeInline("**==b==**")).toEqual([text("b", "highlight", "bold")]);
    expect(decodeInline("==*i*==")).toEqual([text("i", "italic", "highlight")]);
    expect(decodeInline("==a `c` b==")).toEqual([
      text("a ", "highlight"),
      text("c", "code", "highlight"),
      text(" b", "highlight"),
    ]);
    for (const markdown of ["==**b**==", "==a **b** c==", "==*i*==", "==a `c` b=="]) {
      expect(roundTrip(markdown)).toBe(markdown);
    }
  });

  it("works with inline math, which stays inside the highlight", () => {
    expect(decodeInline("==see $x^2$ now==")).toEqual([
      text("see ", "highlight"),
      math("x^2", "highlight"),
      text(" now", "highlight"),
    ]);
    expect(roundTrip("==see $x^2$ now==")).toBe("==see $x^2$ now==");
  });

  it("works with links", () => {
    const nodes = decodeInline("==[docs](https://x.dev)==");
    expect(nodes).toEqual([
      {
        type: "text",
        text: "docs",
        marks: [{ type: "link", attrs: { href: "https://x.dev" } }, { type: "highlight" }],
      },
    ]);
    expect(roundTrip("==[docs](https://x.dev)==")).toBe("==[docs](https://x.dev)==");
  });

  it("leaves a lone or spaced == as text", () => {
    for (const plain of ["a == b", "if x == y then z == w", "==", "a ==", "== a ==", "a====b"]) {
      expect(decodeInline(plain).some((n) => n.marks?.some((m) => m.type === "highlight"))).toBe(
        false,
      );
      expect(roundTrip(plain)).toBe(plain);
    }
  });

  it("leaves == inside code and math alone", () => {
    expect(roundTrip("`a==b==c`")).toBe("`a==b==c`");
    expect(decodeInline("$a==b==c$")).toEqual([math("a==b==c")]);
  });
});

describe("bold and italic together", () => {
  // Used to come back as "*" + bold + "*": the asterisks of ***both*** were not read.
  it("read ***text*** as bold and italic, and write it back", () => {
    expect(decodeInline("***both***")).toEqual([text("both", "bold", "italic")]);
    expect(encodeInline([text("both", "bold", "italic")])).toBe("***both***");
  });

  it("read italic inside bold", () => {
    expect(decodeInline("**a *b* c**")).toEqual([
      text("a ", "bold"),
      text("b", "italic", "bold"),
      text(" c", "bold"),
    ]);
  });

  it("leave plain bold, italic and code as they were", () => {
    expect(decodeInline("**b** *i* `c`")).toEqual([
      text("b", "bold"),
      text(" "),
      text("i", "italic"),
      text(" "),
      text("c", "code"),
    ]);
  });
});
