/// <reference lib="dom" />
import { EDITOR_SCHEMA, type SchemaAttr } from "@nookly/shared/editor-schema";
import { z } from "zod";
import { type DOMOutputSpec, type MarkSpec, type NodeSpec, Schema } from "prosemirror-model";

/// The page schema for the phone's editor: the desktop's names, content rules and
/// attributes (`@nookly/shared/editor-schema`), with a plain rendering of each node,
/// since only the structure has to match for a document to be shared.

const text = z.string();

const attrs = (list: SchemaAttr[]): NodeSpec["attrs"] =>
  Object.fromEntries(
    list.map((a) => [
      a.name,
      a.required ? {} : { default: a.default === undefined ? null : a.default },
    ]),
  );

const TAGS = new Map([
  ["paragraph", "p"],
  ["blockquote", "blockquote"],
  ["bulletList", "ul"],
  ["orderedList", "ol"],
  ["listItem", "li"],
  ["hardBreak", "br"],
  ["codeBlock", "pre"],
  ["table", "table"],
  ["tableRow", "tr"],
  ["tableCell", "td"],
  ["tableHeader", "th"],
  ["taskList", "ul"],
  ["taskItem", "li"],
  ["divider", "hr"],
]);

const MARK_TAGS = new Map([
  ["bold", "strong"],
  ["italic", "em"],
  ["strike", "s"],
  ["underline", "u"],
  ["highlight", "mark"],
  ["code", "code"],
  ["link", "a"],
]);

/// The atoms and blocks that hold their data in attributes show as a labelled card.
const CARD_LABELS = new Map([
  ["timeline", "Timeline"],
  ["progress", "Progress"],
  ["tree", "Tree"],
  ["steps", "Steps"],
  ["stats", "Stats"],
  ["details", "Details"],
  ["entity_card", "Linked item"],
  ["image", "Image"],
  ["video", "Video"],
  ["audio", "Audio"],
  ["file", "File"],
  ["embed", "Embed"],
  ["bookmark", "Bookmark"],
]);

/// What pasted HTML turns into: the common nodes only, anything else pastes as text.
const PARSE = new Map<string, NodeSpec["parseDOM"]>([
  ["paragraph", [{ tag: "p" }]],
  ["blockquote", [{ tag: "blockquote" }]],
  ["bulletList", [{ tag: "ul" }]],
  ["orderedList", [{ tag: "ol" }]],
  ["listItem", [{ tag: "li" }]],
  ["hardBreak", [{ tag: "br" }]],
  ["divider", [{ tag: "hr" }]],
  ["codeBlock", [{ tag: "pre", preserveWhitespace: "full" }]],
  ["heading", [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } }))],
]);

const MARK_PARSE = new Map<string, MarkSpec["parseDOM"]>([
  ["bold", [{ tag: "strong" }, { tag: "b" }]],
  ["italic", [{ tag: "em" }, { tag: "i" }]],
  ["strike", [{ tag: "s" }, { tag: "del" }]],
  ["underline", [{ tag: "u" }]],
  ["highlight", [{ tag: "mark" }]],
  ["code", [{ tag: "code" }]],
  [
    "link",
    [
      {
        tag: "a[href]",
        getAttrs: (el) => ({ href: el instanceof HTMLElement ? el.getAttribute("href") : null }),
      },
    ],
  ],
]);

function nodeSpec(name: string): NodeSpec {
  const node = EDITOR_SCHEMA.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`no node ${name}`);
  const spec: NodeSpec = {
    attrs: attrs(node.attrs),
    inline: node.inline,
    atom: node.atom,
    code: node.code,
    defining: node.defining,
    isolating: node.isolating,
    selectable: node.selectable,
    draggable: node.draggable,
  };
  if (node.content) spec.content = node.content;
  if (node.group) spec.group = node.group;
  if (node.marks !== null) spec.marks = node.marks;
  if (name === "text") return spec;
  const parse = PARSE.get(name);
  if (parse) spec.parseDOM = parse;
  spec.toDOM = (n): DOMOutputSpec => {
    const label = CARD_LABELS.get(name);
    if (label) {
      const title = text.catch("").parse(n.attrs.title) || label;
      return ["div", { class: "card", "data-node": name }, title];
    }
    if (name === "inlineMath")
      return ["span", { class: "math", "data-node": name }, String(n.attrs.latex ?? "")];
    if (name === "heading") return [`h${Math.min(Math.max(Number(n.attrs.level) || 1, 1), 6)}`, 0];
    if (name === "callout")
      return ["div", { class: "callout", "data-variant": String(n.attrs.variant ?? "") }, 0];
    if (name === "toggle") return ["div", { class: "toggle" }, 0];
    if (name === "taskItem")
      return ["li", { class: "task", "data-checked": n.attrs.checked ? "true" : "false" }, 0];
    if (["equation", "math", "diagram", "circuit"].includes(name))
      return ["pre", { class: "source", "data-node": name }, ["code", 0]];
    const tag = TAGS.get(name);
    if (!tag) return ["div", { "data-node": name }, 0];
    if (tag === "br" || tag === "hr") return [tag];
    return node.content ? [tag, 0] : [tag];
  };
  return spec;
}

function markSpec(name: string): MarkSpec {
  const mark = EDITOR_SCHEMA.marks.find((m) => m.name === name);
  if (!mark) throw new Error(`no mark ${name}`);
  const spec: MarkSpec = {
    attrs: attrs(mark.attrs),
    inclusive: mark.inclusive,
    spanning: mark.spanning,
  };
  if (mark.excludes !== null) spec.excludes = mark.excludes;
  if (mark.group) spec.group = mark.group;
  const parse = MARK_PARSE.get(name);
  if (parse) spec.parseDOM = parse;
  spec.toDOM = (m): DOMOutputSpec => {
    const tag = MARK_TAGS.get(name) ?? "span";
    if (name === "link") return [tag, { href: String(m.attrs.href ?? "") }, 0];
    return [tag, 0];
  };
  return spec;
}

export const pageSchema = new Schema({
  topNode: EDITOR_SCHEMA.topNode,
  nodes: Object.fromEntries(EDITOR_SCHEMA.nodes.map((n) => [n.name, nodeSpec(n.name)])),
  marks: Object.fromEntries(EDITOR_SCHEMA.marks.map((m) => [m.name, markSpec(m.name)])),
});
