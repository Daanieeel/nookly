import { createLowlight } from "lowlight";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { withJsxFragmentSupport } from "./jsx-fragment-fix";

/// `lowlight` keeps its own grammar registry, so every language it can highlight
/// must be registered eagerly here (`CodeBlockLowlight` re-highlights synchronously
/// on every keystroke — there's no natural place to await a dynamic import mid-decoration).
export const lowlight = createLowlight({
  bash,
  cpp,
  csharp,
  css,
  go,
  ini,
  java,
  // JSX/TSX support (see `jsx-fragment-fix.ts`) — a JSX Fragment nested inside a real tag
  // otherwise breaks highlighting for everything after it in the block.
  javascript: withJsxFragmentSupport(javascript),
  json,
  markdown,
  php,
  // Registered explicitly (not left to `CodeBlockLowlight`'s `highlightAuto` fallback) so
  // "Plain Text" — `defaultLanguage` in `BlockEditor.tsx` — renders truly unhighlighted instead
  // of the extension guessing a language for untyped/ambiguous content.
  plaintext,
  python,
  ruby,
  rust,
  sql,
  typescript: withJsxFragmentSupport(typescript),
  xml,
  yaml,
});

lowlight.registerAlias({
  xml: ["html"],
  ini: ["toml"],
  typescript: ["ts", "tsx"],
  javascript: ["js", "jsx"],
  // highlight.js's own `json` grammar already tolerates `//`/`/* */` comments
  // (its `contains` list includes both comment modes) — JSONC needs no separate grammar.
  json: ["jsonc"],
});
