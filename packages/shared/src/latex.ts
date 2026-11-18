/// The custom LaTeX commands from Settings, read as KaTeX `macros`: `\newcommand` and
/// friends, one definition after the other. A definition that does not parse is reported
/// with its line and left out, so one typo never breaks the others or any math block.

export interface MacroError {
  /// Line of the definition's first character, from 1.
  line: number;
  message: string;
}

export interface ParsedMacros {
  /// KaTeX macros: `\name` to its expansion, `#1` for arguments.
  macros: Record<string, string>;
  errors: MacroError[];
}

const DEFINERS = ["newcommand", "renewcommand", "providecommand", "DeclareMathOperator", "def"];
const NAME = /^\\([A-Za-z]+)/;

/// A reader over the setting's text with its position.
class Source {
  pos = 0;
  constructor(readonly text: string) {}

  get done() {
    return this.pos >= this.text.length;
  }
  peek(length = 1) {
    return this.text.slice(this.pos, this.pos + length);
  }
  lineAt(pos: number) {
    return this.text.slice(0, pos).split("\n").length;
  }
  skipSpace() {
    for (;;) {
      while (/\s/.test(this.peek()) && !this.done) this.pos++;
      if (this.peek() !== "%") return;
      while (!this.done && this.peek() !== "\n") this.pos++;
    }
  }
  /// The text of a balanced `{...}` group, without its braces, or `null` when it is not closed.
  group(): string | null {
    if (this.peek() !== "{") return null;
    let depth = 0;
    const start = this.pos + 1;
    for (let i = this.pos; i < this.text.length; i++) {
      const char = this.text[i];
      if (char === "\\") i++;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        this.pos = i + 1;
        return this.text.slice(start, i);
      }
    }
    return null;
  }
  /// Skips to the end of the line, to carry on after a definition that failed.
  skipLine() {
    while (!this.done && this.peek() !== "\n") this.pos++;
  }
}

class DefinitionError extends Error {}

/// One macro name, as `{\name}` or `\name`.
function readName(source: Source, braced: boolean): string {
  source.skipSpace();
  let text: string;
  if (braced && source.peek() === "{") {
    const inner = source.group();
    if (inner === null) throw new DefinitionError("The name is missing its closing brace.");
    text = inner.trim();
  } else {
    const match = NAME.exec(source.text.slice(source.pos));
    text = match?.[0] ?? "";
    source.pos += text.length;
  }
  if (!NAME.test(text) || NAME.exec(text)?.[0] !== text) {
    throw new DefinitionError("A command name is a backslash and letters, like \\N.");
  }
  return text;
}

