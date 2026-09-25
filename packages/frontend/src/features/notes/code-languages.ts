import type { ComponentType } from "react";
import {
  Css3Mark,
  CPlusPlusMark,
  CSharpMark,
  GnuBashMark,
  GoMark,
  Html5Mark,
  JavaMark,
  JavaScriptMark,
  JsonMark,
  MarkdownMark,
  PhpMark,
  PythonMark,
  RubyMark,
  RustMark,
  SqlMark,
  TomlMark,
  TypeScriptMark,
  YamlMark,
} from "./language-marks";

/// Every entry's icon renders its own fixed brand color (see `language-marks.tsx`) rather than
/// inheriting text color, so the `className` a caller passes only ever affects sizing.
export type LanguageIcon = ComponentType<{ className?: string }>;

/// The header row's language picker options — one entry per grammar actually
/// registered in `twinkleplop-highlighter.ts` or `shiki-highlighter.ts`. `jsonc` is its own real grammar (tolerates `//`/`/* */`
/// comments); `jsx`/`tsx` are their own real grammars too, distinct from javascript/typescript,
/// but get folded under the same brand icon rather than a separate one since they're the same
/// language family. Kept as a flat list (not derived from the highlighter's loaded languages) so
/// each one gets a human-readable label and a colored brand icon instead of its raw grammar id.
export const CODE_LANGUAGES: { value: string; label: string; icon: LanguageIcon }[] = [
  { value: "bash", label: "Bash", icon: GnuBashMark },
  { value: "cpp", label: "C++", icon: CPlusPlusMark },
  { value: "csharp", label: "C#", icon: CSharpMark },
  { value: "css", label: "CSS", icon: Css3Mark },
  { value: "go", label: "Go", icon: GoMark },
  { value: "html", label: "HTML", icon: Html5Mark },
  { value: "ini", label: "INI / TOML", icon: TomlMark },
  { value: "java", label: "Java", icon: JavaMark },
  { value: "javascript", label: "JavaScript", icon: JavaScriptMark },
  { value: "jsx", label: "JSX", icon: JavaScriptMark },
  { value: "json", label: "JSON", icon: JsonMark },
  { value: "jsonc", label: "JSONC", icon: JsonMark },
  { value: "markdown", label: "Markdown", icon: MarkdownMark },
  { value: "php", label: "PHP", icon: PhpMark },
  { value: "python", label: "Python", icon: PythonMark },
  { value: "ruby", label: "Ruby", icon: RubyMark },
  { value: "rust", label: "Rust", icon: RustMark },
  { value: "sql", label: "SQL", icon: SqlMark },
  { value: "typescript", label: "TypeScript", icon: TypeScriptMark },
  { value: "tsx", label: "TSX", icon: TypeScriptMark },
  { value: "yaml", label: "YAML", icon: YamlMark },
];

/// A stored `language` value isn't always one of `CODE_LANGUAGES`' own `value`s — Tiptap's
/// ` ```ts ` fence shortcut (and the CLI's `--language`) store whatever token was typed
/// verbatim, and the highlighters resolve a couple of short aliases (`ts` ->
/// typescript, `js` -> javascript) that have no *separate* entry of their own here (unlike
/// `jsx`/`tsx`/`html`, which are distinct enough dialects to get their own label); `toml` maps
/// onto the picker's combined "INI / TOML" entry the same way, even though it is tokenized
/// with its own real TOML grammar rather than the INI one. Without resolving through this map
/// first, the picker couldn't find a matching entry and silently fell back to showing "Plain
/// Text" even though the block highlighted correctly.
const DISPLAY_ALIASES = {
  toml: "ini",
  ts: "typescript",
  js: "javascript",
} satisfies Record<string, string>;

function isDisplayAlias(value: string): value is keyof typeof DISPLAY_ALIASES {
  return value in DISPLAY_ALIASES;
}

export function resolveLanguageEntry(value: string | null) {
  if (!value) return undefined;
  const canonical = isDisplayAlias(value) ? DISPLAY_ALIASES[value] : value;
  return CODE_LANGUAGES.find((lang) => lang.value === canonical);
}
