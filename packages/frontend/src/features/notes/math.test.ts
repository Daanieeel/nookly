import { describe, expect, it } from "vitest";
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
