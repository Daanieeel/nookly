import { IconGripVertical, IconPlus } from "@tabler/icons-react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type BlockRange, BlockRangeSelection } from "./block-selection";
import { keepIfEqual, perFrame } from "./pointer-frame";
import { SLASH_ITEMS, toListItem } from "./slash-command-extension";
import { SuggestionList, type SuggestionListHandle } from "./suggestion-list";

const MENU_ITEMS = SLASH_ITEMS.map(toListItem);

/// Reserved left-gutter width in `.tiptap-content` (`src/styles.css`) — kept as a
/// constant here instead of read from CSS because it also drives the
/// elementFromPoint probe below; the two must stay in sync by hand.
export const GUTTER_WIDTH = 52;

interface HandleRect {
  top: number;
  left: number;
  height: number;
}

interface Indicator {
  top: number;
  left: number;
  width: number;
}

/// How far the pointer must travel after pressing a grip before it counts as a
/// drag instead of a click.
const DRAG_THRESHOLD_PX = 4;

/// A grip press not yet resolved into a click (select `range`) or a drag (move it).
interface PendingGrip {
  range: BlockRange;
  x: number;
  y: number;
}

interface DragSource extends BlockRange {
  elements: Set<HTMLElement>;
  /// The dragged blocks were a block selection, so they stay selected after the drop.
  selected: boolean;
}

export interface ResolvedBlock {
  start: number;
  end: number;
  node: ProseMirrorNode;
}

/// Every top-level node's DOM is a direct child of `view.dom`, whether ProseMirror
/// rendered it from `renderHTML` or a node view owns it (code blocks' React view,
/// tables' `TableView` wrapper). Node views don't copy node attrs onto their DOM,
/// so `data-block-id` can't be used to find those; structure can.
export function topLevelElement(dom: HTMLElement, el: Element | null): HTMLElement | null {
  let current = el;
  while (current && current.parentElement !== dom) current = current.parentElement;
  return current instanceof HTMLElement ? current : null;
}

/// Pinned to the block's first line, not centered on the whole block, so tall
/// blocks (tables, code blocks, long lists) keep their handle at their top.
function measureBlock(dom: HTMLElement, block: HTMLElement): HandleRect {
  const blockBox = block.getBoundingClientRect();
  const editorBox = dom.getBoundingClientRect();
  const lineHeight = Number.parseFloat(getComputedStyle(block).lineHeight);
  return {
    top: blockBox.top - editorBox.top,
    left: blockBox.left - editorBox.left,
    height: Math.min(blockBox.height, Number.isFinite(lineHeight) ? lineHeight : 24),
  };
}

/// The top-level DOM elements of every block in `range`.
function rangeElements(view: EditorView, range: BlockRange): HTMLElement[] {
  const elements: HTMLElement[] = [];
  view.state.doc.nodesBetween(range.from, range.to, (_node, pos) => {
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement) elements.push(dom);
    return false;
  });
  return elements;
}

/// The current selection when it's a block selection of more than one block.
function multiBlockSelection(view: EditorView): BlockRangeSelection | null {
  const { selection } = view.state;
  if (!(selection instanceof BlockRangeSelection)) return null;
  const first = view.state.doc.nodeAt(selection.from);
  return first && selection.from + first.nodeSize < selection.to ? selection : null;
}

export function findTopLevelBlock(view: EditorView, el: HTMLElement): ResolvedBlock | null {
  let result: ResolvedBlock | null = null;
  view.state.doc.forEach((node, offset) => {
    if (!result && view.nodeDOM(offset) === el) {
      result = { start: offset, end: offset + node.nodeSize, node };
    }
  });
  return result;
}

