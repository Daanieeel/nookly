import { Extension, textInputRule } from "@tiptap/react";

/// Arrows and comparisons as you type: `->` becomes →, `<-` ←, `<->` ↔, `=>` ⇒,
/// `<=>` ⇔, `!=` ≠, `<=` ≤ and `>=` ≥. They are real
/// characters, so they look the same in every font and survive export. Backspace right
/// after one gives the typed characters back. Tiptap skips input rules inside code
/// blocks and inline code, where `->` has to stay as typed.
export const ArrowLigatures = Extension.create({
  name: "arrowLigatures",

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
