import katex from "katex";
import "katex/contrib/mhchem";
import "katex/dist/katex.min.css";

/// Logic gate operators, which LaTeX has no commands for: `A \nand B`. The negated
/// gates are the plain symbol with a bar over it.
const GATE_MACROS = {
  "\\xor": "\\mathbin{\\oplus}",
  "\\nand": "\\mathbin{\\overline{\\wedge}}",
  "\\nor": "\\mathbin{\\overline{\\vee}}",
  "\\xnor": "\\mathbin{\\overline{\\oplus}}",
};

/// LaTeX rendering for the math blocks and inline math, through KaTeX with the
/// mhchem extension (`\ce{H2O}`) and the gate operators above. Errors come back as a
/// message instead of a throw, so a half typed formula shows what's wrong rather than nothing.
export function renderMath(
  latex: string,
  element: HTMLElement,
  displayMode: boolean,
): string | null {
  try {
    katex.render(latex, element, {
      displayMode,
      throwOnError: true,
      strict: "ignore",
      trust: false,
      // KaTeX writes a macro's definitions into this object, so each call gets a copy.
      macros: { ...GATE_MACROS },
      output: "htmlAndMathml",
    });
    return null;
  } catch (error) {
    element.textContent = "";
    return error instanceof Error
      ? error.message.replace(/^KaTeX parse error: /, "")
      : String(error);
  }
}

/// A math block's lines as one display formula: each line becomes a row of an
/// `aligned` environment (so `&` aligns them), unless the source already opens
/// an environment of its own. Mirrors `math_block_latex` in `block_types.rs`.
export function mathBlockLatex(source: string): string {
  if (source.includes("\\begin{")) return source;
  const rows = source
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/(?:\\\\)+$/, "")
        .trimEnd(),
    )
    .filter((line) => line !== "");
  return rows.length > 1
    ? `\\begin{aligned}\n${rows.join(" \\\\\n")}\n\\end{aligned}`
    : (rows[0] ?? "");
}
