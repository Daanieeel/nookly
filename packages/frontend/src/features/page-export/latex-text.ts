/// Simple inline TeX as plain Unicode text, for the one place a formula can't be a picture:
/// a line of text in the PDF. `E = mc^2` reads `E = mc²`, `\ce{H2O}` reads `H₂O`. Anything
/// this can't spell out exactly returns null, and the TeX itself is shown instead.

import { GATE_MACROS } from "#/features/notes/gate-macros.ts";
import { KATEX_ALIASES } from "./katex-aliases.ts";

/// Commands that stand for other commands, spelled out through what they stand for.
const ALIASES = new Map(Object.entries({ ...KATEX_ALIASES, ...GATE_MACROS }));

const SYMBOLS = new Map(
  Object.entries({
    alpha: "α",
    beta: "β",
    gamma: "γ",
    delta: "δ",
    epsilon: "ε",
    varepsilon: "ε",
    zeta: "ζ",
    eta: "η",
    theta: "θ",
    vartheta: "ϑ",
    iota: "ι",
    kappa: "κ",
    lambda: "λ",
    mu: "μ",
    nu: "ν",
    xi: "ξ",
    pi: "π",
    rho: "ρ",
    sigma: "σ",
    tau: "τ",
    upsilon: "υ",
    phi: "φ",
    varphi: "φ",
    chi: "χ",
    psi: "ψ",
    omega: "ω",
    Gamma: "Γ",
    Delta: "Δ",
    Theta: "Θ",
    Lambda: "Λ",
    Xi: "Ξ",
    Pi: "Π",
    Sigma: "Σ",
    Phi: "Φ",
    Psi: "Ψ",
    Omega: "Ω",
    cdot: "·",
    times: "×",
    div: "÷",
    pm: "±",
    mp: "∓",
    leq: "≤",
    le: "≤",
    geq: "≥",
    ge: "≥",
    neq: "≠",
    ne: "≠",
    approx: "≈",
    equiv: "≡",
    sim: "∼",
    propto: "∝",
    infty: "∞",
    to: "→",
    rightarrow: "→",
    leftarrow: "←",
    Rightarrow: "⇒",
    Leftarrow: "⇐",
    iff: "⇔",
    leftrightarrow: "↔",
    Leftrightarrow: "⇔",
    uparrow: "↑",
    downarrow: "↓",
    Uparrow: "⇑",
    Downarrow: "⇓",
    mapsto: "↦",
    implies: "⟹",
    impliedby: "⟸",
    gt: ">",
    lt: "<",
    ll: "≪",
    gg: "≫",
    supset: "⊃",
    supseteq: "⊇",
    setminus: "∖",
    mid: "∣",
    "|": "‖",
    parallel: "∥",
    perp: "⊥",
    top: "⊤",
    bot: "⊥",
    langle: "⟨",
    rangle: "⟩",
    lfloor: "⌊",
    rfloor: "⌋",
    lceil: "⌈",
    rceil: "⌉",
    varnothing: "∅",
    nexists: "∄",
    lnot: "¬",
    veebar: "⊻",
    otimes: "⊗",
    ominus: "⊖",
    odot: "⊙",
    bullet: "•",
    ast: "∗",
    star: "⋆",
    therefore: "∴",
    because: "∵",
    angle: "∠",
    aleph: "ℵ",
    hbar: "ℏ",
    ell: "ℓ",
    wp: "℘",
    Re: "ℜ",
    Im: "ℑ",
    colon: ":",
    vdots: "⋮",
    in: "∈",
    notin: "∉",
    subset: "⊂",
    subseteq: "⊆",
    cup: "∪",
    cap: "∩",
    emptyset: "∅",
    forall: "∀",
    exists: "∃",
    neg: "¬",
    land: "∧",
    lor: "∨",
    wedge: "∧",
    vee: "∨",
    oplus: "⊕",
    partial: "∂",
    nabla: "∇",
    sum: "∑",
    prod: "∏",
    int: "∫",
    degree: "°",
    circ: "∘",
    ldots: "…",
    dots: "…",
    cdots: "⋯",
    prime: "′",
    ",": " ",
    ";": " ",
    ":": " ",
    "!": "",
    quad: " ",
    qquad: "  ",
    " ": " ",
    "{": "{",
    "}": "}",
    "%": "%",
    $: "$",
    "&": "&",
    "#": "#",
    _: "_",
  }),
);

const SUPERSCRIPT = new Map(
  Object.entries({
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
    "+": "⁺",
    "-": "⁻",
    "=": "⁼",
    "(": "⁽",
    ")": "⁾",
    n: "ⁿ",
    i: "ⁱ",
    x: "ˣ",
  }),
);

const SUBSCRIPT = new Map(
  Object.entries({
    "0": "₀",
    "1": "₁",
    "2": "₂",
    "3": "₃",
    "4": "₄",
    "5": "₅",
    "6": "₆",
    "7": "₇",
    "8": "₈",
    "9": "₉",
    "+": "₊",
    "-": "₋",
    "=": "₌",
    "(": "₍",
    ")": "₎",
    a: "ₐ",
    e: "ₑ",
    i: "ᵢ",
    j: "ⱼ",
    k: "ₖ",
    n: "ₙ",
    o: "ₒ",
    x: "ₓ",
  }),
);

