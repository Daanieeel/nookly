import { afterEach, describe, expect, it } from "vitest";
import { settings } from "#/lib/settings/settings.ts";
import { renderMath } from "./math";

function render(latex: string) {
  const element = document.createElement("div");
  const error = renderMath(latex, element, true);
  return { error, html: element.innerHTML };
}

describe("logic gate operators", () => {
  it.each(["\\xor", "\\nand", "\\nor", "\\xnor"])("%s renders between two operands", (macro) => {
    const { error, html } = render(`A ${macro} B`);
    expect(error).toBeNull();
    expect(html).toContain("katex");
  });

  it("draws NAND, NOR and XNOR as the AND, OR and XOR symbols with a bar over them", () => {
    expect(render("A \\nand B").html).toContain("∧");
    expect(render("A \\nor B").html).toContain("∨");
    expect(render("A \\xnor B").html).toContain("⊕");
    expect(render("A \\xor B").html).toContain("⊕");
    expect(render("A \\xor B").html).not.toContain("overline");
    for (const macro of ["\\nand", "\\nor", "\\xnor"]) {
      expect(render(`A ${macro} B`).html).toContain("overline");
    }
  });

  it("works inside a larger formula and a math block's rows", () => {
    expect(render("Y = (A \\nor B) \\xor \\overline{C}").error).toBeNull();
    expect(
      render("\\begin{aligned}S &= A \\xor B \\\\ C &= A \\nand B\\end{aligned}").error,
    ).toBeNull();
  });

  it("still reports an unknown command", () => {
    expect(render("A \\nope B").error).toMatch(/Undefined control sequence/);
  });
});

// #122: the user's own commands from Settings work in every formula.
describe("custom LaTeX macros", () => {
  afterEach(() => settings.set("notes.latexMacros", ""));
  const set = (macros: string) => settings.set("notes.latexMacros", macros);

  it("has no effect while the setting is empty", () => {
    expect(render("\\NN").error).toMatch(/undefined control sequence/i);
  });

  it("renders a command from \\newcommand", () => {
    set("\\newcommand{\\NN}{\\mathbb{N}}");
    const { error, html } = render("x \\in \\NN");
    expect(error).toBeNull();
    expect(html).toContain("double-struck");
  });

  it("renders a command with arguments", () => {
    set("\\newcommand{\\abs}[1]{\\left|#1\\right|}\\newcommand{\\pair}[2]{(#1, #2)}");
    expect(render("\\abs{x} + \\pair{a}{b}").error).toBeNull();
  });

  it("renders the stacked z.z. symbol from the issue", () => {
    set("\\newcommand{\\zz}{\\mathrel{\\substack{\\mathrm{z}\\\\\\mathrm{z}}}}");
    expect(render("a \\zz b").error).toBeNull();
  });

  it("follows an edit on the next render", () => {
    set("\\newcommand{\\v}{1}");
    expect(render("\\v").html).toContain(">1<");
    set("\\newcommand{\\v}{2}");
    expect(render("\\v").html).toContain(">2<");
  });

  it("keeps working when a definition is wrong", () => {
    set("\\newcommand{\\broken}{unclosed\n\\newcommand{\\ok}{\\alpha}");
    expect(render("\\ok").error).toBeNull();
    expect(render("x^2").error).toBeNull();
  });

  it("lets a custom command replace one of the built in gate operators", () => {
    set("\\newcommand{\\xor}{\\text{xor}}");
    expect(render("A \\xor B").html).toContain("xor");
  });

  it("draws with a definition that is not saved, over the saved ones", () => {
    set("\\newcommand{\\v}{1}");
    const element = document.createElement("div");
    expect(renderMath("\\v \\w", element, false, { "\\v": "a", "\\w": "b" })).toBeNull();
    expect(element.innerHTML).toContain(">a<");
    expect(element.innerHTML).toContain(">b<");
    // and leaves the saved ones as they were
    expect(render("\\v").html).toContain(">1<");
  });

  it("does not let a command loop forever", () => {
    set("\\newcommand{\\loop}{\\loop}");
    expect(render("\\loop").error).toMatch(/too many expansions/i);
  });
});
