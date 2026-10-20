import { describe, expect, it } from "vitest";
import { decodeInline, encodeInline, type JSONNode } from "./block-markdown";
import { TEXT_COLORS } from "./text-colors";

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

// The colour of a highlight lives in the stored page only: `=={green}text==`. Markdown
// export turns it back into plain `==text==` (see `block_to_markdown` in `notes.rs`).
describe("highlight colours", () => {
  const colored = (value: string, color: string): JSONNode => ({
    type: "text",
    text: value,
    marks: [{ type: "highlight", attrs: { color } }],
  });

  it("reads =={color}text== as a coloured highlight", () => {
    expect(decodeInline("a =={green}b== c")).toEqual([
      text("a "),
      colored("b", "green"),
      text(" c"),
    ]);
  });

  it("writes a coloured highlight with its colour, and the default one without", () => {
    expect(encodeInline([text("a "), colored("b", "pink"), text(" c")])).toBe("a =={pink}b== c");
    expect(encodeInline([colored("b", "yellow")])).toBe("==b==");
    expect(encodeInline([text("b", "highlight")])).toBe("==b==");
  });

  it("keeps every colour through a save and reload", () => {
    for (const color of ["green", "blue", "pink", "orange", "purple"]) {
      const markdown = `x =={${color}}marked== y`;
      expect(roundTrip(markdown)).toBe(markdown);
    }
    expect(roundTrip("=={yellow}marked==")).toBe("==marked==");
  });

  it("starts a new highlight where the colour changes", () => {
    const nodes = [colored("a", "green"), colored("b", "blue"), colored("c", "blue")];
    expect(encodeInline(nodes)).toBe("=={green}a===={blue}bc==");
    expect(decodeInline("=={green}a===={blue}bc==")).toEqual([
      colored("a", "green"),
      colored("bc", "blue"),
    ]);
  });

  it("reads an unknown colour as plain text inside a plain highlight", () => {
    expect(decodeInline("=={chartreuse}b==")).toEqual([text("{chartreuse}b", "highlight")]);
  });

  it("keeps the colour next to bold and inline math", () => {
    expect(roundTrip("=={blue}**b** and $x$==")).toBe("=={blue}**b** and $x$==");
  });
});

// A text colour lives in the stored page only: `{red}text{/}`. Markdown export drops it (see
// `block_to_markdown` in `notes.rs`).
describe("text colours", () => {
  const colored = (value: string, color: string, ...marks: string[]): JSONNode => ({
    type: "text",
    text: value,
    marks: [...marks.map((type) => ({ type })), { type: "textColor", attrs: { color } }],
  });

  it("reads {color}text{/} as coloured text", () => {
    expect(decodeInline("a {red}b{/} c")).toEqual([text("a "), colored("b", "red"), text(" c")]);
  });

  it("writes coloured text with its colour", () => {
    expect(encodeInline([text("a "), colored("b", "green"), text(" c")])).toBe("a {green}b{/} c");
  });

  it("keeps every colour through a save and reload", () => {
    for (const color of TEXT_COLORS.map((c) => c.id)) {
      const markdown = `x {${color}}coloured text{/} y`;
      expect(roundTrip(markdown)).toBe(markdown);
    }
  });

  it("joins neighbours of one colour and starts a new run where the colour changes", () => {
    const nodes = [colored("a", "red"), colored("b", "blue"), colored("c", "blue")];
    expect(encodeInline(nodes)).toBe("{red}a{/}{blue}bc{/}");
    expect(decodeInline("{red}a{/}{blue}bc{/}")).toEqual([
      colored("a", "red"),
      colored("bc", "blue"),
    ]);
  });

  it("works with bold, italic, code, links, math and highlights", () => {
    for (const markdown of [
      "{red}**b** and *i*{/}",
      "{red}a `c` b{/}",
      "{red}[docs](https://x.dev){/}",
      "{red}see $x^2$ now{/}",
      "{red}==marked== text{/}",
      "==marked {red}text{/} here==",
      "{blue}=={green}both=={/}",
    ]) {
      expect(roundTrip(markdown)).toBe(markdown);
    }
    expect(decodeInline("{red}**b**{/}")).toEqual([colored("b", "red", "bold")]);
  });

  it("reads an unknown colour as plain text", () => {
    expect(decodeInline("{chartreuse}b{/}")).toEqual([text("{chartreuse}b{/}")]);
    expect(decodeInline("{red}b")).toEqual([text("{red}b")]);
  });

  it("leaves braces in code and math alone", () => {
    expect(roundTrip("`{red}a{/}`")).toBe("`{red}a{/}`");
    expect(decodeInline("$a{red}b{/}$")).toEqual([math("a{red}b{/}")]);
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

// A formula that was drawn must still be drawn after a save and reload. One that did not
// survive came back as raw `$…$` text (#157).
describe("inline math survives a save and reload", () => {
  const roundTripsAsMath = (latex: string, before = "", after = "") => {
    const nodes = [text(before), math(latex), text(after)].filter(
      (n) => n.type !== "text" || n.text,
    );
    return decodeInline(encodeInline(nodes)).filter((n) => n.type === "inlineMath");
  };

  it("keeps a formula whose text has a space or line break at either end", () => {
    expect(roundTripsAsMath(" x^2 ")).toEqual([math("x^2")]);
    expect(roundTripsAsMath("a\nb")).toEqual([math("a b")]);
  });

  it("keeps a formula followed straight away by a digit", () => {
    expect(roundTripsAsMath("n^2", "", "5")).toEqual([math("n^2")]);
    expect(roundTripsAsMath("x", "", "5")).toHaveLength(1);
    expect(decodeInline(encodeInline([math("x"), text("5")])).at(-1)).toEqual(text("5"));
  });

  it("keeps a formula holding an escaped dollar", () => {
    expect(roundTripsAsMath("\\$5")).toEqual([math("\\$5")]);
  });

  it("writes an empty formula as nothing instead of $$", () => {
    expect(encodeInline([text("a"), math(""), text("b")])).toBe("ab");
    expect(encodeInline([math("  ")])).toBe("");
  });

  it("reads a formula that a digit follows when it is clearly TeX, and not a price", () => {
    expect(decodeInline("$\\frac{1}{2}$3")).toEqual([math("\\frac{1}{2}"), text("3")]);
    expect(decodeInline("$5-$10")).toEqual([text("$5-$10")]);
  });

  it("does not change formulas that were fine", () => {
    for (const markdown of ["$x^2$", "a $\\frac{3}{4}$ b", "$a==b==c$", "$\\sum_{k=1}^{n} k$."]) {
      expect(roundTrip(markdown)).toBe(markdown);
    }
  });
});
