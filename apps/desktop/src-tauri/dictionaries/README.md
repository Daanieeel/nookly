# Spell checker dictionaries

Hunspell dictionaries for the spell checker (`src/spelling.rs`), compiled into the app. Each
language is a `<code>.aff` and `<code>.dic` file with its license next to it. They are the
files of the [wooorm/dictionaries](https://github.com/wooorm/dictionaries) `dictionary-*`
packages, in UTF-8.

| Code    | Language     | Package         | Version | License                         |
| ------- | ------------ | --------------- | ------- | ------------------------------- |
| `en`    | English (US) | `dictionary-en` | 4.0.0   | MIT AND BSD                     |
| `en-gb` | English (UK) | `dictionary-en-gb` | 3.0.0 | MIT AND BSD                    |
| `de`    | German       | `dictionary-de` | 3.0.0   | GPL-2.0 OR GPL-3.0              |
| `fr`    | French       | `dictionary-fr` | 3.0.0   | MPL-2.0                         |
| `es`    | Spanish      | `dictionary-es` | 4.0.0   | GPL-3.0 OR LGPL-3.0 OR MPL-1.1  |
| `it`    | Italian      | `dictionary-it` | 2.0.0   | GPL-3.0                         |

To add a language: put its two files here, add it to `LANGUAGES` in `src/spelling.rs` and to
`SPELL_LANGUAGES` in `packages/frontend/src/features/spellcheck/languages.ts`.
