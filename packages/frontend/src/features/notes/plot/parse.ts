/// The plot block's code: functions, constants, points, vertical lines and the window,
/// one per line, read the way a calculator would.
///
/// ```
/// f(x) = x^2 - 2        a function, named f; any parameter name works
/// y = 2x + 1            a function without a name
/// sin(x)                a bare expression in x is a function too
/// a = 3                 a constant the other lines can use
/// A = (2, f(2))         a point
/// x = 4                 a vertical line
/// x: -5..5              the window (each axis optional)
/// # a comment
/// ```

export class PlotError extends Error {
  /// Already says which line it is about, so an outer line leaves it as it is.
  located = false;
}

interface PlotFunction {
  /// The line as typed, shown in the legend.
  label: string;
  /// The value at `x`: NaN outside the domain, ±Infinity at a pole.
  at: (x: number) => number;
}

interface PlotPoint {
  name: string;
  x: number;
  y: number;
}

interface PlotVertical {
  label: string;
  x: number;
}

export interface Plot {
  functions: PlotFunction[];
  points: PlotPoint[];
  verticals: PlotVertical[];
  window: { x?: [number, number]; y?: [number, number] };
}

const UNARY = new Map<string, (v: number) => number>([
  ["sin", Math.sin],
  ["cos", Math.cos],
  ["tan", Math.tan],
  ["asin", Math.asin],
  ["acos", Math.acos],
  ["atan", Math.atan],
  ["sinh", Math.sinh],
  ["cosh", Math.cosh],
  ["tanh", Math.tanh],
  ["sqrt", Math.sqrt],
  ["cbrt", Math.cbrt],
  ["abs", Math.abs],
  ["ln", Math.log],
  ["log", Math.log10],
  ["exp", Math.exp],
  ["floor", Math.floor],
  ["ceil", Math.ceil],
  ["round", Math.round],
  ["sign", Math.sign],
]);

const BINARY = new Map<string, (a: number, b: number) => number>([
  ["min", Math.min],
  ["max", Math.max],
]);

const CONSTANTS = new Map([
  ["pi", Math.PI],
  ["π", Math.PI],
  ["e", Math.E],
]);

/// Every name the app knows before the code defines any.
const BUILT_IN = [...UNARY.keys(), ...BINARY.keys(), ...CONSTANTS.keys()];

const RESERVED = new Set(["x", "y", ...BUILT_IN]);

type Token =
  | { kind: "number"; value: number }
  | { kind: "name"; name: string }
  | { kind: "op"; op: string };

type Expr =
  | { kind: "number"; value: number }
  | { kind: "param" }
  | { kind: "constant"; name: string }
  | { kind: "call"; name: string; args: Expr[] }
  | { kind: "binary"; op: string; left: Expr; right: Expr }
  | { kind: "negate"; operand: Expr };

const BINARY_OPS = new Map<string, (a: number, b: number) => number>([
  ["+", (a, b) => a + b],
  ["-", (a, b) => a - b],
  ["*", (a, b) => a * b],
  ["/", (a, b) => a / b],
  ["^", (a, b) => a ** b],
]);

/// Typographic operators, read as the plain ones.
const SYMBOLS = new Map([
  ["−", "-"],
  ["·", "*"],
  ["×", "*"],
  ["÷", "/"],
]);

/// Splits `text` into tokens. A run of letters is read as the longest names it starts
/// with, so `2pix` is 2, pi and x.
function tokenize(text: string, known: Set<string>): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const c = SYMBOLS.get(text[i] ?? "") ?? text[i] ?? "";
    if (/\s/.test(c)) {
      i++;
    } else if (/[\d.]/.test(c)) {
      const match = /^\d*\.?\d+(?:e[+-]?\d+)?|^\d+\.?/i.exec(text.slice(i))?.[0] ?? c;
      const value = Number(match);
      if (Number.isNaN(value)) throw new PlotError(`"${match}" is not a number`);
      tokens.push({ kind: "number", value });
      i += match.length;
    } else if (/[\p{L}_]/u.test(c)) {
      const run = /^[\p{L}_\d]+/u.exec(text.slice(i))?.[0] ?? c;
      let rest = run;
      while (rest) {
        const name = longestKnownPrefix(rest, known);
        if (!name) throw new PlotError(`unknown name "${rest}"`);
        tokens.push({ kind: "name", name });
        rest = rest.slice(name.length);
        // Digits after a name multiply it: `x2` is x times 2.
        const digits = /^\d+/.exec(rest)?.[0];
        if (digits) {
          tokens.push({ kind: "op", op: "*" }, { kind: "number", value: Number(digits) });
          rest = rest.slice(digits.length);
        }
      }
      i += run.length;
    } else if ("+-*/^(),".includes(c)) {
      tokens.push({ kind: "op", op: c });
      i++;
    } else {
      throw new PlotError(`"${c}" can't be used here`);
    }
  }
  return tokens;
}

