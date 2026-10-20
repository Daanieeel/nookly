/// <reference lib="dom" />
import type { ParsedMacros } from "@nookly/shared/latex";
import type { Node as ProseNode } from "prosemirror-model";
import type { NodeViewConstructor } from "prosemirror-view";
import { mathMarkup } from "./math.ts";

type Macros = ParsedMacros["macros"];

/// An inline formula: drawn from its source, a small mark while it is empty.
export function inlineMathView(macros: () => Macros): NodeViewConstructor {
  return (node) => {
    const dom = document.createElement("span");
    dom.className = "math";
    dom.setAttribute("data-node", "inlineMath");
    const draw = (n: ProseNode) => {
      dom.innerHTML =
        mathMarkup(String(n.attrs.latex ?? ""), macros(), false) ||
        '<span class="math-empty">formula</span>';
    };
    draw(node);
    return {
      dom,
      update(next) {
        if (next.type !== node.type) return false;
        node = next;
        draw(next);
        return true;
      },
      // What the formula draws is not the document's to keep.
      ignoreMutation: () => true,
    };
  };
}

/// A math or equation block: its source to edit, and the formula it draws under it.
export function mathBlockView(macros: () => Macros): NodeViewConstructor {
  return (node) => {
    const dom = document.createElement("div");
    dom.className = "mathblock";
    const pre = document.createElement("pre");
    pre.className = "source";
    pre.setAttribute("data-node", node.type.name);
    const code = document.createElement("code");
    pre.append(code);
    const out = document.createElement("div");
    out.className = "rendered";
    out.contentEditable = "false";
    dom.append(pre, out);
    const draw = (n: ProseNode) => {
      out.innerHTML = mathMarkup(n.textContent, macros(), true);
    };
    draw(node);
    return {
      dom,
      contentDOM: code,
      update(next) {
        if (next.type !== node.type) return false;
        node = next;
        draw(next);
        return true;
      },
      ignoreMutation: (mutation) => out.contains(mutation.target),
    };
  };
}
