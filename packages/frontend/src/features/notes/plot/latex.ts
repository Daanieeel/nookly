import type { Expr } from "./parse";

/// The plot code as LaTeX, for the legend: `x^2 - 2` as `x^{2} - 2`, `sqrt(x)` as `\sqrt{x}`.

const NAMED_FUNCTIONS = new Map([
  ["sin", "\\sin"],
  ["cos", "\\cos"],
  ["tan", "\\tan"],
  ["asin", "\\arcsin"],
  ["acos", "\\arccos"],
  ["atan", "\\arctan"],
  ["sinh", "\\sinh"],
  ["cosh", "\\cosh"],
  ["tanh", "\\tanh"],
  ["ln", "\\ln"],
  ["log", "\\log"],
  ["exp", "\\exp"],
  ["min", "\\min"],
  ["max", "\\max"],
  ["round", "\\operatorname{round}"],
  ["sign", "\\operatorname{sgn}"],
]);

const WRAPPED_FUNCTIONS = new Map([
  ["sqrt", (a: string) => `\\sqrt{${a}}`],
  ["cbrt", (a: string) => `\\sqrt[3]{${a}}`],
  ["abs", (a: string) => `\\left|${a}\\right|`],
  ["floor", (a: string) => `\\left\\lfloor ${a}\\right\\rfloor`],
  ["ceil", (a: string) => `\\left\\lceil ${a}\\right\\rceil`],
]);

/// How tightly an expression binds, so a part is only bracketed where the code's own
/// order would otherwise change.
const SUM = 1;
const PRODUCT = 2;
const NEGATION = 3;
const POWER = 4;
const ATOM = 5;

/// A name as a symbol: `z_1` as `z_{1}`, a longer name upright, `pi` as the letter.
export function nameLatex(name: string): string {
  if (name === "pi" || name === "π") return "\\pi";
  const split = name.indexOf("_");
  const base = split < 0 ? name : name.slice(0, split);
  const sub = split < 0 ? "" : name.slice(split + 1).replaceAll("_", "\\_");
  const head = base === "" ? "\\_" : [...base].length > 1 ? `\\mathrm{${base}}` : base;
  return sub ? `${head}_{${sub}}` : head;
}

/// A vector's name, with its arrow: `\vec{a}`.
export const vectorLatex = (name: string): string => `\\vec{${nameLatex(name)}}`;

function numberLatex(value: number): string {
  const [mantissa = "", exponent] = String(value).split("e");
  return exponent === undefined ? mantissa : `${mantissa} \\cdot 10^{${Number(exponent)}}`;
}

function precedence(expr: Expr): number {
  switch (expr.kind) {
    case "negate":
      return NEGATION;
    case "binary":
      if (expr.op === "^") return POWER;
      if (expr.op === "/") return ATOM;
      return expr.op === "*" ? PRODUCT : SUM;
    default:
      return ATOM;
  }
}

/// `expr` as LaTeX, with `param` as the name of its variable.
export function toLatex(expr: Expr, param: string): string {
  const part = (e: Expr, least: number) =>
    precedence(e) < least ? `\\left(${toLatex(e, param)}\\right)` : toLatex(e, param);
  switch (expr.kind) {
    case "number":
      return numberLatex(expr.value);
    case "param":
      return nameLatex(param);
    case "constant":
      return nameLatex(expr.name);
    case "negate":
      return `-${part(expr.operand, POWER)}`;
    case "call": {
      const args = expr.args.map((a) => toLatex(a, param));
      const wrapped = WRAPPED_FUNCTIONS.get(expr.name);
      if (wrapped) return wrapped(args.join(", "));
      const head = NAMED_FUNCTIONS.get(expr.name) ?? nameLatex(expr.name);
      return `${head}\\left(${args.join(", ")}\\right)`;
    }
    case "binary": {
      const { op, left, right } = expr;
      if (op === "/") return `\\frac{${toLatex(left, param)}}{${toLatex(right, param)}}`;
      if (op === "^") return `${part(left, ATOM)}^{${toLatex(right, param)}}`;
      if (op === "+" || op === "-") return `${part(left, SUM)} ${op} ${part(right, PRODUCT)}`;
      // `2x` stays joined, but `2 * 3` and `x2` would read as one number or a name.
      const joined = expr.implicit && right.kind !== "number";
      return `${part(left, PRODUCT)}${joined ? " " : " \\cdot "}${part(right, POWER)}`;
    }
  }
}
