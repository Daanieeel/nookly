import type { Options, Plugin } from "prettier";

/// The Prettier parser for each code language, and the plugins it needs. Anything not listed
/// (Rust, Python, Go, shell, SQL, ...) has no formatter here and is left alone.
interface FormatterSpec {
  parser: string;
  plugins: () => Promise<Plugin[]>;
}

const estree = () => import("prettier/plugins/estree");
const babel = async (): Promise<Plugin[]> => [
  (await import("prettier/plugins/babel")).default,
  (await estree()).default,
];
const typescript = async (): Promise<Plugin[]> => [
  (await import("prettier/plugins/typescript")).default,
  (await estree()).default,
];

const css = async () => [(await import("prettier/plugins/postcss")).default];
const html = async () => [(await import("prettier/plugins/html")).default];
const markdown = async () => [(await import("prettier/plugins/markdown")).default];
const yaml = async () => [(await import("prettier/plugins/yaml")).default];

/// By the language names a code block holds, including the short ones the highlighters read.
const FORMATTERS = new Map<string, FormatterSpec>([
  ["javascript", { parser: "babel", plugins: babel }],
  ["js", { parser: "babel", plugins: babel }],
  ["jsx", { parser: "babel", plugins: babel }],
  ["typescript", { parser: "typescript", plugins: typescript }],
  ["ts", { parser: "typescript", plugins: typescript }],
  ["tsx", { parser: "typescript", plugins: typescript }],
  ["json", { parser: "json", plugins: babel }],
  ["jsonc", { parser: "jsonc", plugins: babel }],
  ["css", { parser: "css", plugins: css }],
  ["html", { parser: "html", plugins: html }],
  ["markdown", { parser: "markdown", plugins: markdown }],
  ["md", { parser: "markdown", plugins: markdown }],
  ["yaml", { parser: "yaml", plugins: yaml }],
  ["yml", { parser: "yaml", plugins: yaml }],
]);

function formatterFor(language: string | null): FormatterSpec | null {
  return (language && FORMATTERS.get(language)) || null;
}

/// Whether a formatter exists for this code language.
export function canFormat(language: string | null): boolean {
  return formatterFor(language) !== null;
}

const OPTIONS = { printWidth: 80, tabWidth: 2 } satisfies Options;

/// `code` formatted for `language`, or `null` when there is nothing to do: the language has no
/// formatter, or the code does not parse (half written code stays exactly as typed). A code
/// block has no final newline, so the one Prettier adds is dropped. Prettier loads on first use.
export async function formatCode(code: string, language: string | null): Promise<string | null> {
  const spec = formatterFor(language);
  if (!spec) return null;
  try {
    const { format } = await import("prettier/standalone");
    const formatted = await format(code, {
      ...OPTIONS,
      parser: spec.parser,
      plugins: await spec.plugins(),
    });
    return formatted.replace(/\n$/, "");
  } catch {
    return null;
  }
}
