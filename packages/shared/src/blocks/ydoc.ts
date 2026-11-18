import * as Y from "yjs";
import { z } from "zod";
import type { Block } from "./types.ts";
import {
  type JSONAttrValue,
  type JSONNode,
  blockToNode,
  nodeToBlockInput,
  type BlockInput,
} from "./markdown.ts";

/// A page body as a Yjs document, the way TipTap's Collaboration extension (through
/// y-tiptap) stores it: an XML fragment named `default` with one element per node,
/// its attributes as element attributes (null ones left out), and each run of text
/// as one `XmlText` whose formatting attributes are the marks, `{ [mark]: attrs }`.
/// Written here without a ProseMirror schema, so the server and the phone can read
/// and write pages without an editor. `ydoc.test.ts` in the frontend checks it
/// against the real editor.

export const PAGE_FRAGMENT = "default";

/// The schema version a page document was written with. A client whose editor
/// schema is older opens a newer document read only, so y-prosemirror never drops
/// nodes it doesn't know (DECISIONS.md D6). Bump when a node or mark is added.
export const PAGE_SCHEMA_VERSION = 1;
const META = "meta";

type Attrs = Record<string, JSONAttrValue>;
/// A text run's formatting in Yjs: each mark by name, with its attributes.
type MarkAttributes = Record<string, Attrs>;

function markAttributes(node: JSONNode) {
  return Object.fromEntries(
    (node.marks ?? []).map((mark) => [mark.type, mark.attrs ?? {}]),
  ) satisfies MarkAttributes;
}

function element(node: JSONNode): Y.XmlElement {
  const el = new Y.XmlElement(node.type);
  for (const [key, value] of Object.entries(node.attrs ?? {})) {
    if (value === null || value === undefined) continue;
    // SAFETY: Yjs stores any JSON value as an attribute; its typing only says string.
    el.setAttribute(key, value as string);
  }
  const children = contentTypes(node.content ?? []);
  if (children.length > 0) el.insert(0, children);
  return el;
}

/// Consecutive text nodes become one `XmlText`, everything else an element.
function contentTypes(nodes: JSONNode[]): (Y.XmlText | Y.XmlElement)[] {
  const out: (Y.XmlText | Y.XmlElement)[] = [];
  let run: JSONNode[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const text = new Y.XmlText();
    text.applyDelta(
      run.map((n) => {
        const attributes = markAttributes(n);
        return Object.keys(attributes).length > 0
          ? { insert: n.text ?? "", attributes }
          : { insert: n.text ?? "" };
      }),
    );
    out.push(text);
    run = [];
  };
  for (const node of nodes) {
    if (node.type === "text") run.push(node);
    else {
      flush();
      out.push(element(node));
    }
  }
  flush();
  return out;
}

/// Puts `nodes` (top level page nodes) at `index` of the page fragment.
export function insertNodes(fragment: Y.XmlFragment, index: number, nodes: JSONNode[]) {
  const types = nodes.map(element);
  if (types.length > 0) fragment.insert(index, types);
}

function readText(text: Y.XmlText): JSONNode[] {
  return text.toDelta().map((d: { insert: string; attributes?: Record<string, Attrs> }) => {
    const node: JSONNode = { type: "text", text: d.insert };
    if (d.attributes) {
      node.marks = Object.entries(d.attributes).map(([name, attrs]) => {
        // An overlapping mark is stored as `<name>--<hash>`.
        const type = name.replace(/--[a-zA-Z0-9+/=]{8}$/, "");
        return Object.keys(attrs ?? {}).length > 0 ? { type, attrs } : { type };
      });
    }
    return node;
  });
}

function readElement(el: Y.XmlElement): JSONNode {
  const node: JSONNode = { type: el.nodeName };
  // SAFETY: page attributes are only ever written as JSON values (strings, numbers,
  // booleans), by the editor or by `element` above.
  const attrs = el.getAttributes() as Attrs;
  if (Object.keys(attrs).length > 0) node.attrs = attrs;
  const content = readChildren(el.toArray());
  if (content.length > 0) node.content = content;
  return node;
}

function readChildren(items: (Y.XmlElement | Y.XmlText | Y.XmlHook)[]): JSONNode[] {
  return items.flatMap((item) => {
    if (item instanceof Y.XmlText) return readText(item);
    if (item instanceof Y.XmlElement) return [readElement(item)];
    return [];
  });
}

/// The page's top level nodes, as ProseMirror JSON.
export function readNodes(fragment: Y.XmlFragment): JSONNode[] {
  return readChildren(fragment.toArray());
}

/// A new page document holding `blocks`, in order: how a page that was only rows
/// becomes a document, once, on the server.
export function seedPage(doc: Y.Doc, blocks: Block[]) {
  doc.transact(() => {
    const fragment = doc.getXmlFragment(PAGE_FRAGMENT);
    const ordered = [...blocks].sort((a, b) => a.position - b.position);
    insertNodes(
      fragment,
      0,
      ordered.length > 0 ? ordered.map(blockToNode) : [{ type: "paragraph" }],
    );
    doc.getMap(META).set("schema", PAGE_SCHEMA_VERSION);
  });
}

/// The schema version a document was written with (`PAGE_SCHEMA_VERSION`).
export function pageSchemaVersion(doc: Y.Doc): number {
  const version = z.number().int().safeParse(doc.getMap(META).get("schema"));
  return version.success ? version.data : PAGE_SCHEMA_VERSION;
}

/// The page's blocks as rows: each top level node with its block id, in order.
/// Nodes without an id (which the editor never makes) are left out.
export function pageBlocks(doc: Y.Doc): (BlockInput & { position: number })[] {
  return readNodes(doc.getXmlFragment(PAGE_FRAGMENT))
    .map(nodeToBlockInput)
    .filter((input): input is BlockInput => input !== null)
    .map((input, position) => ({ ...input, position }));
}

/// Replaces, inserts or removes one block of a page document, for a block row
/// changed outside an editor (the CLI, an import, an older device). `block` null
/// removes it. Text inside other blocks is untouched.
export function applyBlock(doc: Y.Doc, blockId: string, block: Block | null) {
  doc.transact(() => {
    const fragment = doc.getXmlFragment(PAGE_FRAGMENT);
    const items = fragment.toArray();
    const index = items.findIndex(
      (item) => item instanceof Y.XmlElement && item.getAttribute("blockId") === blockId,
    );
    if (index >= 0 && block) {
      // Already the same: replacing it would only cut into someone's typing.
      const current = items[index];
      const same =
        current instanceof Y.XmlElement &&
        JSON.stringify(nodeToBlockInput(readElement(current))) ===
          JSON.stringify(nodeToBlockInput(blockToNode(block)));
      if (same) return;
    }
    if (index >= 0) fragment.delete(index, 1);
    if (!block) return;
    const at = index >= 0 ? index : Math.min(Math.max(0, block.position), fragment.length);
    insertNodes(fragment, at, [blockToNode(block)]);
  });
}