function longestKnownPrefix(run: string, known: Set<string>): string | null {
  for (let end = run.length; end > 0; end--) {
    const candidate = run.slice(0, end);
    if (known.has(candidate)) return candidate;
  }
  return null;
}

/// A recursive descent parser over one expression, with implicit multiplication:
/// `2x`, `3sin(x)` and `(x + 1)(x - 1)`.
class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly param: string | null,
    private readonly isFunction: (name: string) => boolean,
  ) {}

  parse(): Expr {
    const expr = this.sum();
    const extra = this.tokens[this.pos];
    if (extra) throw new PlotError(`unexpected "${tokenText(extra)}"`);
    return expr;
  }

  private peekOp(): string | null {
    const token = this.tokens[this.pos];
    return token?.kind === "op" ? token.op : null;
  }

  private sum(): Expr {
    let left = this.product();
    for (let op = this.peekOp(); op === "+" || op === "-"; op = this.peekOp()) {
      this.pos++;
      left = { kind: "binary", op, left, right: this.product() };
    }
    return left;
  }

  private product(): Expr {
    let left = this.unary();
    for (;;) {
      const op = this.peekOp();
      if (op === "*" || op === "/") {
        this.pos++;
        left = { kind: "binary", op, left, right: this.unary() };
      } else if (this.startsOperand()) {
        left = { kind: "binary", op: "*", left, right: this.power() };
      } else {
        return left;
      }
    }
  }

  /// Whether the next token begins a value, which then multiplies the one before it.
  private startsOperand(): boolean {
    const token = this.tokens[this.pos];
    return token !== undefined && (token.kind !== "op" || token.op === "(");
  }

  private unary(): Expr {
    const op = this.peekOp();
    if (op === "-" || op === "+") {
      this.pos++;
      const operand = this.unary();
      return op === "-" ? { kind: "negate", operand } : operand;
    }
    return this.power();
  }

  private power(): Expr {
    const base = this.primary();
    if (this.peekOp() !== "^") return base;
    this.pos++;
    // Right associative, and `2^-x` is allowed.
    return { kind: "binary", op: "^", left: base, right: this.unary() };
  }

  private primary(): Expr {
    const token = this.tokens[this.pos++];
    if (!token) throw new PlotError("the expression ends too early");
    if (token.kind === "number") return { kind: "number", value: token.value };
    if (token.kind === "name") {
      if (token.name === this.param) return { kind: "param" };
      if (!this.isFunction(token.name)) return { kind: "constant", name: token.name };
      if (this.peekOp() !== "(") throw new PlotError(`write "${token.name}(...)" with brackets`);
      this.pos++;
      return { kind: "call", name: token.name, args: this.arguments() };
    }
    if (token.op === "(") {
      const inner = this.sum();
      this.close();
      return inner;
    }
    throw new PlotError(`unexpected "${token.op}"`);
  }

  private arguments(): Expr[] {
    const args = [this.sum()];
    while (this.peekOp() === ",") {
      this.pos++;
      args.push(this.sum());
    }
    this.close();
    return args;
  }

  private close() {
    if (this.peekOp() !== ")") {
      if (this.pos >= this.tokens.length) throw new PlotError('a "(" is never closed');
      throw new PlotError(`unexpected "${tokenText(this.tokens[this.pos])}"`);
    }
    this.pos++;
  }
}

