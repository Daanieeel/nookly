import { IconCode } from "@tabler/icons-react";
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { asString, type JSONAttrValue } from "./block-markdown";
import { createSuggestionRender } from "./suggestion-render";

/// Fewest typed characters before a completion list opens.
const MIN_QUERY = 2;
const MAX_ITEMS = 8;
const WORD = /[\p{L}_$][\p{L}\p{N}_$]*/gu;
const WORD_AT_END = /[\p{L}_$][\p{L}\p{N}_$]*$/u;

const KEYWORDS = new Map(
  Object.entries({
    javascript:
      "async await break case catch class const continue default delete do else export extends false finally for function if import in instanceof let new null return static super switch this throw true try typeof undefined var void while yield console document window".split(
        " ",
      ),
    python:
      "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return self True try while with yield print len range".split(
        " ",
      ),
    rust: "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while println Option Result Some None Vec String".split(
      " ",
    ),
    go: "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var fmt nil true false".split(
      " ",
    ),
    java: "abstract boolean break byte case catch char class continue default do double else enum extends final finally float for if implements import instanceof int interface long new null package private protected public return short static super switch this throw throws try void while String System".split(
      " ",
    ),
    c: "auto break case char const continue default do double else enum extern float for goto if include int long register return short signed sizeof static struct switch typedef union unsigned void volatile while printf NULL".split(
      " ",
    ),
    sql: "SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP INDEX JOIN LEFT RIGHT INNER OUTER ON GROUP BY ORDER HAVING LIMIT OFFSET AS AND OR NOT NULL DISTINCT UNION COUNT".split(
      " ",
    ),
    bash: "if then else elif fi for while do done case esac function in echo export local return exit cd ls grep sed awk cat".split(
      " ",
    ),
  }),
);

const LANGUAGE_ALIASES = new Map(
  Object.entries({
    js: "javascript",
    jsx: "javascript",
    ts: "javascript",
    tsx: "javascript",
    typescript: "javascript",
    py: "python",
    rs: "rust",
    golang: "go",
    cpp: "c",
    "c++": "c",
    sh: "bash",
    shell: "bash",
    zsh: "bash",
  }),
);

function keywordsFor(language: string | null): string[] {
  if (!language) return [];
  const key = language.toLowerCase();
  return KEYWORDS.get(LANGUAGE_ALIASES.get(key) ?? key) ?? [];
}

interface Completion {
  text: string;
  /// Where it came from, shown under the word.
  source: "keyword" | "this block";
}

/// Simple completion in code blocks: while typing a word, a list offers the words
/// already in the block and the language's common keywords. Enter or Tab accepts,
/// Escape dismisses. Needs to run before the code block's own Tab and Enter, hence
/// the priority.
export const CodeCompletion = Extension.create({
  name: "codeCompletion",
  priority: 1000,

  addProseMirrorPlugins() {
    return [
      Suggestion<Completion>({
        editor: this.editor,
        pluginKey: new PluginKey("codeCompletion"),
        findSuggestionMatch: ({ $position }) => {
          if ($position.parent.type.name !== "codeBlock") return null;
          const before = $position.parent.textBetween(0, $position.parentOffset, "\n", "\n");
          const word = WORD_AT_END.exec(before)?.[0];
          if (!word || word.length < MIN_QUERY) return null;
          return {
            range: { from: $position.pos - word.length, to: $position.pos },
            query: word,
            text: word,
          };
        },
        // Only while typing, so moving the cursor through code never opens it.
        shouldShow: ({ transaction }) => transaction.docChanged,
        items: ({ query, editor }) => {
          const { $from } = editor.state.selection;
          const block = $from.parent;
          const lower = query.toLowerCase();
          const text = block.textContent;
          const seen = new Set<string>([query]);
          const found: Completion[] = [];
          const add = (word: string, source: Completion["source"]) => {
            if (seen.has(word) || !word.toLowerCase().startsWith(lower)) return;
            seen.add(word);
            found.push({ text: word, source });
          };
          // The word being typed matches itself, so it is skipped by position.
          const own = $from.parentOffset - query.length;
          for (const match of text.matchAll(WORD)) {
            if (match.index !== own) add(match[0], "this block");
          }
          // SAFETY: `language` is only ever written as `string | null`, a subset of `JSONAttrValue`.
          const language = asString(block.attrs.language as JSONAttrValue | undefined) ?? null;
          for (const keyword of keywordsFor(language)) {
            add(keyword, "keyword");
          }
          return found.slice(0, MAX_ITEMS);
        },
        command: ({ editor, range, props }) => {
          editor.chain().focus().insertContentAt(range, props.text).run();
        },
        render: createSuggestionRender<Completion>((item) => ({
          key: item.text,
          icon: <IconCode size={14} />,
          label: item.text,
          description: item.source,
        })),
      }),
    ];
  },
});
