import katex from "katex";
import "katex/contrib/mhchem";
import "katex/dist/katex.min.css";
import { settings } from "#/lib/settings/settings.ts";
import { GATE_MACROS } from "./gate-macros.ts";
import { parseLatexMacros } from "#/lib/latex-macros.ts";

let parsed: { text: string; macros: Record<string, string> } | null = null;

/// The user's own commands from Settings, read as they are now so a change applies to the
/// next render. A definition that does not parse is left out; Settings says which.
function userMacros(): Record<string, string> {
  const text = settings.get("notes.latexMacros");
  if (parsed?.text !== text) parsed = { text, macros: parseLatexMacros(text).macros };
  return parsed.macros;
}

/// Every command a formula can use: the gate operators and the user's own, KaTeX style
/// (`\\name` to its expansion).
export function latexMacros() {
  return { ...GATE_MACROS, ...userMacros() };
}

/// LaTeX rendering for the math blocks and inline math, through KaTeX with the
/// mhchem extension (`\ce{H2O}`), the gate operators above and the user's own commands. Errors come back as a
/// message instead of a throw, so a half typed formula shows what's wrong rather than nothing.
export function renderMath(
  latex: string,
  element: HTMLElement,
  displayMode: boolean,
  /// Definitions to draw with on top of the saved ones, for a macro not saved yet.
  extraMacros: Record<string, string> = {},
): string | null {
  try {
    katex.render(latex, element, {
      displayMode,
      throwOnError: true,
      strict: "ignore",
      trust: false,
      // KaTeX writes a macro's definitions into this object, so each call gets a copy.
      macros: { ...latexMacros(), ...extraMacros },
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