/// Add/drag handles for every top-level block (§ markdown editor block gutter),
/// including node view blocks like tables and code blocks. `.tiptap-content`
/// reserves `GUTTER_WIDTH` of left padding so the handles have a permanent home
/// instead of overlapping block content on hover.
///
/// Hover/drag tracking uses the same plain-mouse-event approach as
/// `TableRowHandles.tsx`, for the same reason documented there: WebKit does not
/// reliably deliver `dragover`/`drop` for a drag ending inside a ProseMirror
/// contentEditable region. Unlike the table grip (which only pokes slightly past
/// the table's edge), the gutter here is the full reserved width and has no DOM
/// node of its own to hover — so instead of a hand-measured tolerance zone, mouse
/// positions inside the gutter are re-probed at `document.elementFromPoint` just
/// past its right edge, at the same Y, to find which block "owns" that stripe.
export function BlockHandles({ editor }: { editor: Editor | null }) {
  const [handle, setHandle] = useState<HandleRect>({ top: -9999, left: -9999, height: 0 });
  const [visible, setVisible] = useState(false);
  const [indicator, setIndicator] = useState<Indicator | null>(null);
  // Snapshot of the dragged block (as markup, not a live node) shown next to the
  // cursor during a drag — `html` is a clone of markup our own schema-controlled
  // ProseMirror view already rendered, not external input.
  const [dragPreview, setDragPreview] = useState<{ html: string; x: number; y: number } | null>(
    null,
  );
  const hoveredBlockRef = useRef<HTMLElement | null>(null);
  const draggingRef = useRef(false);
  const sourceRef = useRef<DragSource | null>(null);
  const pendingGripRef = useRef<PendingGrip | null>(null);
  // Top of a multi-block selection, where its own batch drag handle sits.
  const [selectionHandle, setSelectionHandle] = useState<HandleRect | null>(null);
  // Block the "+" menu was opened from; handles stay pinned to it while open.
  const [menuBlock, setMenuBlock] = useState<HTMLElement | null>(null);
  const menuBlockRef = useRef<HTMLElement | null>(null);
  menuBlockRef.current = menuBlock;
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<SuggestionListHandle>(null);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;

    const measure = (block: HTMLElement) => measureBlock(dom, block);

    const resolveBlockAt = (clientX: number, clientY: number): HTMLElement | null => {
      const editorBox = dom.getBoundingClientRect();
      const inGutter = clientX >= editorBox.left && clientX < editorBox.left + GUTTER_WIDTH;
      const probeX = inGutter ? editorBox.left + GUTTER_WIDTH + 1 : clientX;
      return topLevelElement(dom, document.elementFromPoint(probeX, clientY));
    };

    const updateIndicatorAt = (clientX: number, clientY: number) => {
      const block = resolveBlockAt(clientX, clientY);
      if (!block || sourceRef.current?.elements.has(block)) {
        setIndicator(null);
        return;
      }
      const blockBox = block.getBoundingClientRect();
      const editorBox = dom.getBoundingClientRect();
      const before = clientY < blockBox.top + blockBox.height / 2;
      setIndicator((prev) =>
        keepIfEqual(prev, {
          top: (before ? blockBox.top : blockBox.bottom) - editorBox.top,
          left: 0,
          width: blockBox.right - editorBox.left,
        }),
      );
    };

    const beginDrag = (pending: PendingGrip, x: number, y: number) => {
      const selection = editor.state.selection;
      const elements = rangeElements(editor.view, pending.range);
      document.body.style.userSelect = "none";
      draggingRef.current = true;
      sourceRef.current = {
        ...pending.range,
        elements: new Set(elements),
        selected:
          selection instanceof BlockRangeSelection &&
          selection.from === pending.range.from &&
          selection.to === pending.range.to,
      };
      setDragPreview({ html: elements.map((el) => el.outerHTML).join(""), x, y });
    };

    const onMouseMove = (event: MouseEvent) => {
      const pending = pendingGripRef.current;
      if (pending && !draggingRef.current) {
        const moved = Math.hypot(event.clientX - pending.x, event.clientY - pending.y);
        if (moved < DRAG_THRESHOLD_PX) return;
        pendingGripRef.current = null;
        beginDrag(pending, event.clientX, event.clientY);
      }
      if (draggingRef.current) {
        updateIndicatorAt(event.clientX, event.clientY);
        setDragPreview((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev));
        return;
      }
      if (menuBlockRef.current) return;
      const block = resolveBlockAt(event.clientX, event.clientY);
      // Blocks inside a multi-block selection share the selection's own handle.
      const selection = multiBlockSelection(editor.view);
      const selected = selection && rangeElements(editor.view, selection).includes(block ?? dom);
      if (block && !selected) {
        hoveredBlockRef.current = block;
        setHandle((prev) => keepIfEqual(prev, measure(block)));
        setVisible(true);
        return;
      }
      hoveredBlockRef.current = null;
      setVisible(false);
    };

    const onMouseUp = (event: MouseEvent) => {
      // A grip press that never became a drag is a click: select the block.
      const pending = pendingGripRef.current;
      if (pending) {
        pendingGripRef.current = null;
        const { from, to } = pending.range;
        editor.view.dispatch(
          editor.state.tr.setSelection(BlockRangeSelection.create(editor.state.doc, from, to)),
        );
        editor.view.focus();
        return;
      }

      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = "";
      setIndicator(null);
      setVisible(false);
      setDragPreview(null);

      const source = sourceRef.current;
      sourceRef.current = null;
      if (!source) return;

      const targetBlock = resolveBlockAt(event.clientX, event.clientY);
      if (!targetBlock || source.elements.has(targetBlock)) return;
      const target = findTopLevelBlock(editor.view, targetBlock);
      if (!target) return;

      const targetBox = targetBlock.getBoundingClientRect();
      const before = event.clientY < targetBox.top + targetBox.height / 2;
      const insertPos = before ? target.start : target.end;

      const tr = editor.state.tr;
      const moved = tr.doc.slice(source.from, source.to).content;
      tr.delete(source.from, source.to);
      const movedPos = tr.mapping.map(insertPos);
      tr.insert(movedPos, moved);
      // A dragged block selection stays selected; otherwise the caret goes into
      // the moved block. `view.focus()` (unlike Tiptap's `focus()` command)
      // doesn't scroll: a stale selection elsewhere in the doc would otherwise
      // yank the page to it on drop.
      tr.setSelection(
        source.selected
          ? BlockRangeSelection.create(tr.doc, movedPos, movedPos + moved.size)
          : Selection.near(tr.doc.resolve(movedPos + 1)),
      );
      editor.view.dispatch(tr);
      editor.view.focus();
    };

    const onMouseMoveFrame = perFrame(onMouseMove);
    document.addEventListener("mousemove", onMouseMoveFrame);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      onMouseMoveFrame.cancel();
      document.removeEventListener("mousemove", onMouseMoveFrame);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [editor]);

  // Keeps the batch handle pinned to the first block of a multi-block selection.
  useEffect(() => {
    if (!editor) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const selection = multiBlockSelection(editor.view);
      const first = selection && editor.view.nodeDOM(selection.from);
      if (!(first instanceof HTMLElement)) {
        setSelectionHandle(null);
        return;
      }
      const next = measureBlock(editor.view.dom, first);
      setSelectionHandle((prev) => keepIfEqual(prev, next));
    };
    const update = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    update();
    editor.on("transaction", update);
    return () => {
      cancelAnimationFrame(frame);
      editor.off("transaction", update);
    };
  }, [editor]);

  useEffect(() => {
    if (!menuBlock) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuBlock(null);
      } else if (!listRef.current?.onKeyDown(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-testid="block-add-button"]')) return;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      setMenuBlock(null);
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("mousedown", onMouseDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("mousedown", onMouseDown, true);
    };
  }, [menuBlock]);

  if (!editor) return null;

  const insertBelow = (index: number) => {
    const item = SLASH_ITEMS[index];
    const block = menuBlockRef.current;
    setMenuBlock(null);
    if (!item || !block) return;
    const target = findTopLevelBlock(editor.view, block);
    if (!target) return;
    const inside = target.end + 1;
    editor
      .chain()
      .insertContentAt(target.end, { type: "paragraph" })
      .setTextSelection(inside)
      .run();
    item.run(editor, { from: inside, to: inside });
  };

  // Resolved into a click or a drag by the document listeners above.
  const onGripMouseDown = (event: React.MouseEvent) => {
    const block = hoveredBlockRef.current;
    const target = block && findTopLevelBlock(editor.view, block);
    if (!target) return;
    event.preventDefault();
    const range = { from: target.start, to: target.end };
    pendingGripRef.current = {
      range,
      x: event.clientX,
      y: event.clientY,
    };
  };

  const onSelectionGripMouseDown = (event: React.MouseEvent) => {
    const selection = multiBlockSelection(editor.view);
    if (!selection) return;
    event.preventDefault();
    const range = { from: selection.from, to: selection.to };
    pendingGripRef.current = {
      range,
      x: event.clientX,
      y: event.clientY,
    };
  };

  // SAFETY: every custom property below only ever receives a pixel length measured
  // from the live editor DOM (or the cursor) — `CSSProperties` just doesn't model
  // custom properties.
  const handleVars = {
    "--handle-top": `${handle.top}px`,
    "--handle-height": `${handle.height}px`,
    "--menu-top": `${handle.top + handle.height + 4}px`,
  } as CSSProperties;

  return (
    <>
      <div
        className={cn(
          "absolute top-(--handle-top) left-0.5 z-10 flex h-(--handle-height) items-center gap-0.5 transition-opacity",
          visible || menuBlock ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        style={handleVars}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-5 shrink-0"
              aria-label="Add block below"
              data-testid="block-add-button"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setMenuBlock((open) => (open ? null : hoveredBlockRef.current));
              }}
            >
              <IconPlus size={13} className="text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add block below</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-5 shrink-0 cursor-grab active:cursor-grabbing"
              aria-label="Drag to reorder block"
              data-testid="block-grip"
              onMouseDown={onGripMouseDown}
            >
              <IconGripVertical size={13} className="text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Drag to reorder</TooltipContent>
        </Tooltip>
      </div>
      {selectionHandle && (
        <div
          className="absolute top-(--selection-top) left-0.5 z-10 flex h-(--selection-height) w-10.5 items-center justify-end"
          // SAFETY: pixel lengths measured from the first selected block's DOM box.
          style={
            {
              "--selection-top": `${selectionHandle.top}px`,
              "--selection-height": `${selectionHandle.height}px`,
            } as CSSProperties
          }
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-5 shrink-0 cursor-grab active:cursor-grabbing"
                aria-label="Drag to move selected blocks"
                onMouseDown={onSelectionGripMouseDown}
              >
                <IconGripVertical size={13} className="text-primary" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Drag to move selected blocks</TooltipContent>
          </Tooltip>
        </div>
      )}
      {menuBlock && (
        <div ref={menuRef} className="absolute top-(--menu-top) left-0.5 z-50" style={handleVars}>
          <SuggestionList ref={listRef} items={MENU_ITEMS} onSelect={insertBelow} searchable />
        </div>
      )}
      {indicator && (
        <div
          className="pointer-events-none absolute top-(--indicator-top) left-(--indicator-left) z-10 h-0.5 w-(--indicator-width) rounded-full bg-primary"
          // SAFETY: pixel lengths measured from the drop target's DOM box.
          style={
            {
              "--indicator-top": `${indicator.top - 1}px`,
              "--indicator-left": `${indicator.left}px`,
              "--indicator-width": `${indicator.width}px`,
            } as CSSProperties
          }
        />
      )}
      {dragPreview && (
        <div
          // `px-2` (utilities layer) also overrides `.tiptap-content`'s handle-gutter
          // padding, which doesn't apply to this standalone snapshot.
          className="tiptap-content pointer-events-none fixed top-(--preview-y) left-(--preview-x) z-50 max-h-40 max-w-xs overflow-hidden rounded-md border border-border bg-popover px-2 py-1 opacity-70 shadow-lg"
          // SAFETY: pixel offsets from the cursor's client coordinates.
          style={
            {
              "--preview-x": `${dragPreview.x + 14}px`,
              "--preview-y": `${dragPreview.y + 14}px`,
            } as CSSProperties
          }
          dangerouslySetInnerHTML={{ __html: dragPreview.html }}
        />
      )}
    </>
  );
}
