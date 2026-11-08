import type { PreviewState } from "../SourceBlock";
import { drawMindmap } from "./draw";
import { layoutMindmap } from "./layout";
import { parseMindmap } from "./parse";
import { type MindOffset, newId, offsetsFor, setOffset } from "./positions";

/// Which nodes each preview has folded. It is only what the preview shows: the outline
/// text never changes, and every export draws the whole map.
const folded = new WeakMap<HTMLElement, Set<string>>();

/// A pointer moves this far, in pixels, before a press on a node is a drag and not a click.
const DRAG_THRESHOLD = 4;

/// The press in progress on a preview and whether the click that ends a drag is still to come.
/// Kept per element, so drawing again (the page changed under the pointer) does not drop it.
const gestures = new WeakMap<HTMLElement, { press: Press | null; dragged: boolean }>();

/// A node a press started on, until it is let go.
interface Press {
  id: string;
  line: number;
  x: number;
  y: number;
  /// Where the node stood before the press.
  from: MindOffset;
  /// Picture pixels per screen pixel, since the picture shrinks to fit its block.
  scale: number;
  dragging: boolean;
  to: MindOffset;
}

/// Draws the mind map block's outline into `element`, resolving to what is wrong with the
/// outline, or `null` when it drew (no outline is wrong). A node with children folds and
/// opens on a click, Enter or Space. With somewhere to save to (`state.onChange`), a node
/// can be dragged, and its subtree goes with it.
export function renderMindmap(
  source: string,
  element: HTMLElement,
  dark: boolean,
  state?: PreviewState,
): Promise<string | null> {
  const map = parseMindmap(source);
  let collapsed = folded.get(element);
  if (!collapsed) folded.set(element, (collapsed = new Set()));
  const shown = collapsed;
  const saved = offsetsFor(source, state?.value ?? "");
  const save = state?.onChange;

  const draw = (offsets: ReadonlyMap<number, MindOffset> = saved) => {
    element.innerHTML = drawMindmap(layoutMindmap(map, shown, offsets), dark, true);
  };
  const nodeAt = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<SVGElement>("[data-node]") : null;
  const toggle = (target: EventTarget | null): string | null => {
    const node = nodeAt(target);
    const id = node?.dataset.node;
    if (!id || node?.getAttribute("role") !== "button") return null;
    if (!shown.delete(id)) shown.add(id);
    draw();
    return id;
  };

  let gesture = gestures.get(element);
  if (!gesture) gestures.set(element, (gesture = { press: null, dragged: false }));
  const current = gesture;

  // Handlers are assigned, not added, so drawing again does not stack a second one.
  element.onpointerdown = (event) => {
    const node = nodeAt(event.target);
    if (!save || !node || event.button !== 0) return;
    const svg = element.querySelector("svg");
    const width = Number(svg?.getAttribute("width"));
    const box = svg?.getBoundingClientRect().width ?? 0;
    const line = Number(node.dataset.line);
    const from = saved.get(line) ?? { x: 0, y: 0 };
    current.press = {
      id: node.dataset.node ?? "",
      line,
      x: event.clientX,
      y: event.clientY,
      from,
      scale: width > 0 && box > 0 ? width / box : 1,
      dragging: false,
      to: from,
    };
  };
  element.onpointermove = (event) => {
    const { press } = current;
    if (!press) return;
    const dx = (event.clientX - press.x) * press.scale;
    const dy = (event.clientY - press.y) * press.scale;
    if (!press.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD * press.scale) return;
    if (!press.dragging) {
      press.dragging = true;
      // Keeps the moves coming when the pointer leaves the node, or the block.
      element.setPointerCapture?.(event.pointerId);
    }
    press.to = { x: press.from.x + dx, y: press.from.y + dy };
    draw(new Map(saved).set(press.line, press.to));
  };
  element.onpointerup = () => {
    const done = current.press;
    current.press = null;
    if (!done?.dragging) return;
    // The click that follows a drag arrives at once, before this has time to reset.
    current.dragged = true;
    setTimeout(() => (current.dragged = false), 0);
    const next = setOffset(source, state?.value ?? "", done.line, done.to, newId);
    if (next !== (state?.value ?? "")) save?.(next);
    else draw();
  };
  element.onpointercancel = () => {
    const wasDragging = current.press?.dragging;
    current.press = null;
    if (wasDragging) draw();
  };
  element.onclick = (event) => {
    if (current.dragged) {
      current.dragged = false;
      return;
    }
    toggle(event.target);
  };
  element.onkeydown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const id = toggle(event.target);
    if (!id) return;
    event.preventDefault();
    element.querySelector<SVGElement>(`[data-node="${id}"]`)?.focus();
  };
  draw();
  return Promise.resolve(null);
}
