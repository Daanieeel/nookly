import type { ThemeRegistrationRaw } from "@shikijs/core";

export const NOOKLY_THEME_NAME = "nookly";

/// Maps the TextMate scopes Shiki's real grammars emit onto this app's own four accent tokens —
/// the same reduction `styles.css` used to apply to highlight.js's `.hljs-*` classes before the
/// Shiki pivot. Every `foreground` here is a literal CSS custom property (`var(--accent-pink)`
/// etc.), not a hex code — Shiki just writes whatever string it's given into each token's
/// resolved `color`, so these follow light/dark mode automatically like every other themed
/// surface in the app, with no separate light/dark Shiki theme needed.
export const nooklyShikiTheme: ThemeRegistrationRaw = {
  name: NOOKLY_THEME_NAME,
  type: "dark",
  colors: {
    "editor.background": "transparent",
    "editor.foreground": "var(--foreground)",
  },
  // `settings` (not `tokenColors`) is what Shiki's theme normalization actually reads — an
  // empty/absent `tokenColors` alongside a populated `settings` still works, but the reverse
  // doesn't: a `settings: []` placeholder added just to satisfy `ThemeRegistrationRaw`'s type
  // (which is `vscode-textmate`'s original theme shape, predating the `tokenColors` alias) wins
  // over `tokenColors` and silently discards every rule below it. Verified against the installed
  // Shiki version — every token fell back to the plain `editor.foreground` color until this was
  // renamed from `tokenColors` to `settings`.
  settings: [
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: "var(--muted-foreground)", fontStyle: "italic" },
    },
    {
      scope: [
        "keyword",
        "keyword.control",
        "keyword.operator.new",
        "storage",
        "storage.type",
        "storage.modifier",
        "constant.language",
        "variable.language.this",
      ],
      settings: { foreground: "var(--accent-pink)" },
    },
    {
      scope: ["string", "string.quoted", "string.template", "string.regexp"],
      settings: { foreground: "var(--accent-green)" },
    },
    {
      scope: [
        "entity.name.function",
        "support.function",
        "meta.function-call",
        "variable.function",
        "entity.name.section",
      ],
      settings: { foreground: "var(--accent-purple)" },
    },
    {
      scope: [
        "variable",
        "variable.parameter",
        "variable.other",
        "support.variable",
        "entity.other.attribute-name",
      ],
      settings: { foreground: "var(--accent-purple)" },
    },
    {
      scope: [
        "entity.name.type",
        "entity.name.class",
        "entity.other.inherited-class",
        "support.type",
        "support.class",
        "entity.name.tag",
        "punctuation.definition.tag",
        "support.constant",
      ],
      settings: { foreground: "var(--accent-blue)" },
    },
  ],
};
