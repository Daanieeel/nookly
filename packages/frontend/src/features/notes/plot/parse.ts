import { toLatex, nameLatex, vectorLatex } from "./latex";
import { mentionsVector, sumTerms } from "./vector-sum";

/// The plot block's code: functions, constants, points, vertical lines and the window,
/// one per line, read the way a calculator would.
///
/// ```
/// f(x) = x^2 - 2        a function, named f; any parameter name works
/// y = 2x + 1            a function without a name
/// sin(x)                a bare expression in x is a function too
/// a = 3                 a constant the other lines can use; one none of them uses is
///                       drawn as a horizontal line, like a(x) = 3
/// A = (2, f(2))         a point
/// x = 4                 a vertical line
/// (0, 0) -> A           a vector between two points, written out or named
/// window: -5..5, -2..8  the window across, then up and down (optional)
/// # a comment
/// !# a = 3             works like any line, but the picture leaves it out
/// ```

export class PlotError extends Error {
  /// Already says which line it is about, so an outer line leaves it as it is.
  located = false;
}

interface PlotFunction {
  /// The line as typed, shown in the legend when LaTeX can't be.
  label: string;
  /// The line as LaTeX, shown in the legend.
  latex: string;
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
  latex: string;
  x: number;
}

interface Coordinates {
  x: number;
  y: number;
}

interface PlotVector {
  label: string;
  latex: string;
  from: Coordinates;
  to: Coordinates;
}

