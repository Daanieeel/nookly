import { describe, expect, it } from "vitest";
import { mathPreamble, parseLatexMacros, withMathPreamble } from "./latex-macros";

describe("parseLatexMacros", () => {
  it("reads \\newcommand definitions, with and without arguments", () => {
    const { macros, errors } = parseLatexMacros(
      [
        "\\newcommand{\\zz}{\\mathrel{\\substack{\\mathrm{z}\\\\\\mathrm{z}}}}",
        "\\newcommand{\\N}{\\mathbb{N}}",
        "\\newcommand{\\abs}[1]{\\left|#1\\right|}",
        "\\newcommand{\\pair}[2]{(#1, #2)}",
      ].join("\n"),
    );
    expect(errors).toEqual([]);
    expect(macros).toEqual({
      "\\zz": "\\mathrel{\\substack{\\mathrm{z}\\\\\\mathrm{z}}}",
      "\\N": "\\mathbb{N}",
      "\\abs": "\\left|#1\\right|",
      "\\pair": "(#1, #2)",
    });
  });

  it("accepts \\renewcommand, \\providecommand, \\def and the bare command name", () => {
    const { macros, errors } = parseLatexMacros(
      "\\renewcommand\\R{\\mathbb{R}}\n\\providecommand{\\Q}{\\mathbb{Q}}\n\\def\\C{\\mathbb{C}}\n\\def\\sq#1{#1^2}",
    );
    expect(errors).toEqual([]);
    expect(macros).toEqual({
      "\\R": "\\mathbb{R}",
      "\\Q": "\\mathbb{Q}",
      "\\C": "\\mathbb{C}",
      "\\sq": "#1^2",
    });
  });

  it("turns \\DeclareMathOperator into an operator name", () => {
    expect(parseLatexMacros("\\DeclareMathOperator{\\rank}{rank}").macros).toEqual({
      "\\rank": "\\operatorname{rank}",
    });
    expect(parseLatexMacros("\\DeclareMathOperator*{\\argmax}{arg\\,max}").macros).toEqual({
      "\\argmax": "\\operatorname*{arg\\,max}",
    });
  });

  it("reads a definition that spans several lines", () => {
    const { macros, errors } = parseLatexMacros(
      "\\newcommand{\\triple}[3]{\n  \\begin{cases}\n    #1 \\\\ #2 \\\\ #3\n  \\end{cases}\n}\n\\newcommand{\\a}{b}",
    );
    expect(errors).toEqual([]);
    expect(Object.keys(macros)).toEqual(["\\triple", "\\a"]);
    expect(macros["\\triple"]).toContain("\\begin{cases}");
  });

  it("ignores blank lines and % comments, also after a definition", () => {
    const { macros, errors } = parseLatexMacros(
      "% my notation\n\n\\newcommand{\\N}{\\mathbb{N}} % naturals\n   \n%\\newcommand{\\no}{x}",
    );
    expect(errors).toEqual([]);
    expect(macros).toEqual({ "\\N": "\\mathbb{N}" });
  });

  it("keeps braces and escaped braces in a body balanced", () => {
    const { macros, errors } = parseLatexMacros("\\newcommand{\\set}[1]{\\left\\{#1\\right\\}}");
    expect(errors).toEqual([]);
    expect(macros["\\set"]).toBe("\\left\\{#1\\right\\}");
  });

  it("reports what is wrong, with the line, and keeps the rest", () => {
    const { macros, errors } = parseLatexMacros(
      [
        "\\newcommand{\\ok}{1}",
        "\\newcommand{\\broken}{unclosed",
        "plain text",
        "\\newcommand{nope}{x}",
        "\\newcommand{\\two}[2]{#1#3}",
        "\\newcommand{\\opt}[1][d]{#1}",
      ].join("\n"),
    );
    expect(macros).toEqual({ "\\ok": "1" });
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6]);
    expect(errors[0]?.message).toMatch(/closing brace/i);
    expect(errors[1]?.message).toMatch(/definition/i);
    expect(errors[2]?.message).toMatch(/backslash and letters/i);
    expect(errors[3]?.message).toMatch(/#3/);
    expect(errors[4]?.message).toMatch(/default value/i);
  });

  it("reports text that is not a definition", () => {
    const { macros, errors } = parseLatexMacros("x^2\n\\newcommand{\\a}{1}");
    expect(macros).toEqual({ "\\a": "1" });
    expect(errors).toEqual([{ line: 1, message: expect.stringMatching(/definition/i) }]);
  });

  it("is empty for an empty setting", () => {
    expect(parseLatexMacros("")).toEqual({ macros: {}, errors: [] });
    expect(parseLatexMacros("  \n\n")).toEqual({ macros: {}, errors: [] });
  });
});

// #122: exported notes carry the commands they use, so they do not break elsewhere.
describe("mathPreamble", () => {
  const macros = "\\newcommand{\\N}{\\mathbb{N}}\n\\newcommand{\\abs}[1]{\\left|#1\\right|}";

  it("writes every definition out in full, one per line", () => {
    expect(mathPreamble(macros)).toBe(
      "\\newcommand{\\N}{\\mathbb{N}}\n\\newcommand{\\abs}[1]{\\left|#1\\right|}",
    );
  });

  it("leaves out definitions that did not parse", () => {
    expect(mathPreamble("\\newcommand{\\ok}{1}\n\\newcommand{\\bad}{open")).toBe(
      "\\newcommand{\\ok}{1}",
    );
  });

  it("is empty without macros", () => {
    expect(mathPreamble("")).toBe("");
  });
});

describe("withMathPreamble", () => {
  const macros = "\\newcommand{\\N}{\\mathbb{N}}";

  it("puts a math block with the definitions in front of a page that uses a command", () => {
    expect(withMathPreamble("Let $x \\in \\N$.", macros)).toBe(
      "$$\n\\newcommand{\\N}{\\mathbb{N}}\n$$\n\nLet $x \\in \\N$.",
    );
  });

  it("leaves a page that uses none of them as it is", () => {
    expect(withMathPreamble("Let $x \\in \\mathbb{N}$.", macros)).toBe("Let $x \\in \\mathbb{N}$.");
    expect(withMathPreamble("no math", macros)).toBe("no math");
  });

  it("does not take \\NN for a use of \\N", () => {
    expect(withMathPreamble("$\\NN$", macros)).toBe("$\\NN$");
    expect(withMathPreamble("$\\N$", macros)).toContain("newcommand");
    expect(withMathPreamble("$\\N_0$", macros)).toContain("newcommand");
  });

  it("leaves the page alone without macros", () => {
    expect(withMathPreamble("$\\N$", "")).toBe("$\\N$");
  });
});
