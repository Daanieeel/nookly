import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { readLayout, setOffset } from "./positions";
import { renderMindmap } from "./render";

const OUTLINE = "Root\n  A\n    A1\n    A2\n  B";

function mount(source = OUTLINE) {
  const element = document.createElement("div");
  document.body.append(element);
  return { element, drawn: renderMindmap(source, element, false) };
}
const node = (element: HTMLElement, id: string) =>
  element.querySelector<SVGGElement>(`[data-node="${id}"]`);

describe("renderMindmap", () => {
  it("draws the outline and reports no error", async () => {
    const { element, drawn } = mount();
    expect(await drawn).toBeNull();
    expect(element.querySelectorAll("[data-node]")).toHaveLength(5);
  });

  it("folds a branch on click and opens it again", async () => {
    const { element, drawn } = mount();
    await drawn;
    node(element, "0.0")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(element.querySelectorAll("[data-node]")).toHaveLength(3);
    expect(node(element, "0.0")?.getAttribute("aria-expanded")).toBe("false");
    node(element, "0.0")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(element.querySelectorAll("[data-node]")).toHaveLength(5);
  });

  it("folds with Enter and Space, and keeps the focus on the node", async () => {
    const { element, drawn } = mount();
    await drawn;
    for (const key of ["Enter", " "]) {
      node(element, "0.0")?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      expect(document.activeElement).toBe(node(element, "0.0"));
    }
    expect(element.querySelectorAll("[data-node]")).toHaveLength(5);
  });

  it("does nothing when a node without children is clicked", async () => {
    const { element, drawn } = mount();
    await drawn;
    node(element, "0.1")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(element.querySelectorAll("[data-node]")).toHaveLength(5);
  });

  it("keeps what is folded when the outline is drawn again", async () => {
    const { element, drawn } = mount();
    await drawn;
    node(element, "0.0")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await renderMindmap(`${OUTLINE}\n  C`, element, false);
    expect(element.querySelectorAll("[data-node]")).toHaveLength(4);
  });

  it("never changes the outline text", async () => {
    const source = OUTLINE;
    const { element, drawn } = mount(source);
    await drawn;
    node(element, "0.0")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(source).toBe(OUTLINE);
  });
});

/// A pointer event. jsdom has no `PointerEvent`, and the preview only reads where it was.
function pointer(type: string, x: number, y: number) {
  return new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
}

function drag(element: HTMLElement, id: string, dx: number, dy: number) {
  const target = node(element, id);
  target?.dispatchEvent(pointer("pointerdown", 100, 100));
  element.dispatchEvent(pointer("pointermove", 100 + dx / 2, 100 + dy / 2));
  element.dispatchEvent(pointer("pointermove", 100 + dx, 100 + dy));
  element.dispatchEvent(pointer("pointerup", 100 + dx, 100 + dy));
}

const topOf = (element: HTMLElement, id: string) =>
  Number(node(element, id)?.querySelector("rect")?.getAttribute("y"));