function tokenText(token: Token | undefined): string {
  if (!token) return "";
  if (token.kind === "number") return String(token.value);
  return token.kind === "name" ? token.name : token.op;
}

/// One line of the code, sorted by what it says.
type Line =
  | { kind: "function"; label: string; name: string | null; param: string; body: string }
  | { kind: "constant"; name: string; body: string }
  | { kind: "point"; name: string; body: [string, string] }
  | { kind: "vertical"; label: string; body: string }
  | { kind: "window"; axis: "x" | "y"; from: string; to: string };

const NAME = String.raw`[\p{L}_][\p{L}_\d]*`;
const FUNCTION_HEAD = new RegExp(String.raw`^(${NAME})\s*\(\s*(${NAME})\s*\)$`, "u");
const PLAIN_NAME = new RegExp(`^${NAME}$`, "u");
const WINDOW = /^([xy])\s*:\s*(.+?)\s*\.\.\s*(.+)$/;

/// `(a, b)` as its two parts, `null` when `text` is not one bracket around a list.
function tuple(text: string): string[] | null {
  if (!text.startsWith("(") || !text.endsWith(")")) return null;
  const parts: string[] = [];
  let depth = 0;
  let start = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    // The first bracket closes before the end: `(x + 1)(x - 1)`.
    if (depth === 0 && i < text.length - 1) return null;
    if (c === "," && depth === 1) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start, -1));
  return parts.length > 1 ? parts.map((p) => p.trim()) : null;
}

function point(name: string, body: string): Line {
  const parts = tuple(body);
  if (parts?.length !== 2) throw new PlotError("a point has two coordinates");
  return { kind: "point", name, body: [parts[0] ?? "", parts[1] ?? ""] };
}

function readLine(text: string): Line {
  const window = WINDOW.exec(text);
  if (window) {
    const axis = window[1] === "y" ? "y" : "x";
    return { kind: "window", axis, from: window[2] ?? "", to: window[3] ?? "" };
  }
  const equals = text.indexOf("=");
  if (equals < 0) {
    if (tuple(text)) return point("", text);
    return { kind: "function", label: text, name: null, param: "x", body: text };
  }
  const head = text.slice(0, equals).trim();
  const body = text.slice(equals + 1).trim();
  const fn = FUNCTION_HEAD.exec(head);
  if (fn) return { kind: "function", label: text, name: fn[1] ?? "", param: fn[2] ?? "x", body };
  if (head === "y") return { kind: "function", label: text, name: null, param: "x", body };
  if (head === "x") return { kind: "vertical", label: text, body };
  if (!PLAIN_NAME.test(head)) throw new PlotError(`"${head}" can't be given a value`);
  if (RESERVED.has(head)) throw new PlotError(`"${head}" is a built in name`);
  if (body.startsWith("(") && tuple(body)) return point(head, body);
  return { kind: "constant", name: head, body };
}

/// An error about `line`, with the line number in front.
function lineError(line: number, message: string): PlotError {
  const error = new PlotError(`Line ${line}: ${message}`);
  error.located = true;
  return error;
}

/// What `read` gives, with the line number put in front of an error it throws.
function onLine<T>(line: number, read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (!(error instanceof PlotError) || error.located) throw error;
    throw lineError(line, error.message);
  }
}

