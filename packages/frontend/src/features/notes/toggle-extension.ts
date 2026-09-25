import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Extension, mergeAttributes, Node, ReactNodeViewRenderer } from "@tiptap/react";
import { ToggleBlock } from "./ToggleBlock";

/// A toggle: its first paragraph is the summary, the rest the folded body. Saved
/// as one `toggle` block, one paragraph per line.
export const Toggle = Node.create({
  name: "toggle",
  group: "block",
  content: "paragraph+",
  defining: true,

  addAttributes() {
    return {
      toggle: {
        default: "closed",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-toggle") ?? "closed",
        renderHTML: (attributes: { toggle?: string }) => ({ "data-toggle": attributes.toggle }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-toggle-block]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-toggle-block": "" }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ToggleBlock);
  },

  addKeyboardShortcuts() {
    /// The toggle around the cursor, when the selection is collapsed inside one.
    const around = () => {
      const { $from, empty } = this.editor.state.selection;
      if (!empty || $from.depth < 2) return null;
      const node = $from.node($from.depth - 1);
      if (node.type.name !== this.name) return null;
      return { $from, node, index: $from.index($from.depth - 1), depth: $from.depth - 1 };
    };
    return {
      /// On a closed summary, and on an empty last body line, Enter leaves the
      /// toggle for a new paragraph below it, like leaving a list.
      Enter: () => {
        const at = around();
        if (!at) return false;
        const { $from, node, index, depth } = at;
        const closedSummary = index === 0 && node.attrs.toggle !== "open";
        const emptyLast =
          index > 0 && index === node.childCount - 1 && $from.parent.content.size === 0;
        if (!closedSummary && !emptyLast) return false;
        return this.editor
          .chain()
          .command(({ tr, state }) => {
            const after = $from.after(depth);
            if (emptyLast) tr.delete($from.before(), $from.after());
            const pos = tr.mapping.map(after);
            tr.insert(pos, state.schema.nodes.paragraph.create());
            tr.setSelection(TextSelection.create(tr.doc, pos + 1));
            return true;
          })
          .run();
      },
      /// Backspace at the very start of the summary unwraps the toggle into
      /// plain paragraphs.
      Backspace: () => {
        const at = around();
        if (!at || at.index !== 0 || at.$from.parentOffset !== 0) return false;
        const { $from, node, depth } = at;
        return this.editor
          .chain()
          .command(({ tr }) => {
            const start = $from.before(depth);
            tr.replaceWith(start, $from.after(depth), node.content);
            tr.setSelection(TextSelection.create(tr.doc, start + 1));
            return true;
          })
          .run();
      },
    };
  },
});

const toggleHeadingKey = new PluginKey("toggleHeadings");

/// Every top-level block a closed toggle heading folds away: everything after it
/// up to the next heading of the same or a higher level.
function foldDecorations(doc: ProseMirrorNode): Decoration[] {
  const decorations: Decoration[] = [];
  let foldedUnder: number | null = null;
  doc.forEach((node, pos) => {
    const level = node.type.name === "heading" ? Number(node.attrs.level) : null;
    if (level !== null && foldedUnder !== null && level <= foldedUnder) foldedUnder = null;
    if (foldedUnder !== null) {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "toggle-folded" }));
      return;
    }
    if (level === null || !node.attrs.toggle) return;
    const open = node.attrs.toggle === "open";
    decorations.push(
      Decoration.widget(pos + 1, () => chevron(pos, open), {
        side: -1,
        key: `toggle-${pos}-${open}`,
        ignoreSelection: true,
      }),
    );
    if (!open) foldedUnder = level;
  });
  return decorations;
}

/// Plain DOM, since widgets live outside React. The native tooltip (`title`)
/// stands in for the app's tooltip here.
function chevron(pos: number, open: boolean): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "toggle-heading-chevron";
  button.dataset.pos = String(pos);
  button.dataset.open = String(open);
  const label = open ? "Collapse Section" : "Expand Section";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-expanded", String(open));
  button.contentEditable = "false";
  button.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6l-6 6"/></svg>';
  return button;
}

/// Toggle headings: a `toggle` attr on any heading (`open` / `closed`, unset for a
/// plain heading) and the chevron plus folding that go with it.
export const ToggleHeading = Extension.create({
  name: "toggleHeading",

  addGlobalAttributes() {
    return [
      {
        types: ["heading"],
        attributes: {
          toggle: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-toggle"),
            renderHTML: (attributes: { toggle?: string | null }) =>
              attributes.toggle ? { "data-toggle": attributes.toggle } : {},
          },
        },
      },
    ];
  },

  addKeyboardShortcuts() {
    return {
      /// Enter on a closed toggle heading opens it first, so the new line
      /// doesn't land out of sight.
      Enter: () => {
        const { $from, empty } = this.editor.state.selection;
        const heading = $from.parent;
        if (!empty || heading.type.name !== "heading" || heading.attrs.toggle !== "closed")
          return false;
        const pos = $from.before();
        return this.editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, { ...heading.attrs, toggle: "open" });
            return true;
          })
          .splitBlock()
          .run();
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: toggleHeadingKey,
        state: {
          init: (_, { doc }) => DecorationSet.create(doc, foldDecorations(doc)),
          apply: (tr, set) =>
            tr.docChanged ? DecorationSet.create(tr.doc, foldDecorations(tr.doc)) : set,
        },
        props: {
          decorations: (state) => toggleHeadingKey.getState(state),
          handleDOMEvents: {
            mousedown: (view, event) => {
              const target = event.target;
              const button =
                target instanceof Element
                  ? target.closest<HTMLElement>(".toggle-heading-chevron")
                  : null;
              if (!button) return false;
              event.preventDefault();
              const pos = Number(button.dataset.pos);
              const heading = view.state.doc.nodeAt(pos);
              if (!heading || heading.type.name !== "heading") return true;
              const toggle = heading.attrs.toggle === "open" ? "closed" : "open";
              view.dispatch(
                view.state.tr.setNodeMarkup(pos, undefined, { ...heading.attrs, toggle }),
              );
              return true;
            },
          },
        },
      }),
    ];
  },
});
