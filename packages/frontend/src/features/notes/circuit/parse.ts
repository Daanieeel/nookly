/// The circuit block's text format, read into a graph of gates:
///
///     x = A & B
///     Y = x | !C
///     A ^ B
///
/// A line is `name = expression`, or a bare expression for an output that is
/// labelled with its formula. A name that is never assigned is an input, a name
/// nobody else uses is an output, and any other assigned name is a wire between
/// gates. Operators from loosest to tightest: `|` `∨` OR, `^` `⊕` XOR, `&` `∧` AND,
/// then `!` `~` `¬` NOT, plus the NAND, NOR and XNOR keywords.

export type GateOp = "AND" | "OR" | "XOR" | "NAND" | "NOR" | "XNOR" | "NOT";
type BinaryOp = Exclude<GateOp, "NOT">;

export interface InputNode {
  kind: "input";
  id: number;
  name: string;
}

/// One input pin of a gate. `negated` is the small circle drawn on the pin, which
/// is only ever used for a plain input signal; every other negation is a NOT gate.
export interface Pin {
  from: Source;
  negated: boolean;
}

export interface GateNode {
  kind: "gate";
  id: number;
  op: GateOp;
  inputs: Pin[];
  /// The name a line gave this gate's output, shown on the wire between gates.
  name?: string;
}

export type Source = InputNode | GateNode;

export interface Output {
  id: number;
  /// `null` for a bare expression, which is labelled with its formula instead.
  name: string | null;
  source: Source;
}

export interface Circuit {
  inputs: InputNode[];
  gates: GateNode[];
  outputs: Output[];
}

export class CircuitError extends Error {
  constructor(message: string, line = 0) {
    super(line > 0 ? `Line ${line}: ${message}` : message);
  }
}

type TokenKind =
  | { type: "name"; value: string }
  | { type: "binary"; value: BinaryOp }
  | { type: "not" }
  | { type: "open" }
  | { type: "close" }
  | { type: "equals" };
/// `raw` is what the line said, for error messages.
type Token = TokenKind & { raw: string };

const SYMBOLS = new Map<string, TokenKind>([
  ["&&", { type: "binary", value: "AND" }],
  ["&", { type: "binary", value: "AND" }],
  ["∧", { type: "binary", value: "AND" }],
  ["||", { type: "binary", value: "OR" }],
  ["|", { type: "binary", value: "OR" }],
  ["∨", { type: "binary", value: "OR" }],
  ["^", { type: "binary", value: "XOR" }],
  ["⊕", { type: "binary", value: "XOR" }],
  ["!", { type: "not" }],
  ["~", { type: "not" }],
  ["¬", { type: "not" }],
  ["(", { type: "open" }],
  [")", { type: "close" }],
  ["=", { type: "equals" }],
]);

const KEYWORDS = new Map<string, TokenKind>([
  ["and", { type: "binary", value: "AND" }],
  ["or", { type: "binary", value: "OR" }],
  ["xor", { type: "binary", value: "XOR" }],
  ["nand", { type: "binary", value: "NAND" }],
  ["nor", { type: "binary", value: "NOR" }],
  ["xnor", { type: "binary", value: "XNOR" }],
  ["not", { type: "not" }],
]);

const TOKEN = /\s*(?:(&&|\|\||[&|^!~¬∧∨⊕()=])|([\p{L}_][\p{L}\p{N}_]*|\d+))/uy;

function tokenize(text: string, line: number): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  for (;;) {
    TOKEN.lastIndex = at;
    const match = TOKEN.exec(text);
    if (!match) break;
    at = TOKEN.lastIndex;
    const [, symbol, word] = match;
    const raw = symbol ?? word ?? "";
    const kind = (symbol ? SYMBOLS.get(symbol) : KEYWORDS.get(raw.toLowerCase())) ?? {
      type: "name" as const,
      value: raw,
    };
    tokens.push({ ...kind, raw });
  }
  const rest = text.slice(at).trim();
  if (rest) throw new CircuitError(`unexpected "${rest[0]}"`, line);
  return tokens;
}

type Ast =
  | { t: "name"; name: string }
  | { t: "not"; x: Ast }
  | { t: "op"; op: BinaryOp; args: Ast[] };

/// Loosest first.
const LEVELS: BinaryOp[][] = [
  ["OR", "NOR"],
  ["XOR", "XNOR"],
  ["AND", "NAND"],
];
const CHAINS = new Set<BinaryOp>(["AND", "OR", "XOR"]);

function describe(token: Token | undefined): string {
  return token ? `"${token.raw}"` : "the end of the line";
}

