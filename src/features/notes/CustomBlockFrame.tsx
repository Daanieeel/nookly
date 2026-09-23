import { IconPlus, IconX } from "@tabler/icons-react";
import { Selection } from "@tiptap/pm/state";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { type KeyboardEvent, type ReactNode, useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { asString, type JSONAttrValue } from "./block-markdown";

/// Shared chrome of the row based custom blocks (timeline, progress, tree): the
/// same header as a code block, with the block's icon and an editable title, over
/// a body of rows and an "add row" footer.
export function CustomBlockFrame({
  icon,
  node,
  updateAttributes,
  titlePlaceholder,
  addLabel,
  onAdd,
  children,
}: Pick<ReactNodeViewProps, "node" | "updateAttributes"> & {
  icon: ReactNode;
  titlePlaceholder: string;
  addLabel: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  // SAFETY: the custom block nodes only ever write `title` as `string | null`.
  const title = asString(node.attrs.title as JSONAttrValue | undefined) ?? "";
  return (
    <NodeViewWrapper className="custom-block my-1">
      <div className="custom-block-header" contentEditable={false}>
        <span className="flex shrink-0 text-muted-foreground [&_svg]:size-3.5">{icon}</span>
        <input
          value={title}
          onChange={(event) => updateAttributes({ title: event.target.value || null })}
          placeholder={titlePlaceholder}
          spellCheck={false}
          className="custom-block-title"
        />
      </div>
      <div className="custom-block-body" contentEditable={false}>
        {children}
        <Button variant="ghost" size="sm" onClick={onAdd} className="mt-1 h-6 gap-1 px-1.5">
          <IconPlus className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{addLabel}</span>
        </Button>
      </div>
    </NodeViewWrapper>
  );
}

export function RemoveRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <span className="flex shrink-0 opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="iconSm"
            onClick={onClick}
            aria-label={label}
            className="size-6"
          >
            <IconX className="size-3.5 text-muted-foreground" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </span>
  );
}

/// Keyboard movement between the inputs of a row based block. Every input is
/// tagged `data-row` / `data-field`; `focus` targets one, and a focus request made
/// before the row exists (a row just added) lands once it renders.
export function useRowKeyboard({
  editor,
  getPos,
  node,
  deleteNode,
}: Pick<ReactNodeViewProps, "editor" | "getPos" | "node" | "deleteNode">) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<{ row: number; field: string; caret: "start" | "end" } | null>(null);

  const tryFocus = () => {
    const pending = pendingRef.current;
    if (!pending) return;
    const input = containerRef.current?.querySelector<HTMLInputElement>(
      `input[data-row="${pending.row}"][data-field="${pending.field}"]`,
    );
    if (!input) return;
    pendingRef.current = null;
    input.focus();
    const at = pending.caret === "start" ? 0 : input.value.length;
    input.setSelectionRange(at, at);
  };

  useLayoutEffect(tryFocus);

  const focus = (row: number, field: string, caret: "start" | "end" = "end") => {
    pendingRef.current = { row, field, caret };
    tryFocus();
  };

  /// Puts the editor's cursor just before or after this block.
  const leave = (direction: -1 | 1) => {
    const pos = getPos();
    if (pos === undefined) return;
    const { state } = editor.view;
    const target = direction < 0 ? pos : pos + node.nodeSize;
    const selection = Selection.near(state.doc.resolve(target), direction);
    editor.view.dispatch(state.tr.setSelection(selection));
    editor.view.focus();
  };

  /// Arrow keys move to the same field one row up or down, and out of the block
  /// past its first or last row.
  const onArrow = (event: KeyboardEvent<HTMLInputElement>, row: number, rowCount: number) => {
    const field = event.currentTarget.dataset.field ?? "";
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (row === 0) leave(-1);
      else focus(row - 1, field);
      return true;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (row === rowCount - 1) leave(1);
      else focus(row + 1, field);
      return true;
    }
    return false;
  };

  /// Backspace in the last empty row of the block removes the block itself.
  const removeBlock = () => {
    leave(-1);
    deleteNode();
  };

  return { containerRef, focus, onArrow, removeBlock };
}
