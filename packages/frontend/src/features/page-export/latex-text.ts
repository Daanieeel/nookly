/// Simple inline TeX as plain Unicode text, for the one place a formula can't be a picture:
/// a line of text in the PDF. `E = mc^2` reads `E = mc²`, `\ce{H2O}` reads `H₂O`. Anything
/// this can't spell out exactly returns null, and the TeX itself is shown instead.

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
    quad: " ",
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
    T: "ᵀ",
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
    if (["text", "mathrm", "mathit", "mathbf", "operatorname"].includes(name))
      return this.argument();
    const symbol = SYMBOLS.get(name);
    if (symbol === undefined) throw new Unspeakable();
    return symbol;
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