/// `\mathbb` letters. Most live in the math alphabets, the common sets in their own block.
const DOUBLE_STRUCK = new Map(
  Object.entries({ C: "ℂ", H: "ℍ", N: "ℕ", P: "ℙ", Q: "ℚ", R: "ℝ", Z: "ℤ" }),
);

function doubleStruck(c: string): string {
  const known = DOUBLE_STRUCK.get(c);
  if (known) return known;
  const offset = (start: string, base: number) =>
    String.fromCodePoint(base + c.charCodeAt(0) - start.charCodeAt(0));
  if (/[A-Z]/.test(c)) return offset("A", 0x1d538);
  if (/[a-z]/.test(c)) return offset("a", 0x1d552);
  if (/[0-9]/.test(c)) return offset("0", 0x1d7d8);
  throw new Unspeakable();
}

/// Accents drawn over each character: `\overline{AB}` reads `ĀB̄`. A macron rather than
/// the combining overline, which the PDF writer places beside the letter, not over it.
const ACCENTS = new Map(
  Object.entries({
    overline: "\u0304",
    bar: "\u0304",
    vec: "\u20d7",
    hat: "\u0302",
    dot: "\u0307",
  }),
);

/// Commands that only shape what follows, which plain text reads straight through.
const PASS_THROUGH = new Set([
  "text",
  "mathrm",
  "mathit",
  "mathbf",
  "mathsf",
  "operatorname",
  "mathbin",
  "mathrel",
  "mathop",
  "mathord",
]);

/// Thrown when the formula needs more than plain text can show.
class Unspeakable extends Error {}

function shift(text: string, table: Map<string, string>): string {
  return [...text]
    .map(
      (c) =>
        table.get(c) ??
        (() => {
          throw new Unspeakable();
        })(),
    )
    .join("");
}

class Reader {
  pos = 0;
  constructor(readonly text: string) {}

  /// One argument: a `{…}` group or a single character or command.
  argument(): string {
    this.skipSpace();
    const c = this.text[this.pos];
    if (c === undefined) throw new Unspeakable();
    if (c === "{") {
      const start = ++this.pos;
      let depth = 1;
      while (this.pos < this.text.length && depth > 0) {
        if (this.text[this.pos] === "\\") this.pos++;
        else if (this.text[this.pos] === "{") depth++;
        else if (this.text[this.pos] === "}") depth--;
        this.pos++;
      }
      if (depth > 0) throw new Unspeakable();
      return convert(this.text.slice(start, this.pos - 1));
    }
    if (c === "\\") return this.command();
    this.pos++;
    return c;
  }

  command(): string {
    const name = /^\\([A-Za-z]+|.)/.exec(this.text.slice(this.pos))?.[1];
    if (name === undefined) throw new Unspeakable();
    this.pos += name.length + 1;
    if (name === "frac") {
      const top = this.argument();
      return `${wrap(top)}/${wrap(this.argument())}`;
    }
    if (name === "sqrt") return `√${wrap(this.argument())}`;
    if (name === "ce") return chemistry(this.argument());
    if (PASS_THROUGH.has(name)) return this.argument();
    if (name === "mathbb") return [...this.argument()].map(doubleStruck).join("");
    const accent = ACCENTS.get(name);
    if (accent) {
      return [...this.argument()].map((c) => (c === " " ? c : c + accent)).join("");
    }
    // A sized delimiter is the delimiter itself; `.` is none.
    if (name === "left" || name === "right" || name === "middle") {
      const delimiter = this.argument();
      return delimiter === "." ? "" : delimiter;
    }
    if (name === "phantom") return " ".repeat([...this.argument()].length);
    const symbol = SYMBOLS.get(name);
    if (symbol !== undefined) return symbol;
    const alias = ALIASES.get(`\\${name}`);
    if (alias === undefined || alias.includes("#")) throw new Unspeakable();
    return convert(alias);
  }

  skipSpace() {
    while (this.text[this.pos] === " ") this.pos++;
  }
}

/// A root or fraction part longer than one character keeps its grouping.
const wrap = (text: string) => ([...text].length > 1 ? `(${text})` : text);

/// `\ce{H2O}`: numbers after an element are subscripts, a trailing charge is a superscript.
function chemistry(formula: string): string {
  return formula
    .replace(
      /([A-Za-z)\]])(\d+)/g,
      (_, atom: string, count: string) => atom + shift(count, SUBSCRIPT),
    )
    .replace(/\^?([0-9]*[+-])$/, (_, charge: string) => shift(charge, SUPERSCRIPT))
    .replace(/->/g, "→");
}

function convert(latex: string): string {
  const reader = new Reader(latex);
  let out = "";
  while (reader.pos < latex.length) {
    const c = latex[reader.pos] ?? "";
    if (c === "\\") out += reader.command();
    else if (c === "^" || c === "_") {
      reader.pos++;
      out += shift(reader.argument(), c === "^" ? SUPERSCRIPT : SUBSCRIPT);
    } else if (c === "{") out += reader.argument();
    else if (c === "}" || c === "&") throw new Unspeakable();
    else {
      out += c;
      reader.pos++;
    }
  }
  return out;
}

export function latexToText(latex: string): string | null {
  try {
    return convert(latex.trim());
  } catch (error) {
    if (error instanceof Unspeakable) return null;
    throw error;
  }
}