class Parser {
  private at = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly line: number,
  ) {}

  /// The whole line as one expression.
  finish(): Ast {
    const ast = this.level(0);
    const extra = this.tokens[this.at];
    if (extra) throw new CircuitError(`unexpected ${describe(extra)}`, this.line);
    return ast;
  }

  private level(depth: number): Ast {
    const operators = LEVELS[depth];
    if (!operators) return this.unary();
    let left = this.level(depth + 1);
    // Whether `left` is a gate this loop made, which a following equal operator
    // extends (A & B & C is one gate). A parenthesized gate is never extended.
    let chained = false;
    for (;;) {
      const token = this.tokens[this.at];
      if (token?.type !== "binary" || !operators.includes(token.value)) return left;
      this.at++;
      const right = this.level(depth + 1);
      if (chained && left.t === "op" && left.op === token.value) {
        left.args.push(right);
      } else {
        left = { t: "op", op: token.value, args: [left, right] };
        chained = CHAINS.has(token.value);
      }
    }
  }

  private unary(): Ast {
    const token = this.tokens[this.at];
    if (token?.type === "not") {
      this.at++;
      return { t: "not", x: this.unary() };
    }
    if (token?.type === "open") {
      this.at++;
      const inner = this.level(0);
      const close = this.tokens[this.at];
      if (close?.type !== "close") {
        throw new CircuitError(`expected ")" but found ${describe(close)}`, this.line);
      }
      this.at++;
      return inner;
    }
    if (token?.type === "name") {
      this.at++;
      return { t: "name", name: token.value };
    }
    throw new CircuitError(`expected a signal name or "(" but found ${describe(token)}`, this.line);
  }
}

interface Definition {
  name: string | null;
  ast: Ast;
  line: number;
}

function definitions(source: string): Definition[] {
  const defs: Definition[] = [];
  source.split("\n").forEach((raw, index) => {
    const line = index + 1;
    const text = raw.replace(/(#|\/\/).*/, "");
    const tokens = tokenize(text, line);
    if (tokens.length === 0) return;
    const [first, second] = tokens;
    const named = first?.type === "name" && second?.type === "equals";
    const parser = new Parser(named ? tokens.slice(2) : tokens, line);
    defs.push({ name: named ? first.value : null, ast: parser.finish(), line });
  });
  return defs;
}

function referencedNames(ast: Ast, into: Set<string>) {
  if (ast.t === "name") into.add(ast.name);
  else if (ast.t === "not") referencedNames(ast.x, into);
  else for (const arg of ast.args) referencedNames(arg, into);
}

/// A signal on its way to somewhere: `negated` is the not yet drawn bubble.
interface Ref {
  node: Source;
  negated: boolean;
}

export function parseCircuit(source: string): Circuit {
  const defs = definitions(source);
  if (defs.length === 0) throw new CircuitError("Nothing to draw yet");

  const byName = new Map<string, Definition>();
  for (const def of defs) {
    if (def.name === null) continue;
    if (byName.has(def.name)) throw new CircuitError(`"${def.name}" is defined twice`, def.line);
    byName.set(def.name, def);
  }

  let nextId = 0;
  const inputs = new Map<string, InputNode>();
  const gates: GateNode[] = [];
  const inverters = new Map<Source, GateNode>();
  const resolved = new Map<Definition, Ref>();
  const resolving: Definition[] = [];

  const input = (name: string): InputNode => {
    let node = inputs.get(name);
    if (!node) {
      node = { kind: "input", id: nextId++, name };
      inputs.set(name, node);
    }
    return node;
  };

  const gate = (op: GateOp, pins: Pin[]): GateNode => {
    const node: GateNode = { kind: "gate", id: nextId++, op, inputs: pins };
    gates.push(node);
    return node;
  };

  /// A NOT gate on `from`, shared by everything that negates the same signal.
  const inverter = (from: Source): GateNode => {
    let node = inverters.get(from);
    if (!node) {
      node = gate("NOT", [{ from, negated: false }]);
      inverters.set(from, node);
    }
    return node;
  };

  const solid = (ref: Ref): Source => (ref.negated ? inverter(ref.node) : ref.node);

  const build = (ast: Ast): Ref => {
    if (ast.t === "name") {
      const def = byName.get(ast.name);
      return def ? resolve(def) : { node: input(ast.name), negated: false };
    }
    if (ast.t === "not") {
      const inner = build(ast.x);
      // A bubble on the pin takes the place of an inverter, but only for an input.
      if (inner.node.kind === "input") return { node: inner.node, negated: !inner.negated };
      return { node: inverter(solid(inner)), negated: false };
    }
    const pins = ast.args.map((arg): Pin => {
      const ref = build(arg);
      return { from: ref.node, negated: ref.negated };
    });
    return { node: gate(ast.op, pins), negated: false };
  };

  const resolve = (def: Definition): Ref => {
    const done = resolved.get(def);
    if (done) return done;
    const at = resolving.indexOf(def);
    if (at >= 0) {
      const path = [...resolving.slice(at), def].map((d) => d.name);
      throw new CircuitError(`loop ${path.join(" → ")}`, def.line);
    }
    resolving.push(def);
    const ref = build(def.ast);
    resolving.pop();
    if (def.name !== null && !ref.negated && ref.node.kind === "gate") {
      ref.node.name ??= def.name;
    }
    resolved.set(def, ref);
    return ref;
  };

  // Everything resolves first, so a loop is found even when no line is an output.
  for (const def of defs) resolve(def);

  const used = new Set<string>();
  for (const def of defs) referencedNames(def.ast, used);

  const outputs: Output[] = [];
  for (const def of defs) {
    if (def.name !== null && used.has(def.name)) continue;
    // SAFETY: every definition was resolved above.
    const node = solid(resolved.get(def) as Ref);
    // The output carries the name itself, so the wire needn't repeat it.
    if (node.kind === "gate" && node.name === def.name) delete node.name;
    outputs.push({ id: nextId++, name: def.name, source: node });
  }

  return { inputs: [...inputs.values()], gates, outputs };
}
