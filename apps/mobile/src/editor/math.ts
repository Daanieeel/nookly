import type { ParsedMacros } from "@nookly/shared/latex";
import katex from "katex";

/// What a formula is drawn as: MathML, which the phone's web view (Safari's engine) shows
/// without KaTeX's fonts and stylesheet. `macros` are the person's own commands from
/// Settings. Source that does not parse shows as itself, marked, never as an error.
export function mathMarkup(
  latex: string,
  macros: ParsedMacros["macros"],
  display: boolean,
): string {
  const source = latex.trim();
  if (!source) return "";
  try {
    return katex.renderToString(source, {
      output: "mathml",
      displayMode: display,
      macros: { ...macros },
      throwOnError: true,
      strict: "ignore",
      trust: false,
    });
  } catch {
    const escaped = source.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    return `<code class="math-error">${escaped}</code>`;
  }
}

/// What KaTeX finds wrong with a formula, in its own words, or null when it draws.
export function mathProblem(latex: string, macros: ParsedMacros["macros"]): string | null {
  try {
    katex.renderToString(latex, {
      output: "mathml",
      macros: { ...macros },
      throwOnError: true,
      strict: "ignore",
      trust: false,
    });
    return null;
  } catch (error) {
    return (error instanceof Error ? error.message : String(error)).replace(
      /^KaTeX parse error: /,
      "",
    );
  }
}