describe("dragging a node", () => {
  it("saves how far it was dragged, keyed by an id of its outline line", async () => {
    const element = document.createElement("div");
    const onChange = vi.fn();
    await renderMindmap(OUTLINE, element, false, { value: "", onChange });
    drag(element, "0.1", 40, 30);
    expect(onChange).toHaveBeenCalledTimes(1);
    const parsed = readLayout(onChange.mock.calls[0]?.[0] ?? "");
    if (parsed.kind !== "known") throw new Error("not saved");
    // One id per outline line, and only B is in the positions.
    expect(parsed.layout.ids).toHaveLength(5);
    expect(Object.values(parsed.layout.positions)).toEqual([{ x: 40, y: 30 }]);
    expect(parsed.layout.positions[parsed.layout.ids[4] ?? ""]).toEqual({ x: 40, y: 30 });
  });

  it("moves the node under the pointer while dragging, before anything is saved", async () => {
    const element = document.createElement("div");
    const onChange = vi.fn();
    await renderMindmap(OUTLINE, element, false, { value: "", onChange });
    const before = topOf(element, "0.1");
    node(element, "0.1")?.dispatchEvent(pointer("pointerdown", 100, 100));
    element.dispatchEvent(pointer("pointermove", 100, 160));
    expect(topOf(element, "0.1")).toBeCloseTo(before + 60);
    expect(onChange).not.toHaveBeenCalled();
    element.dispatchEvent(pointer("pointercancel", 100, 160));
    expect(topOf(element, "0.1")).toBeCloseTo(before);
  });

  it("does not fold a branch that was just dragged, but folds on a plain click", async () => {
    const element = document.createElement("div");
    const onChange = vi.fn();
    await renderMindmap(OUTLINE, element, false, { value: "", onChange });
    drag(element, "0.0", 50, 0);
    node(element, "0.0")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(element.querySelectorAll("[data-node]")).toHaveLength(5);
    node(element, "0.0")?.dispatchEvent(pointer("pointerdown", 100, 100));
    element.dispatchEvent(pointer("pointerup", 101, 101));
    node(element, "0.0")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(element.querySelectorAll("[data-node]")).toHaveLength(3);
  });

  it("starts from where the node already was and ignores a drag that moves nothing", async () => {
    const element = document.createElement("div");
    const onChange = vi.fn();
    let n = 0;
    const value = setOffset(OUTLINE, "", 4, { x: 10, y: 0 }, () => `id${n++}`);
    await renderMindmap(OUTLINE, element, false, { value, onChange });
    drag(element, "0.1", 5, 0);
    const parsed = readLayout(onChange.mock.calls[0]?.[0] ?? "");
    if (parsed.kind !== "known") throw new Error("not saved");
    expect(Object.values(parsed.layout.positions)).toEqual([{ x: 15, y: 0 }]);
    onChange.mockClear();
    drag(element, "0.1", 0, 0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("lays the map out with positions that were saved", async () => {
    const plain = document.createElement("div");
    await renderMindmap(OUTLINE, plain, false);
    let n = 0;
    const value = setOffset(OUTLINE, "", 4, { x: 0, y: 90 }, () => `id${n++}`);
    const moved = document.createElement("div");
    await renderMindmap(OUTLINE, moved, false, { value });
    expect(topOf(moved, "0.1") - topOf(moved, "0")).toBeCloseTo(
      topOf(plain, "0.1") - topOf(plain, "0") + 90,
    );
  });

  it("falls back to the automatic layout when the saved ids do not fit the outline", async () => {
    const plain = document.createElement("div");
    await renderMindmap(OUTLINE, plain, false);
    const moved = document.createElement("div");
    const value = JSON.stringify({ v: 1, ids: ["a", "b"], positions: { b: { x: 300, y: 300 } } });
    await renderMindmap(OUTLINE, moved, false, { value });
    expect(moved.innerHTML).toBe(plain.innerHTML);
  });

  it("cannot be dragged where there is nothing to save to", async () => {
    const element = document.createElement("div");
    await renderMindmap(OUTLINE, element, false, { value: "" });
    const before = element.innerHTML;
    drag(element, "0.1", 40, 30);
    expect(element.innerHTML).toBe(before);
  });

  it("keeps a drag going when the preview is drawn again in the middle of it", async () => {
    const element = document.createElement("div");
    const onChange = vi.fn();
    await renderMindmap(OUTLINE, element, false, { value: "", onChange });
    node(element, "0.1")?.dispatchEvent(pointer("pointerdown", 100, 100));
    // The page changed under the pointer: the block is drawn again with the same outline.
    await renderMindmap(OUTLINE, element, false, { value: "", onChange });
    element.dispatchEvent(pointer("pointermove", 140, 100));
    element.dispatchEvent(pointer("pointerup", 140, 100));
    const parsed = readLayout(onChange.mock.calls[0]?.[0] ?? "");
    if (parsed.kind !== "known") throw new Error("not saved");
    expect(Object.values(parsed.layout.positions)).toEqual([{ x: 40, y: 0 }]);
  });

  it("does not let the browser select the text of a node while it is dragged", async () => {
    const element = document.createElement("div");
    await renderMindmap(OUTLINE, element, false, { value: "", onChange: vi.fn() });
    expect(element.querySelector("svg")?.getAttribute("style")).toContain("user-select:none");
  });
});
