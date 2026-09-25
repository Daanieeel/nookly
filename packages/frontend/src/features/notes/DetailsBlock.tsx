import { IconListDetails } from "@tabler/icons-react";
import type { ReactNodeViewProps } from "@tiptap/react";
import type { KeyboardEvent } from "react";
import { asString, type JSONAttrValue } from "./block-markdown";
import { CustomBlockFrame, RemoveRowButton, useRowKeyboard } from "./CustomBlockFrame";
import { parseCells, serializeCells } from "./custom-block-rows";

/// Facts at a glance as aligned label and value pairs: a course's room and
/// office hours, a contact, a trip.
export function DetailsBlock(props: ReactNodeViewProps) {
  const { node, updateAttributes } = props;
  // SAFETY: the details node only ever writes `rows` as a string.
  const rows = parseCells(asString(node.attrs.rows as JSONAttrValue | undefined) ?? "", 2);
  const { containerRef, focus, onArrow, removeBlock } = useRowKeyboard(props);

  const save = (next: string[][]) => updateAttributes({ rows: serializeCells(next) });
  const patch = (index: number, cell: number, text: string) =>
    save(rows.map((row, i) => (i === index ? row.map((c, j) => (j === cell ? text : c)) : row)));
  const insertAfter = (index: number) => {
    const next = [...rows];
    next.splice(index + 1, 0, ["", ""]);
    save(next);
    focus(index + 1, "label");
  };
  const remove = (index: number) => {
    if (rows.length === 1) return removeBlock();
    save(rows.filter((_, i) => i !== index));
    focus(Math.max(0, index - 1), "value");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (onArrow(event, index, rows.length)) return;
    const field = event.currentTarget.dataset.field;
    if (event.key === "Enter") {
      event.preventDefault();
      insertAfter(index);
    } else if (event.key === "Backspace" && event.currentTarget.value === "") {
      if (field === "value") {
        event.preventDefault();
        focus(index, "label");
      } else if (!rows[index][1]) {
        event.preventDefault();
        remove(index);
      }
    }
  };

  return (
    <CustomBlockFrame
      {...props}
      icon={<IconListDetails />}
      titlePlaceholder="Details"
      addLabel="Add detail"
      onAdd={() => insertAfter(rows.length - 1)}
    >
      <div ref={containerRef} className="divide-y divide-border">
        {rows.map(([label, value], index) => (
          <div
            key={index}
            className="group/row grid h-8 grid-cols-[minmax(6rem,12rem)_1fr_auto] items-center gap-3"
          >
            <input
              data-row={index}
              data-field="label"
              value={label}
              onChange={(event) => patch(index, 0, event.target.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              placeholder="Label"
              className="custom-block-input min-w-0 text-muted-foreground"
            />
            <input
              data-row={index}
              data-field="value"
              value={value}
              onChange={(event) => patch(index, 1, event.target.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              placeholder="Value"
              className="custom-block-input min-w-0"
            />
            <RemoveRowButton label="Remove Detail" onClick={() => remove(index)} />
          </div>
        ))}
      </div>
    </CustomBlockFrame>
  );
}
