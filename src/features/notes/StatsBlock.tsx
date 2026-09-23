import { IconNumber } from "@tabler/icons-react";
import type { ReactNodeViewProps } from "@tiptap/react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { asString, type JSONAttrValue } from "./block-markdown";
import { CustomBlockFrame, RemoveRowButton, useRowKeyboard } from "./CustomBlockFrame";
import { MAX_STATS, parseCells, serializeCells } from "./custom-block-rows";

const COLUMNS = ["grid-cols-1", "grid-cols-2", "grid-cols-3", "grid-cols-4"];

/// Two to four headline numbers side by side, each with a label and an
/// optional hint (a GPA, credits earned, pages written).
export function StatsBlock(props: ReactNodeViewProps) {
  const { node, updateAttributes } = props;
  // SAFETY: the stats node only ever writes `rows` as a string.
  const stats = parseCells(asString(node.attrs.rows as JSONAttrValue | undefined) ?? "", 3);
  const { containerRef, focus, removeBlock } = useRowKeyboard(props);

  const save = (next: string[][]) => updateAttributes({ rows: serializeCells(next) });
  const patch = (index: number, cell: number, text: string) =>
    save(
      stats.map((stat, i) => (i === index ? stat.map((c, j) => (j === cell ? text : c)) : stat)),
    );
  const insertAfter = (index: number) => {
    if (stats.length >= MAX_STATS) return;
    const next = [...stats];
    next.splice(index + 1, 0, ["", "", ""]);
    save(next);
    focus(index + 1, "value");
  };
  const remove = (index: number) => {
    if (stats.length === 1) return removeBlock();
    save(stats.filter((_, i) => i !== index));
    focus(Math.max(0, index - 1), "value");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === "Enter") {
      event.preventDefault();
      insertAfter(index);
    } else if (
      event.key === "Backspace" &&
      event.currentTarget.dataset.field === "value" &&
      event.currentTarget.value === "" &&
      !stats[index][1]
    ) {
      event.preventDefault();
      remove(index);
    }
  };

  const field = (index: number, cell: number, name: string) => ({
    "data-row": index,
    "data-field": name,
    value: stats[index][cell],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      patch(index, cell, event.target.value),
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => onKeyDown(event, index),
  });

  return (
    <CustomBlockFrame
      {...props}
      icon={<IconNumber />}
      titlePlaceholder="Stats"
      addLabel="Add stat"
      onAdd={stats.length < MAX_STATS ? () => insertAfter(stats.length - 1) : undefined}
    >
      <div ref={containerRef} className={cn("grid gap-y-3", COLUMNS[stats.length - 1])}>
        {stats.map(([, , hint], index) => (
          <div
            key={index}
            className={cn(
              "group/row relative flex min-w-0 flex-col px-3 py-1",
              index > 0 && "border-l border-border",
            )}
          >
            <input
              {...field(index, 0, "value")}
              placeholder="0"
              spellCheck={false}
              className="custom-block-input font-heading text-2xl font-semibold tracking-tight tabular-nums"
            />
            <input
              {...field(index, 1, "label")}
              placeholder="Label"
              className="custom-block-input text-xs text-muted-foreground"
            />
            <input
              {...field(index, 2, "hint")}
              placeholder="Hint"
              className={cn(
                "custom-block-input text-xs text-muted-foreground/70",
                !hint && "hidden group-focus-within/row:block",
              )}
            />
            <span className="absolute top-0 right-0">
              <RemoveRowButton label="Remove Stat" onClick={() => remove(index)} />
            </span>
          </div>
        ))}
      </div>
    </CustomBlockFrame>
  );
}
