import type { Node as ProseNode } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

/// One coloured run of a code block, from its own text's start.
interface Span {
  from: number;
  to: number;
  style: string;
}

export type SpansOf = (language: string, code: string) => Span[];

export const codeHighlightKey = new PluginKey<DecorationSet>("codeHighlight");

/// How long typing rests before a code block is coloured again: the highlighter is slow
/// enough on a phone to be felt on every key.
const SETTLE = 150;

/// The colours of every code block in `doc`, each block's asked of the highlighter once
/// for its language and code.
export function codeDecorations(
  doc: ProseNode,
  spansOf: SpansOf,
  cache: Map<string, Span[]>,
): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "codeBlock") return true;
    const language = String(node.attrs.language ?? "plaintext");
    const code = node.textContent;
    const key = `${language}\u0000${code}`;
    let spans = cache.get(key);
    if (!spans) {
      spans = code ? spansOf(language, code) : [];
      cache.set(key, spans);
    }
    for (const span of spans) {
      decorations.push(
        Decoration.inline(pos + 1 + span.from, pos + 1 + span.to, { style: span.style }),
      );
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/// Colours code blocks, as the desktop does. The colours come a moment after the page
/// opens or typing rests; until then the ones there are move along with the text.
export function codeHighlightPlugin(spansOf: SpansOf): Plugin<DecorationSet> {
  const cache = new Map<string, Span[]>();
  return new Plugin<DecorationSet>({
    key: codeHighlightKey,
    state: {
      init: () => DecorationSet.empty,
      apply: (tr, set) => tr.getMeta(codeHighlightKey) ?? set.map(tr.mapping, tr.doc),
    },
    props: {
      decorations: (state) => codeHighlightKey.getState(state),
    },
    view(view) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const later = (delay: number) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (cache.size > 500) cache.clear();
          view.dispatch(
            view.state.tr.setMeta(
              codeHighlightKey,
              codeDecorations(view.state.doc, spansOf, cache),
            ),
          );
        }, delay);
      };
      later(0);
      return {
        update(next, previous) {
          if (!next.state.doc.eq(previous.doc)) later(SETTLE);
        },
        destroy: () => clearTimeout(timer),
      };
    },
  });
}
