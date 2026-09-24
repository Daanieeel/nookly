import { useQuery } from "@tanstack/react-query";
import type { CSSProperties, ReactNode } from "react";
import { ensureLanguage, highlightSpans } from "@/features/notes/highlighter";

/// File extension to the language names code blocks use. `highlighter.ts` routes
/// each to twinkleplop, or Shiki for the grammars twinkleplop doesn't ship yet.
const LANGUAGE_BY_EXTENSION = {
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  css: "css",
  go: "go",
  html: "html",
  htm: "html",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "tsx",
  json: "json",
  md: "markdown",
  py: "python",
  rs: "rust",
  sql: "sql",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  yaml: "yaml",
  yml: "yaml",
  c: "cpp",
  cpp: "cpp",
  h: "cpp",
  hpp: "cpp",
  cs: "csharp",
  ini: "ini",
  java: "java",
  php: "php",
  rb: "ruby",
} satisfies Record<string, string>;

function hasLanguage(extension: string): extension is keyof typeof LANGUAGE_BY_EXTENSION {
  return extension in LANGUAGE_BY_EXTENSION;
}

/// Tokenizing is fast for twinkleplop but not for Shiki; past this a file shows plain.
const MAX_HIGHLIGHT_CHARS = 200_000;

export function codeLanguage(extension: string | null): string | null {
  return extension && hasLanguage(extension) ? LANGUAGE_BY_EXTENSION[extension] : null;
}

/// What a highlighter span sets, read from its inline CSS
/// (`color:var(--accent-pink);font-style:italic`).
interface TokenParts {
  color?: string;
  fontStyle?: string;
  fontWeight?: string;
  decoration?: string;
}

function tokenParts(css: string): TokenParts {
  const value = (property: string) =>
    css
      .split(";")
      .map((declaration) => declaration.split(":").map((part) => part.trim()))
      .find(([name]) => name === property)?.[1];
  return {
    color: value("color"),
    fontStyle: value("font-style"),
    fontWeight: value("font-weight"),
    decoration: value("text-decoration"),
  };
}

function Token({ css, children }: { css: string; children: string }) {
  const parts = tokenParts(css);
  return (
    <span
      className="code-token"
      // SAFETY: only the `--token-*` custom properties `.code-token` reads, each a
      // CSS value the highlighter produced.
      style={
        {
          "--token-color": parts.color,
          "--token-font-style": parts.fontStyle,
          "--token-font-weight": parts.fontWeight,
          "--token-decoration": parts.decoration,
        } as CSSProperties
      }
    >
      {children}
    </span>
  );
}

/// `text` split into highlighted runs, in the accent colors code blocks use.
function useHighlighted(text: string, language: string | null): ReactNode[] | null {
  const { data } = useQuery({
    queryKey: ["highlight", language, text],
    enabled: language !== null && text.length <= MAX_HIGHLIGHT_CHARS,
    staleTime: Infinity,
    queryFn: async () => {
      if (!language || !(await ensureLanguage(language))) return null;
      const spans = highlightSpans(language, text);
      const nodes: ReactNode[] = [];
      let at = 0;
      for (const span of spans) {
        if (span.from > at) nodes.push(text.slice(at, span.from));
        nodes.push(
          <Token key={span.from} css={span.style}>
            {text.slice(span.from, span.to)}
          </Token>,
        );
        at = Math.max(at, span.to);
      }
      if (at < text.length) nodes.push(text.slice(at));
      return nodes;
    },
  });
  return data ?? null;
}

/// Source text with syntax highlighting, plain until the grammar has loaded.
export function HighlightedCode({ text, language }: { text: string; language: string | null }) {
  const highlighted = useHighlighted(text, language);
  return <code>{highlighted ?? text}</code>;
}
