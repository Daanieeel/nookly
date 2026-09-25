import { IconProgress } from "@tabler/icons-react";
import type { ReactNodeViewProps } from "@tiptap/react";
import { type CSSProperties, type KeyboardEvent, useState } from "react";
import { cn } from "@nookly/ui/lib/utils";
import { asString, type JSONAttrValue } from "./block-markdown";
import { CustomBlockFrame, RemoveRowButton, useRowKeyboard } from "./CustomBlockFrame";
import { parseProgress, type ProgressRow, serializeProgress } from "./custom-block-rows";

/// Goals tracked as a value against a target, each a filled track that turns
/// positive once the goal is reached.
export function ProgressBlock(props: ReactNodeViewProps) {
  const { node, updateAttributes } = props;
  // SAFETY: the progress node only ever writes `rows` as a string.
  const rows = parseProgress(asString(node.attrs.rows as JSONAttrValue | undefined) ?? "");
  const { containerRef, focus, onArrow, removeBlock } = useRowKeyboard(props);

  const save = (next: ProgressRow[]) => updateAttributes({ rows: serializeProgress(next) });
  const patch = (index: number, change: Partial<ProgressRow>) =>
    save(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
  const insertAfter = (index: number) => {
    const next = [...rows];
    next.splice(index + 1, 0, { label: "", value: 0, goal: rows[index]?.goal ?? 10 });
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
    if (event.key === "Enter") {
      event.preventDefault();
      insertAfter(index);
    } else if (
      event.key === "Backspace" &&
      event.currentTarget.dataset.field === "label" &&
      event.currentTarget.value === ""
    ) {
      event.preventDefault();
      remove(index);
    }
  };

  return (
    <CustomBlockFrame
      {...props}
      icon={<IconProgress />}
      titlePlaceholder="Progress"
      addLabel="Add goal"
      onAdd={() => insertAfter(rows.length - 1)}
    >
      <div ref={containerRef}>
        {rows.map((row, index) => {
          const ratio = Math.min(1, row.value / row.goal);
          const reached = row.value >= row.goal;
          return (
            <div
              key={index}
              className="group/row grid h-7 grid-cols-[minmax(6rem,14rem)_minmax(4rem,1fr)_6rem_auto] items-center gap-3"
            >
              <input
                data-row={index}
                data-field="label"
                value={row.label}
                onChange={(event) => patch(index, { label: event.target.value })}
                onKeyDown={(event) => onKeyDown(event, index)}
                placeholder="Goal"
                className="custom-block-input min-w-0"
              />
              {/* Decorative: the value and goal next to it are the readable form. */}
              <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-accent">
                <div
                  className={cn(
                    "h-full w-(--fill) rounded-full transition-all duration-200",
                    reached ? "bg-positive" : "bg-primary",
                  )}
                  // SAFETY: `--fill` only ever receives a percentage built from `ratio`;
                  // `CSSProperties` just doesn't model custom properties.
                  style={{ "--fill": `${ratio * 100}%` } as CSSProperties}
                />
              </div>
              <div className="flex items-center justify-end font-mono text-xs text-muted-foreground tabular-nums">
                <NumberCell
                  row={index}
                  field="value"
                  value={row.value}
                  min={0}
                  onCommit={(value) => patch(index, { value })}
                  onKeyDown={(event) => onKeyDown(event, index)}
                  className={cn(reached ? "text-positive" : "text-foreground")}
                />
                <span className="px-0.5">/</span>
                <NumberCell
                  row={index}
                  field="goal"
                  value={row.goal}
                  min={Number.MIN_VALUE}
                  onCommit={(goal) => patch(index, { goal })}
                  onKeyDown={(event) => onKeyDown(event, index)}
                />
              </div>
              <RemoveRowButton label="Remove Goal" onClick={() => remove(index)} />
            </div>
          );
        })}
      </div>
    </CustomBlockFrame>
  );
}

/// A number typed freely, committed only while it parses to at least `min`, so
/// an empty or half typed value never reaches the saved block.
function NumberCell({
  row,
  field,
  value,
  min,
  onCommit,
  onKeyDown,
  className,
}: {
  row: number;
  field: string;
  value: number;
  min: number;
  onCommit: (value: number) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      data-row={row}
      data-field={field}
      inputMode="decimal"
      value={draft ?? String(value)}
      onChange={(event) => {
        const text = event.target.value.replace(",", ".");
        setDraft(text);
        const parsed = Number(text);
        if (text.trim() !== "" && Number.isFinite(parsed) && parsed >= min) onCommit(parsed);
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={onKeyDown}
      spellCheck={false}
      size={Math.max(1, (draft ?? String(value)).length)}
      className={cn("custom-block-input w-auto text-right", className)}
    />
  );
}
