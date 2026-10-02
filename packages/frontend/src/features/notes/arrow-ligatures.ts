import { Extension, textInputRule } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/// Inter has no glyph for these, so the browser falls back to a system font that
/// draws them small. Enlarged by a decoration, which leaves the text itself alone.
const SMALL_IN_FALLBACK = /[⇒⇔]/g;

function enlargedArrows(doc: Parameters<typeof DecorationSet.create>[0]): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos, parent) => {
    if (!node.isText || !node.text || parent?.type.spec.code) return;
    if (node.marks.some((mark) => mark.type.spec.code)) return;
    for (const match of node.text.matchAll(SMALL_IN_FALLBACK)) {
      const from = pos + match.index;
      decorations.push(Decoration.inline(from, from + 1, { class: "arrow-enlarged" }));
    }
  });
  return DecorationSet.create(doc, decorations);
}

/// Arrows and comparisons as you type: `->` becomes →, `<-` ←, `<->` ↔, `=>` ⇒,
/// `<=>` ⇔, `!=` ≠, `<=` ≤ and `>=` ≥. They are real
/// characters, so they look the same in every font and survive export. Backspace right
/// after one gives the typed characters back. Tiptap skips input rules inside code
/// blocks and inline code, where `->` has to stay as typed.
export const ArrowLigatures = Extension.create({
  name: "arrowLigatures",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("arrowEnlarged"),
        state: {
          init: (_config, state) => enlargedArrows(state.doc),
          apply: (tr, old) => (tr.docChanged ? enlargedArrows(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },

  addInputRules() {
    return [
      textInputRule({ find: /->$/, replace: "→" }),
      textInputRule({ find: /<-$/, replace: "←" }),
      // `<-` has already turned into ←, so the closing `>` finds that.
      textInputRule({ find: /←>$/, replace: "↔" }),
      textInputRule({ find: /=>$/, replace: "⇒" }),
      // Same for `<=>`: `<=` is already ≤ by the time the `>` arrives.
      textInputRule({ find: /≤>$/, replace: "⇔" }),
      textInputRule({ find: /!=$/, replace: "≠" }),
      textInputRule({ find: /<=$/, replace: "≤" }),
      textInputRule({ find: />=$/, replace: "≥" }),
    ];
  },
});