/// The highest `#n` a body uses: how many arguments the command takes.
export function macroArgumentCount(body: string): number {
  const used = [...body.replaceAll("##", "").matchAll(/#(\d)/g)].map((m) => Number(m[1]));
  return Math.max(0, ...used);
}

function readDefinition(source: Source, definer: string): [string, string] {
  if (definer === "def") {
    const name = readName(source, false);
    // `\def\sq#1{...}`: the parameter list before the body.
    const params = /^(#\d)+/.exec(source.text.slice(source.pos))?.[0] ?? "";
    source.pos += params.length;
    const declared = params.length / 2;
    source.skipSpace();
    const body = source.group();
    if (body === null) throw new DefinitionError("The body is missing its closing brace.");
    if (macroArgumentCount(body) > declared) {
      throw new DefinitionError(`The body uses #${macroArgumentCount(body)} without declaring it.`);
    }
    return [name, body];
  }
  const star = source.peek() === "*";
  if (star) source.pos++;
  const name = readName(source, true);
  source.skipSpace();
  let declared = 0;
  if (definer !== "DeclareMathOperator" && source.peek() === "[") {
    const end = source.text.indexOf("]", source.pos);
    const count = Number(source.text.slice(source.pos + 1, end));
    if (end < 0 || !Number.isInteger(count) || count < 0 || count > 9) {
      throw new DefinitionError("The number of arguments is a digit from 0 to 9, like [2].");
    }
    declared = count;
    source.pos = end + 1;
    source.skipSpace();
    if (source.peek() === "[") {
      throw new DefinitionError("A default value for an argument, like [1][x], is not supported.");
    }
  }
  const body = source.group();
  if (body === null) throw new DefinitionError("The body is missing its closing brace.");
  if (definer === "DeclareMathOperator") {
    return [name, `\\operatorname${star ? "*" : ""}{${body}}`];
  }
  if (macroArgumentCount(body) > declared) {
    throw new DefinitionError(
      `The body uses #${macroArgumentCount(body)} but only ${declared} argument${declared === 1 ? " is" : "s are"} declared.`,
    );
  }
  return [name, body];
}

/// Reads the whole setting. Definitions that parse come back as macros, the rest as errors.
export function parseLatexMacros(text: string): ParsedMacros {
  const source = new Source(text);
  const macros: Record<string, string> = {};
  const errors: MacroError[] = [];
  for (;;) {
    source.skipSpace();
    if (source.done) break;
    const line = source.lineAt(source.pos);
    const definer = DEFINERS.find((d) => source.peek(d.length + 1) === `\\${d}`);
    if (!definer) {
      errors.push({
        line,
        message: "Expected a definition such as \\newcommand{\\N}{\\mathbb{N}}.",
      });
      source.skipLine();
      continue;
    }
    source.pos += definer.length + 1;
    try {
      const [name, body] = readDefinition(source, definer);
      macros[name] = body;
    } catch (error) {
      if (!(error instanceof DefinitionError)) throw error;
      errors.push({ line, message: error.message });
      source.skipLine();
    }
  }
  return { macros, errors };
}

/// One macro as the `\\newcommand` that defines it.
export function formatMacro(name: string, body: string): string {
  const args = macroArgumentCount(body);
  return `\\newcommand{${name}}${args > 0 ? `[${args}]` : ""}{${body}}`;
}

/// A macro as the Settings list shows it.
export interface MacroEntry {
  name: string;
  body: string;
  args: number;
}

/// The parsed macros in order, with how many arguments each takes.
export function macroEntries(macros: Record<string, string>): MacroEntry[] {
  return Object.entries(macros).map(([name, body]) => ({
    name,
    body,
    args: macroArgumentCount(body),
  }));
}

/// The macros a new install starts with: common commands KaTeX does not have. Left out are the
/// ones it does (`\\R`, `\\N`, `\\set`, `\\argmax`), so no formula changes meaning.
export const DEFAULT_LATEX_MACROS: MacroEntry[] = [
  { name: "\\abs", body: "\\left|#1\\right|" },
  { name: "\\norm", body: "\\left\\lVert #1 \\right\\rVert" },
  { name: "\\floor", body: "\\left\\lfloor #1 \\right\\rfloor" },
  { name: "\\ceil", body: "\\left\\lceil #1 \\right\\rceil" },
  { name: "\\inner", body: "\\left\\langle #1, #2 \\right\\rangle" },
  { name: "\\vect", body: "\\mathbf{#1}" },
  { name: "\\dd", body: "\\mathrm{d}" },
  { name: "\\E", body: "\\mathbb{E}" },
  { name: "\\Prob", body: "\\mathbb{P}" },
  { name: "\\eps", body: "\\varepsilon" },
].map((m) => ({ ...m, args: macroArgumentCount(m.body) }));

/// The setting's text for a list of macros, one definition per line.
export function serializeLatexMacros(entries: readonly MacroEntry[]): string {
  return entries.map((entry) => formatMacro(entry.name, entry.body)).join("\n");
}

/// The definitions of `text` that parse, written out in full and one per line, for a reader
/// that has none of the user's commands: an exported page.
export function mathPreamble(text: string): string {
  return serializeLatexMacros(macroEntries(parseLatexMacros(text).macros));
}

/// The math block that defines the user's commands, for a page that uses any of them, or
/// `null` for a page that uses none.
export function preambleFor(markdown: string, macros: string): string | null {
  const names = Object.keys(parseLatexMacros(macros).macros);
  const used = names.some((name) =>
    new RegExp(`${name.replace("\\", "\\\\")}(?![A-Za-z])`).test(markdown),
  );
  return used ? `$$\n${mathPreamble(macros)}\n$$` : null;
}

/// `markdown` with the math block in front, if the page uses a command of the user's. A page
/// that uses none comes back as it is.
export function withMathPreamble(markdown: string, macros: string): string {
  const preamble = preambleFor(markdown, macros);
  return preamble === null ? markdown : `${preamble}\n\n${markdown}`;
}
