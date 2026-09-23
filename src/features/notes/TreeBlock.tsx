import { IconBinaryTree } from "@tabler/icons-react";
import type { ReactNodeViewProps } from "@tiptap/react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { asString, type JSONAttrValue } from "./block-markdown";
import { CustomBlockFrame, RemoveRowButton, useRowKeyboard } from "./CustomBlockFrame";
import {
  normalizeDepths,
  parseTree,
  serializeTree,
  treeConnectors,
  type TreeRow,
} from "./custom-block-rows";

/// One column of connector lines per level, as wide as this.
const LEVEL_WIDTH = "w-5";

/// A nested outline drawn with branch lines: folders, a thesis outline, an org
/// chart. Tab and Shift+Tab move a row and everything under it a level in or out.
export function TreeBlock(props: ReactNodeViewProps) {
  const { node, updateAttributes } = props;
  // SAFETY: the tree node only ever writes `rows` as a string.
  const rows = parseTree(asString(node.attrs.rows as JSONAttrValue | undefined) ?? "");
  const connectors = treeConnectors(rows);
  const { containerRef, focus, onArrow, removeBlock } = useRowKeyboard(props);

  const save = (next: TreeRow[]) => updateAttributes({ rows: serializeTree(next) });

  /// The row and the rows nested under it.
  const subtreeEnd = (index: number) => {
    let end = index + 1;
    while (end < rows.length && rows[end].depth > rows[index].depth) end++;
    return end;
  };

  const shift = (index: number, by: 1 | -1) => {
    const row = rows[index];
    const limit = by > 0 ? (rows[index - 1]?.depth ?? -1) + 1 : 0;
    if (by > 0 ? row.depth >= limit : row.depth <= limit) return;
    const end = subtreeEnd(index);
    save(
      normalizeDepths(
        rows.map((r, i) => (i >= index && i < end ? { ...r, depth: r.depth + by } : r)),
      ),
    );
    focus(index, "label");
  };

  /// A row with children gets its new row as the first child, like an outliner.
  const insertAfter = (index: number) => {
    const row = rows[index];
    const hasChildren = rows[index + 1] !== undefined && rows[index + 1].depth > row.depth;
    const next = [...rows];
    next.splice(index + 1, 0, { depth: row.depth + (hasChildren ? 1 : 0), label: "" });
    save(next);
    focus(index + 1, "label");
  };

  const remove = (index: number) => {
    if (rows.length === 1) return removeBlock();
    save(rows.filter((_, i) => i !== index));
    focus(Math.max(0, index - 1), "label");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (onArrow(event, index, rows.length)) return;
    if (event.key === "Tab") {
      event.preventDefault();
      shift(index, event.shiftKey ? -1 : 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      insertAfter(index);
    } else if (event.key === "Backspace" && event.currentTarget.value === "") {
      event.preventDefault();
      if (rows[index].depth > 0) shift(index, -1);
      else remove(index);
    }
  };

  return (
    <CustomBlockFrame
      {...props}
      icon={<IconBinaryTree />}
      titlePlaceholder="Tree"
      addLabel="Add item"
      onAdd={() => {
        const last = rows.length - 1;
        save([...rows, { depth: rows[last]?.depth ?? 0, label: "" }]);
        focus(last + 1, "label");
      }}
    >
      <div ref={containerRef}>
        {rows.map((row, index) => (
          <div key={index} className="group/row flex h-7 items-stretch">
            {connectors[index].through.map((through, level) => (
              <span key={level} aria-hidden className={cn("relative shrink-0", LEVEL_WIDTH)}>
                {through && (
                  <span className="absolute inset-y-0 left-2 w-px bg-muted-foreground/35" />
                )}
              </span>
            ))}
            {row.depth > 0 && (
              <span aria-hidden className={cn("relative shrink-0", LEVEL_WIDTH)}>
                <span
                  className={cn(
                    "absolute top-0 left-2 w-px bg-muted-foreground/35",
                    connectors[index].last ? "h-1/2" : "h-full",
                  )}
                />
                <span className="absolute top-1/2 right-1 left-2 h-px bg-muted-foreground/35" />
              </span>
            )}
            <input
              data-row={index}
              data-field="label"
              value={row.label}
              onChange={(event) =>
                save(rows.map((r, i) => (i === index ? { ...r, label: event.target.value } : r)))
              }
              onKeyDown={(event) => onKeyDown(event, index)}
              placeholder={index === 0 ? "Item, Tab to nest" : "Item"}
              className={cn("custom-block-input min-w-0 flex-1", row.depth === 0 && "font-medium")}
            />
            <span className="flex items-center">
              <RemoveRowButton label="Remove Item" onClick={() => remove(index)} />
            </span>
          </div>
        ))}
      </div>
    </CustomBlockFrame>
  );
}
