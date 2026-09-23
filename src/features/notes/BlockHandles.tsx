import { IconGripVertical, IconPlus } from "@tabler/icons-react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SLASH_ITEMS, toListItem } from "./slash-command-extension";
import { SuggestionList, type SuggestionListHandle } from "./suggestion-list";

const MENU_ITEMS = SLASH_ITEMS.map(toListItem);

/// Reserved left-gutter width in `.tiptap-content` (`src/styles.css`) — kept as a
/// constant here instead of read from CSS because it also drives the
/// elementFromPoint probe below; the two must stay in sync by hand.
const GUTTER_WIDTH = 52;

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

interface ResolvedBlock {
  start: number;
  end: number;
  node: ProseMirrorNode;
}

/// Every top-level node's DOM is a direct child of `view.dom`, whether ProseMirror
/// rendered it from `renderHTML` or a node view owns it (code blocks' React view,
/// tables' `TableView` wrapper). Node views don't copy node attrs onto their DOM,
/// so `data-block-id` can't be used to find those; structure can.
function topLevelElement(dom: HTMLElement, el: Element | null): HTMLElement | null {
  let current = el;
  while (current && current.parentElement !== dom) current = current.parentElement;
  return current instanceof HTMLElement ? current : null;
}

function findTopLevelBlock(view: EditorView, el: HTMLElement): ResolvedBlock | null {
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
  const sourceBlockRef = useRef<HTMLElement | null>(null);
  // Block the "+" menu was opened from; handles stay pinned to it while open.
  const [menuBlock, setMenuBlock] = useState<HTMLElement | null>(null);
  const menuBlockRef = useRef<HTMLElement | null>(null);
  menuBlockRef.current = menuBlock;
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<SuggestionListHandle>(null);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;

    const measure = (block: HTMLElement) => {
      const blockBox = block.getBoundingClientRect();
      const editorBox = dom.getBoundingClientRect();
      // Pinned to the block's first line, not centered on the whole block, so tall
      // blocks (tables, code blocks, long lists) keep the handles at their top.
      const lineHeight = Number.parseFloat(getComputedStyle(block).lineHeight);
      return {
        top: blockBox.top - editorBox.top,
        left: blockBox.left - editorBox.left,
        height: Math.min(blockBox.height, Number.isFinite(lineHeight) ? lineHeight : 24),
      };
    };

    const resolveBlockAt = (clientX: number, clientY: number): HTMLElement | null => {
      const editorBox = dom.getBoundingClientRect();
      const inGutter = clientX >= editorBox.left && clientX < editorBox.left + GUTTER_WIDTH;
      const probeX = inGutter ? editorBox.left + GUTTER_WIDTH + 1 : clientX;
      return topLevelElement(dom, document.elementFromPoint(probeX, clientY));
    };

    const updateIndicatorAt = (clientX: number, clientY: number) => {
      const block = resolveBlockAt(clientX, clientY);
      if (!block || block === sourceBlockRef.current) {
        setIndicator(null);
        return;
      }
      const blockBox = block.getBoundingClientRect();
      const editorBox = dom.getBoundingClientRect();
      const before = clientY < blockBox.top + blockBox.height / 2;
      setIndicator({
        top: (before ? blockBox.top : blockBox.bottom) - editorBox.top,
        left: 0,
        width: blockBox.right - editorBox.left,
      });
    };

    const onMouseMove = (event: MouseEvent) => {
      if (draggingRef.current) {
        updateIndicatorAt(event.clientX, event.clientY);
        setDragPreview((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev));
        return;
      }
      if (menuBlockRef.current) return;
      const block = resolveBlockAt(event.clientX, event.clientY);
      if (block) {
        hoveredBlockRef.current = block;
        setHandle(measure(block));
        setVisible(true);
        return;
      }
      hoveredBlockRef.current = null;
      setVisible(false);
    };

    const onMouseUp = (event: MouseEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = "";
      setIndicator(null);
      setVisible(false);
      setDragPreview(null);

      const sourceBlock = sourceBlockRef.current;
      sourceBlockRef.current = null;
      if (!sourceBlock) return;

      const targetBlock = resolveBlockAt(event.clientX, event.clientY);
      if (!targetBlock || targetBlock === sourceBlock) return;

      const source = findTopLevelBlock(editor.view, sourceBlock);
      const target = findTopLevelBlock(editor.view, targetBlock);
      if (!source || !target || source.start === target.start) return;

      const targetBox = targetBlock.getBoundingClientRect();
      const before = event.clientY < targetBox.top + targetBox.height / 2;
      const insertPos = before ? target.start : target.end;

      const tr = editor.state.tr;
      tr.delete(source.start, source.end);
      const movedPos = tr.mapping.map(insertPos);
      tr.insert(movedPos, source.node);
      // Caret goes into the moved node, and `view.focus()` (unlike Tiptap's
      // `focus()` command) doesn't scroll: a stale selection elsewhere in the doc
      // would otherwise yank the page to it on drop.
      tr.setSelection(Selection.near(tr.doc.resolve(movedPos + 1)));
      editor.view.dispatch(tr);
      editor.view.focus();
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
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
    editor.chain().insertContentAt(target.end, { type: "paragraph" }).setTextSelection(inside).run();
    item.run(editor, { from: inside, to: inside });
  };

  const onGripMouseDown = (event: React.MouseEvent) => {
    const block = hoveredBlockRef.current;
    if (!block) return;
    event.preventDefault();
    document.body.style.userSelect = "none";
    draggingRef.current = true;
    sourceBlockRef.current = block;
    setDragPreview({ html: block.outerHTML, x: event.clientX, y: event.clientY });
  };

  return (
    <>
      <div
        className="absolute z-10 flex items-center gap-0.5 transition-opacity"
        style={{
          top: handle.top,
          left: 2,
          height: handle.height,
          opacity: visible || menuBlock ? 1 : 0,
          pointerEvents: visible || menuBlock ? "auto" : "none",
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-5 shrink-0 text-muted-foreground"
              aria-label="Add block below"
              data-testid="block-add-button"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setMenuBlock((open) => (open ? null : hoveredBlockRef.current));
              }}
            >
              <IconPlus size={13} />
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
              className="size-5 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
              aria-label="Drag to reorder block"
              data-testid="block-grip"
              onMouseDown={onGripMouseDown}
            >
              <IconGripVertical size={13} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Drag to reorder</TooltipContent>
        </Tooltip>
      </div>
      {menuBlock && (
        <div
          ref={menuRef}
          className="absolute z-50"
          style={{ top: handle.top + handle.height + 4, left: 2 }}
        >
          <SuggestionList ref={listRef} items={MENU_ITEMS} onSelect={insertBelow} searchable />
        </div>
      )}
      {indicator && (
        <div
          className="pointer-events-none absolute z-10 h-0.5 rounded-full bg-primary"
          style={{ top: indicator.top - 1, left: indicator.left, width: indicator.width }}
        />
      )}
      {dragPreview && (
        <div
          className="tiptap-content pointer-events-none fixed z-50 max-h-40 max-w-xs overflow-hidden rounded-md border border-border bg-popover px-2 py-1 opacity-70 shadow-lg"
          // `.tiptap-content`'s reserved handle-gutter padding-left doesn't apply
          // to this standalone snapshot — it's not the editor's own content flow.
          style={{ left: dragPreview.x + 14, top: dragPreview.y + 14, paddingLeft: 0 }}
          dangerouslySetInnerHTML={{ __html: dragPreview.html }}
        />
      )}
    </>
  );
}
