/// One line of the outline and the lines nested under it.
export interface MindNode {
  text: string;
  children: MindNode[];
  /// Where the node sits in the outline text, counting from 0.
  line: number;
}

/// A mind map read from its outline. The outline text is the only source of truth:
/// every export, the CLI and the layout read it, so the same text always gives the
/// same map.
export interface Mindmap {
  roots: MindNode[];
}

/// A tab counts as this many spaces. Only the order of the indents matters, not their size.
const TAB_WIDTH = 4;

/// Reads an indented list, one node per line. A node is a child of the closest line
/// above it that is indented less; blank lines and a leading `-`, `*` or `+` marker
/// are ignored. Nothing in an outline is an error, so any text draws something.
export function parseMindmap(source: string): Mindmap {
  const roots: MindNode[] = [];
  /// The open branch: each node with the indent it was written at, shallowest first.
  const path: { indent: number; node: MindNode }[] = [];
  source.split(/\r?\n/).forEach((raw, line) => {
    const match = /^([ \t]*)(?:[-*+](?:[ \t]+|$))?(.*)$/.exec(raw);
    const text = match?.[2]?.trim() ?? "";
    if (!match || !text) return;
    const indent = [...(match[1] ?? "")].reduce((sum, c) => sum + (c === "\t" ? TAB_WIDTH : 1), 0);
    while (path.length > 0 && (path[path.length - 1]?.indent ?? 0) >= indent) path.pop();
    const node: MindNode = { text, children: [], line };
    const parent = path[path.length - 1]?.node;
    (parent ? parent.children : roots).push(node);
    path.push({ indent, node });
  });
  return { roots };
}
