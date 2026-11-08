import type { MindmapLayout, PlacedNode } from "./layout";

/// The branches' colors in order, shades for a light and a dark page.
const COLORS = {
  light: ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#db2777", "#0891b2"],
  dark: ["#60a5fa", "#f87171", "#4ade80", "#a78bfa", "#fb923c", "#f472b6", "#22d3ee"],
};

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const n = (value: number) => (Math.round(value * 10) / 10).toString();

/// The left or right edge of a node.
const edgeOf = (node: PlacedNode, side: "left" | "right") =>
  side === "right" ? node.x + node.width : node.x;

/// The mind map as an SVG string: a node for each visible line and a curve from each node
/// to its children, every top level branch in its own color. Text takes the color of
/// the text around it. With `interactive`, a node with children also shows a handle to fold it.
export function drawMindmap(layout: MindmapLayout, dark: boolean, interactive = false): string {
  if (layout.nodes.length === 0) return "";
  const palette = dark ? COLORS.dark : COLORS.light;
  const color = (branch: number) => palette[branch % palette.length] ?? "currentColor";
  const page = `var(--background, ${dark ? "#0a0a0a" : "#ffffff"})`;
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(layout.width)} ${n(layout.height)}" ` +
      `width="${n(layout.width)}" height="${n(layout.height)}" ` +
      `style="max-width:100%;height:auto${interactive ? ";user-select:none;-webkit-user-select:none" : ""}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="13" fill="none">`,
  ];

  // A folded node says how many it hides; an open one, in the app, offers to fold. The
  // handle belongs to the node, so a click on it folds too.
  const handle = (node: PlacedNode): string => {
    if (!node.expandable || (!node.collapsed && (!interactive || node.root))) return "";
    const away = node.side === "right" ? 1 : -1;
    const c = node.root ? "currentColor" : color(node.branch);
    const label = `+${node.hiddenCount}`;
    const width = node.collapsed ? Math.max(18, label.length * 7 + 8) : 14;
    // Just off the edge the node's children hang from.
    const left = away === 1 ? node.x + node.width + 4 : node.x - 4 - width;
    const middle = left + width / 2;
    return (
      `<g data-fold="">` +
      `<rect x="${n(left)}" y="${n(node.y - 7)}" width="${n(width)}" height="14" rx="7" style="fill: ${page}" stroke="${c}" stroke-width="1.25"/>` +
      (node.collapsed
        ? `<text x="${n(middle)}" y="${n(node.y + 3.5)}" text-anchor="middle" font-size="10" fill="currentColor" stroke="none">${label}</text>`
        : `<line x1="${n(middle - 3)}" y1="${n(node.y)}" x2="${n(middle + 3)}" y2="${n(node.y)}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`) +
      `</g>`
    );
  };

  // Connectors first, so nodes and handles sit over their ends.
  for (const edge of layout.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    // The connector runs between the edges that face each other, so a node dragged across
    // its parent is still joined sensibly.
    const toRight = to.x + to.width / 2 >= from.x + from.width / 2;
    const startX = edgeOf(from, toRight ? "right" : "left");
    const endX = edgeOf(to, toRight ? "left" : "right");
    const mid = (startX + endX) / 2;
    const width = Math.max(1.5, 3 - to.depth * 0.5);
    out.push(
      `<path data-edge="" d="M${n(startX)},${n(from.y)}C${n(mid)},${n(from.y)} ${n(mid)},${n(to.y)} ${n(endX)},${n(to.y)}" ` +
        `stroke="${color(to.branch)}" stroke-width="${n(width)}" stroke-linecap="round"/>`,
    );
  }

  for (const node of layout.nodes) {
    const c = node.root ? "currentColor" : color(node.branch);
    const cx = node.x + node.width / 2;
    const attrs = [`data-node="${node.id}"`, `data-line="${node.line}"`];
    if (node.expandable) {
      attrs.push(
        `tabindex="0"`,
        `role="button"`,
        `aria-expanded="${!node.collapsed}"`,
        `aria-label="${escapeXml(node.text)}${node.collapsed ? `, ${node.hiddenCount} hidden` : ""}"`,
        `style="cursor:pointer"`,
      );
    }
    const box = node.root
      ? `<rect x="${n(node.x)}" y="${n(node.y - node.height / 2)}" width="${n(node.width)}" height="${n(node.height)}" rx="${n(node.height / 2)}" fill="currentColor"/>`
      : `<rect x="${n(node.x)}" y="${n(node.y - node.height / 2)}" width="${n(node.width)}" height="${n(node.height)}" rx="8" fill="${c}" fill-opacity="0.14" stroke="${c}" stroke-width="1.5"/>`;
    const text = node.root
      ? `<text x="${n(cx)}" y="${n(node.y + 5)}" text-anchor="middle" font-size="14" font-weight="600" stroke="none" style="fill: ${page}">${escapeXml(node.label)}</text>`
      : `<text x="${n(cx)}" y="${n(node.y + 4.5)}" text-anchor="middle" fill="currentColor" stroke="none">${escapeXml(node.label)}</text>`;
    const title = node.label === node.text ? "" : `<title>${escapeXml(node.text)}</title>`;
    out.push(`<g ${attrs.join(" ")}>${title}${box}${text}${handle(node)}</g>`);
  }

  out.push(`</svg>`);
  return out.join("");
}