export function parsePlot(source: string): Plot {
  const lines: { line: number; parsed: Line }[] = [];
  source.split("\n").forEach((raw, i) => {
    const text = (raw.split("#")[0] ?? "").trim();
    if (!text) return;
    lines.push({ line: i + 1, parsed: onLine(i + 1, () => readLine(text)) });
  });

  // Names first, so a line can use one defined further down.
  const functions = new Map<string, { line: number; param: string; body: string }>();
  const constants = new Map<string, { line: number; body: string }>();
  for (const { line, parsed } of lines) {
    if (parsed.kind !== "function" && parsed.kind !== "constant") continue;
    const name = parsed.name;
    if (name === null) continue;
    if (functions.has(name) || constants.has(name))
      throw lineError(line, `"${name}" is defined twice`);
    if (parsed.kind === "function")
      functions.set(name, { line, param: parsed.param, body: parsed.body });
    else constants.set(name, { line, body: parsed.body });
  }

  const compiledFunctions = new Map<string, (x: number) => number>();
  const constantValues = new Map<string, number>();
  const visiting = new Set<string>();

  const enter = (name: string, line: number) => {
    if (visiting.has(name)) throw lineError(line, `"${name}" depends on itself`);
    visiting.add(name);
  };

  const compile = (body: string, param: string | null): ((x: number) => number) => {
    const known = new Set([...BUILT_IN, ...functions.keys(), ...constants.keys()]);
    if (param) known.add(param);
    const isFunction = (name: string) => UNARY.has(name) || BINARY.has(name) || functions.has(name);
    return toClosure(new Parser(tokenize(body, known), param, isFunction).parse());
  };

  const userFunction = (name: string): ((x: number) => number) => {
    const done = compiledFunctions.get(name);
    if (done) return done;
    const def = functions.get(name);
    if (!def) throw new PlotError(`unknown name "${name}"`);
    enter(name, def.line);
    const fn = onLine(def.line, () => compile(def.body, def.param));
    visiting.delete(name);
    compiledFunctions.set(name, fn);
    return fn;
  };

  const constant = (name: string): number => {
    const known = CONSTANTS.get(name) ?? constantValues.get(name);
    if (known !== undefined) return known;
    const def = constants.get(name);
    if (!def) throw new PlotError(`unknown name "${name}"`);
    enter(name, def.line);
    const value = onLine(def.line, () => compile(def.body, null)(Number.NaN));
    visiting.delete(name);
    constantValues.set(name, value);
    return value;
  };

  /// The expression as a function of its parameter. Names resolve now, so a missing
  /// one or a loop is found while reading, not while drawing.
  function toClosure(expr: Expr): (x: number) => number {
    switch (expr.kind) {
      case "number":
        return () => expr.value;
      case "param":
        return (x) => x;
      case "constant": {
        const value = constant(expr.name);
        return () => value;
      }
      case "negate": {
        const operand = toClosure(expr.operand);
        return (x) => -operand(x);
      }
      case "binary": {
        const left = toClosure(expr.left);
        const right = toClosure(expr.right);
        const apply = BINARY_OPS.get(expr.op) ?? (() => Number.NaN);
        return (x) => apply(left(x), right(x));
      }
      case "call":
        return callClosure(expr.name, expr.args.map(toClosure));
    }
  }

  function callClosure(name: string, args: ((x: number) => number)[]): (x: number) => number {
    const unary = UNARY.get(name);
    const binary = BINARY.get(name);
    if (binary) {
      const [a, b] = args;
      if (args.length !== 2 || !a || !b) throw new PlotError(`"${name}" takes two values`);
      return (x) => binary(a(x), b(x));
    }
    const [arg] = args;
    if (args.length !== 1 || !arg) throw new PlotError(`"${name}" takes one value`);
    const fn = unary ?? userFunction(name);
    return (x) => fn(arg(x));
  }

  const value = (body: string, line: number): number =>
    onLine(line, () => compile(body, null)(Number.NaN));

  const plot: Plot = { functions: [], points: [], verticals: [], window: {} };
  for (const { line, parsed } of lines) {
    switch (parsed.kind) {
      case "function": {
        const at = parsed.name
          ? userFunction(parsed.name)
          : onLine(line, () => compile(parsed.body, "x"));
        plot.functions.push({ label: parsed.label, at });
        break;
      }
      case "constant":
        constant(parsed.name);
        break;
      case "point":
        plot.points.push({
          name: parsed.name,
          x: value(parsed.body[0], line),
          y: value(parsed.body[1], line),
        });
        break;
      case "vertical":
        plot.verticals.push({ label: parsed.label, x: value(parsed.body, line) });
        break;
      case "window": {
        const range: [number, number] = [value(parsed.from, line), value(parsed.to, line)];
        if (!(range[0] < range[1])) {
          throw lineError(line, "the window must go from smaller to larger");
        }
        plot.window[parsed.axis] = range;
        break;
      }
    }
  }
  return plot;
}