export interface Plot {
  functions: PlotFunction[];
  points: PlotPoint[];
  verticals: PlotVertical[];
  vectors: PlotVector[];
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

export type Expr =
  | { kind: "number"; value: number }
  | { kind: "param" }
  | { kind: "constant"; name: string }
  | { kind: "call"; name: string; args: Expr[] }
  | { kind: "binary"; op: string; left: Expr; right: Expr; implicit?: boolean }
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
        left = {
          kind: "binary",
          op: "*",
          left,
          right: this.power(),
          implicit: true,
        };
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

/// One end of a vector: a point by its name, the two coordinates written out, or the
/// origin as `0`, which is shown as typed.
type VectorEnd = { name: string } | { body: [string, string]; shown?: string };

/// One line of the code, sorted by what it says.
type Line =
  | {
      kind: "function";
      label: string;
      /// The left of the equals sign as LaTeX: `f(x)`, `y`, or nothing for a bare expression.
      head: string;
      name: string | null;
      param: string;
      body: string;
    }
  | { kind: "constant"; label: string; name: string; body: string }
  | { kind: "point"; name: string; body: [string, string] }
  | { kind: "vertical"; label: string; body: string }
  | { kind: "vector"; label: string; name: string | null; ends: [VectorEnd, VectorEnd] }
  /// Vectors added and subtracted by name, `a + b`, with the name of the result if it has one.
  | { kind: "sum"; label: string; name: string | null; body: string }
  | { kind: "window"; ranges: { axis: "x" | "y"; from: string; to: string }[] };

type VectorLine = Extract<Line, { kind: "vector" | "sum" }>;

const NAME = String.raw`[\p{L}_][\p{L}_\d]*`;
const FUNCTION_HEAD = new RegExp(String.raw`^(${NAME})\s*\(\s*(${NAME})\s*\)$`, "u");
const PLAIN_NAME = new RegExp(`^${NAME}$`, "u");
const WINDOW = /^window\s*:\s*(.+)$/;
/// The first plots set each axis on its own line, `x: -5..5`, which still reads.
const AXIS_WINDOW = /^([xy])\s*:\s*(.+)$/;
const RANGE = /^(.+?)\s*\.\.\s*(.+)$/;
const ARROW = /->|→/;
const NAMED_VECTOR = new RegExp(String.raw`^(${NAME})\s*=\s*(.+)$`, "u");

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

/// One end of the vector on `text`'s line.
function vectorEnd(text: string): VectorEnd {
  if (text === "0") return { body: ["0", "0"], shown: "0" };
  const parts = tuple(text);
  if (parts?.length === 2) return { body: [parts[0] ?? "", parts[1] ?? ""] };
  if (PLAIN_NAME.test(text)) return { name: text };
  throw new PlotError("a vector goes from one point to another");
}

/// `A -> B`, the vector from one point to another, or `a = A -> B` to name it.
function vector(label: string): Line {
  const named = NAMED_VECTOR.exec(label);
  const name = named?.[1] ?? null;
  if (name && RESERVED.has(name)) throw new PlotError(`"${name}" is a built in name`);
  const text = named?.[2] ?? label;
  const ends = text.split(new RegExp(ARROW, "g")).map((end) => end.trim());
  const [from, to] = ends;
  if (ends.length !== 2 || from === undefined || to === undefined)
    throw new PlotError("a vector goes from one point to another");
  return { kind: "vector", label, name, ends: [vectorEnd(from), vectorEnd(to)] };
}

/// `-5..5` as its two ends.
function range(axis: "x" | "y", text: string) {
  const ends = RANGE.exec(text.trim());
  if (!ends) throw new PlotError("the window is written like -10..10");
  return { axis, from: ends[1] ?? "", to: ends[2] ?? "" };
}

/// `text` split at the commas outside brackets.
function topLevelParts(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function readLine(text: string): Line {
  if (ARROW.test(text)) return vector(text);
  const window = WINDOW.exec(text);
  if (window) {
    const parts = topLevelParts(window[1] ?? "");
    if (parts.length > 2) throw new PlotError("the window is written like -10..10, -5..5");
    const axes = ["x", "y"] as const;
    return {
      kind: "window",
      ranges: parts.map((part, i) => range(axes[i] ?? "x", part)),
    };
  }
  const axisWindow = AXIS_WINDOW.exec(text);
  if (axisWindow) {
    const axis = axisWindow[1] === "y" ? "y" : "x";
    return { kind: "window", ranges: [range(axis, axisWindow[2] ?? "")] };
  }
  const equals = text.indexOf("=");
  if (equals < 0) {
    if (tuple(text)) return point("", text);
    return {
      kind: "function",
      label: text,
      head: "",
      name: null,
      param: "x",
      body: text,
    };
  }
  const head = text.slice(0, equals).trim();
  const body = text.slice(equals + 1).trim();
  const fn = FUNCTION_HEAD.exec(head);
  if (fn) {
    const [name, param] = [fn[1] ?? "", fn[2] ?? "x"];
    const shown = `${nameLatex(name)}(${nameLatex(param)})`;
    return { kind: "function", label: text, head: shown, name, param, body };
  }
  if (head === "y") {
    return {
      kind: "function",
      label: text,
      head: "y",
      name: null,
      param: "x",
      body,
    };
  }
  if (head === "x") return { kind: "vertical", label: text, body };
  if (!PLAIN_NAME.test(head)) throw new PlotError(`"${head}" can't be given a value`);
  if (RESERVED.has(head)) throw new PlotError(`"${head}" is a built in name`);
  if (body.startsWith("(") && tuple(body)) return point(head, body);
  return { kind: "constant", label: text, name: head, body };
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
  /// The lines that start with `!#`: they work, but the picture leaves them out.
  const hidden = new Set<number>();
  source.split("\n").forEach((raw, i) => {
    const trimmed = raw.trim();
    const quiet = trimmed.startsWith("!#");
    const text = ((quiet ? trimmed.slice(2) : trimmed).split("#")[0] ?? "").trim();
    if (!text) return;
    if (quiet) hidden.add(i + 1);
    lines.push({ line: i + 1, parsed: onLine(i + 1, () => readLine(text)) });
  });

  // A constant or a bare line that uses a vector's name adds vectors up, and a named one
  // is a vector too, which a later line may use.
  const vectorNames = new Set<string>();
  for (const { parsed } of lines) {
    if (parsed.kind === "vector" && parsed.name) vectorNames.add(parsed.name);
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const entry of lines) {
      const { parsed } = entry;
      if (parsed.kind === "constant" && mentionsVector(parsed.body, vectorNames)) {
        entry.parsed = { kind: "sum", label: parsed.label, name: parsed.name, body: parsed.body };
        vectorNames.add(parsed.name);
        changed = true;
      } else if (
        parsed.kind === "function" &&
        parsed.name === null &&
        parsed.head === "" &&
        mentionsVector(parsed.body, vectorNames)
      ) {
        entry.parsed = { kind: "sum", label: parsed.label, name: null, body: parsed.body };
        changed = true;
      }
    }
  }

  // Names first, so a line can use one defined further down.
  const functions = new Map<string, { line: number; param: string; body: string }>();
  const constants = new Map<string, { line: number; label: string; body: string }>();
  const vectors = new Map<string, { line: number; parsed: VectorLine }>();
  for (const { line, parsed } of lines) {
    if (parsed.kind === "point" || !("name" in parsed) || parsed.name === null) continue;
    const name = parsed.name;
    if (functions.has(name) || constants.has(name) || vectors.has(name))
      throw lineError(line, `"${name}" is defined twice`);
    if (parsed.kind === "function")
      functions.set(name, { line, param: parsed.param, body: parsed.body });
    else if (parsed.kind === "constant")
      constants.set(name, { line, label: parsed.label, body: parsed.body });
    else vectors.set(name, { line, parsed });
  }

  const compiledFunctions = new Map<string, (x: number) => number>();
  const constantValues = new Map<string, number>();
  const visiting = new Set<string>();

  const enter = (name: string, line: number) => {
    if (visiting.has(name)) throw lineError(line, `"${name}" depends on itself`);
    visiting.add(name);
  };

  const parseExpr = (body: string, param: string | null): Expr => {
    const known = new Set([...BUILT_IN, ...functions.keys(), ...constants.keys()]);
    if (param) known.add(param);
    const isFunction = (name: string) => UNARY.has(name) || BINARY.has(name) || functions.has(name);
    return new Parser(tokenize(body, known), param, isFunction).parse();
  };

  const compile = (body: string, param: string | null): ((x: number) => number) =>
    toClosure(parseExpr(body, param));

  /// The body as LaTeX. It parsed already when compiled, so this does not throw.
  const latexOf = (body: string, param: string | null): string =>
    toLatex(parseExpr(body, param), param ?? "x");

  /// Constants some line reads, which are numbers and not lines of their own.
  const used = new Set<string>();

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
        used.add(expr.name);
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

  const plot: Plot = {
    functions: [],
    points: [],
    verticals: [],
    vectors: [],
    window: {},
  };
  /// The functions with the line they were written on, to put a constant's line among them.
  const drawn: { line: number; fn: PlotFunction }[] = [];
  /// Every point, shown or not, for a vector to end at.
  const points: PlotPoint[] = [];
  for (const { line, parsed } of lines) {
    switch (parsed.kind) {
      case "function": {
        const at = parsed.name
          ? userFunction(parsed.name)
          : onLine(line, () => compile(parsed.body, "x"));
        const body = onLine(line, () => latexOf(parsed.body, parsed.param));
        const latex = parsed.head ? `${parsed.head} = ${body}` : body;
        if (!hidden.has(line)) drawn.push({ line, fn: { label: parsed.label, latex, at } });
        break;
      }
      case "constant":
        constant(parsed.name);
        break;
      case "point": {
        const at = {
          name: parsed.name,
          x: value(parsed.body[0], line),
          y: value(parsed.body[1], line),
        };
        points.push(at);
        if (!hidden.has(line)) plot.points.push(at);
        break;
      }
      case "vertical": {
        const vertical = {
          label: parsed.label,
          latex: `x = ${onLine(line, () => latexOf(parsed.body, null))}`,
          x: value(parsed.body, line),
        };
        if (!hidden.has(line)) plot.verticals.push(vertical);
        break;
      }
      case "window":
        for (const { axis, from, to } of parsed.ranges) {
          const ends: [number, number] = [value(from, line), value(to, line)];
          if (!(ends[0] < ends[1])) {
            throw lineError(line, "the window must go from smaller to larger");
          }
          plot.window[axis] = ends;
        }
        break;
    }
  }

  // Points are all known now, so a vector can end at one defined further down.
  const named = new Map(points.filter((p) => p.name).map((p) => [p.name, p]));
  const end = (at: VectorEnd, line: number): Coordinates & { latex: string } => {
    if ("body" in at) {
      const [x, y] = at.body;
      const latex =
        at.shown ?? onLine(line, () => `\\left(${latexOf(x, null)}, ${latexOf(y, null)}\\right)`);
      return { x: value(x, line), y: value(y, line), latex };
    }
    const found = named.get(at.name);
    if (found) return { x: found.x, y: found.y, latex: nameLatex(at.name) };
    const message = constants.has(at.name)
      ? `"${at.name}" is not a point`
      : `unknown point "${at.name}"`;
    throw lineError(line, message);
  };

  /// A vector drawn: where it starts and ends, and how the legend writes it.
  interface Arrow {
    from: Coordinates;
    to: Coordinates;
    latex: string;
  }

  const arrows = new Map<string, Arrow>();

  const arrowOf = (parsed: VectorLine, line: number): Arrow => {
    const title = parsed.name ? `${vectorLatex(parsed.name)} = ` : "";
    if (parsed.kind === "vector") {
      const [from, to] = [end(parsed.ends[0], line), end(parsed.ends[1], line)];
      return {
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: to.y },
        latex: `${title}${from.latex} \\to ${to.latex}`,
      };
    }
    // The sum starts where its first vector does.
    const terms = sumTerms(parsed.body);
    if (!terms) throw lineError(line, "a sum of vectors is written like a + b - c");
    let start: Coordinates = { x: 0, y: 0 };
    const total = { x: 0, y: 0 };
    let latex = "";
    terms.forEach(({ sign, name }, i) => {
      const arrow = vectorNamed(name, line);
      if (i === 0) start = arrow.from;
      total.x += sign * (arrow.to.x - arrow.from.x);
      total.y += sign * (arrow.to.y - arrow.from.y);
      const joiner = sign < 0 ? (i === 0 ? "-" : " - ") : i === 0 ? "" : " + ";
      latex += `${joiner}${vectorLatex(name)}`;
    });
    return {
      from: start,
      to: { x: start.x + total.x, y: start.y + total.y },
      latex: `${title}${latex}`,
    };
  };

  const vectorNamed = (name: string, line: number): Arrow => {
    const done = arrows.get(name);
    if (done) return done;
    const def = vectors.get(name);
    if (!def) throw lineError(line, `unknown vector "${name}"`);
    enter(name, def.line);
    const arrow = arrowOf(def.parsed, def.line);
    visiting.delete(name);
    arrows.set(name, arrow);
    return arrow;
  };

  for (const { line, parsed } of lines) {
    if (parsed.kind !== "vector" && parsed.kind !== "sum") continue;
    const arrow = parsed.name ? vectorNamed(parsed.name, line) : arrowOf(parsed, line);
    if (!hidden.has(line)) plot.vectors.push({ label: parsed.label, ...arrow });
  }

  // Every line has been read, so what no line uses is known: those constants are lines.
  for (const [name, def] of constants) {
    if (used.has(name) || hidden.has(def.line)) continue;
    const y = constant(name);
    const latex = `${nameLatex(name)} = ${onLine(def.line, () => latexOf(def.body, null))}`;
    drawn.push({
      line: def.line,
      fn: { label: def.label, latex, at: () => y },
    });
  }
  plot.functions.push(...drawn.sort((a, b) => a.line - b.line).map(({ fn }) => fn));
  return plot;
}
