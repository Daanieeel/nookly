import { Extension, InputRule, textInputRule } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { settings } from "#/lib/settings/settings.ts";
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

/// A text rule that does nothing while the `notes.arrowLigatures` setting is off,
/// checked on every keystroke so a change reaches editors that are already open.
function ligature(find: RegExp, replace: string): InputRule {
  const rule = textInputRule({ find, replace });
  return new InputRule({
    find,
    handler: (props) => {
      if (!settings.get("notes.arrowLigatures")) return null;
      return rule.handler(props);
    },
  });
}

/// Arrows and comparisons as you type: `->` becomes →, `<-` ←, `<->` ↔, `=>` ⇒,
/// `<=>` ⇔, `!=` ≠, `<=` ≤ and `>=` ≥. They are real
/// characters, so they look the same in every font and survive export. Backspace right
/// after one gives the typed characters back. Tiptap skips input rules inside code
/// blocks and inline code, where `->` has to stay as typed. The `notes.arrowLigatures`
/// setting turns the rules off.
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
      ligature(/->$/, "→"),
      ligature(/<-$/, "←"),
      // `<-` has already turned into ←, so the closing `>` finds that.
      ligature(/←>$/, "↔"),
      ligature(/=>$/, "⇒"),
      // Same for `<=>`: `<=` is already ≤ by the time the `>` arrives.
      ligature(/≤>$/, "⇔"),
      ligature(/!=$/, "≠"),
      ligature(/<=$/, "≤"),
      ligature(/>=$/, "≥"),
    ];
  },
});
