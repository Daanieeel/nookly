import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { wordsIn } from "./words";

/// What the editor needs from the spell checker: whether it is on, an answer for a batch of
/// words, and a signal when answers may have changed (a language, the user's own words or a
/// word that was ignored). `spell-controller.ts` is the one the app uses.
export interface SpellSource {
  enabled: () => boolean;
  check: (words: string[]) => Promise<boolean[]>;
  subscribe: (listener: () => void) => () => void;
}

/// A word that is spelled wrong, and where it sits in the document.
export interface MisspelledWord {
  word: string;
  from: number;
  to: number;
}

/// Where the last edit left the cursor, while it is still there: the word it is in is still
/// being typed. Moving the cursor, by a click or the arrow keys, ends that.
interface SpellState {
  editHead: number | null;
}

/// What a state is drawn with: the underlines, and the words under them.
interface Computed {
  set: DecorationSet;
  words: MisspelledWord[];
}

const key = new PluginKey<SpellState>("spellcheck");

/// The misspelled words each editor state was drawn with, for `misspelledWordAt`.
const latest = new WeakMap<EditorState, MisspelledWord[]>();

/// Words are asked about together, a moment after typing pauses.
const BATCH_DELAY_MS = 80;
/// What is remembered about words, until it grows past this and starts over.
const MAX_KNOWN_WORDS = 50_000;

/// A text block's misspelled words, remembered for the very node it was worked out for: a
/// block that did not change is the same node, so a long page is not read again on every key.
interface BlockResult {
  epoch: number;
  /// Every word of the block had an answer. Only a complete result is kept as it is.
  complete: boolean;
  wrong: { word: string; from: number; to: number }[];
}

/// The word as it is asked about: the typographic apostrophe is the plain one.
const normalized = (word: string) => word.replaceAll("’", "'");

function spellPlugin(source: SpellSource) {
  const known = new Map<string, boolean>();
  const pending = new Set<string>();
  const results = new WeakMap<ProseMirrorNode, BlockResult>();
  // Bumped when answers may have changed, which throws everything remembered away.
  let epoch = 0;
  let view: EditorView | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const redraw = () => {
    if (!view || view.isDestroyed) return;
    view.dispatch(view.state.tr.setMeta(key, "redraw").setMeta("addToHistory", false));
  };

  const flush = () => {
    timer = undefined;
    const words = [...pending];
    pending.clear();
    if (words.length === 0 || !source.enabled()) return;
    const asked = epoch;
    void source.check(words.map(normalized)).then((answers) => {
      // Answers to a question from before a change are out of date.
      if (asked !== epoch) return;
      if (known.size > MAX_KNOWN_WORDS) known.clear();
      words.forEach((word, i) => known.set(word, answers[i] ?? true));
      redraw();
    });
  };

  const analyse = (block: ProseMirrorNode): BlockResult => {
    const wrong: BlockResult["wrong"] = [];
    let complete = true;
    for (const span of wordsIn(block)) {
      const right = known.get(span.word);
      if (right === undefined) {
        complete = false;
        pending.add(span.word);
      } else if (!right) {
        wrong.push(span);
      }
    }
    const result = { epoch, complete, wrong };
    results.set(block, result);
    return result;
  };

  const compute = (state: EditorState): Computed => {
    const editHead = key.getState(state)?.editHead ?? null;
    const decorations: Decoration[] = [];
    const words: MisspelledWord[] = [];
    state.doc.descendants((node, pos) => {
      if (!node.isTextblock) return true;
      if (node.type.spec.code) return false;
      let result = results.get(node);
      if (!result || result.epoch !== epoch || !result.complete) result = analyse(node);
      for (const span of result.wrong) {
        const from = pos + 1 + span.from;
        const to = pos + 1 + span.to;
        // The word the cursor is in is still being typed.
        if (editHead !== null && editHead >= from && editHead <= to) continue;
        decorations.push(Decoration.inline(from, to, { class: "spell-error" }));
        words.push({ word: span.word, from, to });
      }
      return false;
    });
    if (pending.size > 0 && timer === undefined) timer = setTimeout(flush, BATCH_DELAY_MS);
    return { set: DecorationSet.create(state.doc, decorations), words };
  };

  return new Plugin<SpellState>({
    key,
    view(editorView) {
      view = editorView;
      const stop = source.subscribe(() => {
        epoch++;
        known.clear();
        pending.clear();
        redraw();
      });
      return {
        destroy() {
          stop();
          if (timer) clearTimeout(timer);
          view = null;
        },
      };
    },
    props: {
      decorations(state) {
        if (!source.enabled()) return DecorationSet.empty;
        const { set, words } = compute(state);
        latest.set(state, words);
        return set;
      },
    },
    state: {
      init: () => ({ editHead: null }),
      apply(tr, value) {
        if (tr.docChanged) return { editHead: tr.selection.empty ? tr.selection.from : null };
        return tr.selectionSet ? { editHead: null } : value;
      },
    },
  });
}

/// The misspelled word at a position of the document, for the right click menu. `null` when
/// the spell checker is off, or the word is not wrong.
export function misspelledWordAt(state: EditorState, pos: number): MisspelledWord | null {
  // The menu is built from the state the editor shows.
  return latest.get(state)?.find((word) => pos >= word.from && pos <= word.to) ?? null;
}

/// Underlines misspelled words while typing. It checks a block only when the block changed,
/// asks about each word once, and leaves code, links and mentions alone (`words.ts`).
export const Spellcheck = Extension.create<{ source: SpellSource }>({
  name: "spellcheck",

  addOptions() {
    return { source: { enabled: () => false, check: async () => [], subscribe: () => () => {} } };
  },

  addProseMirrorPlugins() {
    return [spellPlugin(this.options.source)];
  },
});
