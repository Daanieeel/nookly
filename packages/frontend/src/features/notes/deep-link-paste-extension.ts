import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { parseDeepLink } from "#/lib/deep-link-url.ts";

/// Pasting a `nookly://open/...` link on its own turns it into a link in the page, which
/// opens what it points at when clicked. Autolinking is off in pages, so nothing else would.
/// Anything that is not exactly such a link pastes as it always did.
export const DeepLinkPaste = Extension.create({
  name: "deepLinkPaste",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData("text/plain").trim() ?? "";
            const link = view.state.schema.marks.link;
            if (!link || !parseDeepLink(text)) return false;
            const mark = link.create({ href: text });
            view.dispatch(
              view.state.tr.replaceSelectionWith(view.state.schema.text(text, [mark]), false),
            );
            return true;
          },
        },
      }),
    ];
  },
});
