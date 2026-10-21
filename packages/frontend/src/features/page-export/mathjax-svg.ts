import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { macroArgumentCount } from "#/lib/latex-macros.ts";
import { KATEX_ALIASES } from "./katex-aliases.ts";

/// LaTeX drawn as self contained SVG paths for an export. The editor draws with KaTeX, whose
/// HTML and fonts can't become a picture; MathJax's SVG can, and reads the same TeX,
/// `\ce{}` included. Loaded only when a page with math is exported.

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

/// Packages that turn an error into red text; an export shows the source instead.
const QUIET_PACKAGES = new Set(["noerrors", "noundefined"]);

type MathJaxMacros = Record<string, string | [string, number]>;

/// KaTeX style macros (`\name` to its body) as MathJax wants them: no backslash, and the
/// number of arguments the body uses.
export function mathJaxMacros(macros: Record<string, string>): MathJaxMacros {
  return Object.fromEntries(
    Object.entries(macros).map(([name, body]) => {
      const args = macroArgumentCount(body);
      return [name.replace(/^\\/, ""), args > 0 ? [body, args] : body];
    }),
  );
}

let cached: { key: string; convert: (latex: string, display: boolean) => string } | null = null;

function converter(macros: Record<string, string>) {
  const key = JSON.stringify(macros);
  if (cached?.key === key) return cached.convert;
  const tex = new TeX({
    packages: AllPackages.filter((name) => !QUIET_PACKAGES.has(name)),
    macros: mathJaxMacros({ ...KATEX_ALIASES, ...macros }),
  });
  const svg = new SVG({ fontCache: "none" });
  const html = mathjax.document("", { InputJax: tex, OutputJax: svg });
  const convert = (latex: string, display: boolean) => {
    const svg = adaptor.innerHTML(
      html.convert(latex, { display, em: 16, ex: 8, containerWidth: 1280 }),
    );
    // MathJax draws a TeX error as red text in the formula; an export shows the source.
    if (svg.includes("data-mjx-error")) throw new Error("the formula has a TeX error");
    return svg;
  };
  cached = { key, convert };
  return convert;
}

/// The formula as an `<svg>` string, sized in `ex` (8px each). Throws on a TeX error.
export function texToSvg(latex: string, display: boolean, macros: Record<string, string>): string {
  return converter(macros)(latex, display);
}
