import { IconTimeline } from "@tabler/icons-react";
import type { ReactNodeViewProps } from "@tiptap/react";
import type { KeyboardEvent } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { asString, type JSONAttrValue } from "./block-markdown";
import { CustomBlockFrame, RemoveRowButton, useRowKeyboard } from "./CustomBlockFrame";
import {
  parseTimeline,
  serializeTimeline,
  type TimelineRow,
  type TimelineState,
} from "./custom-block-rows";

const NEXT_STATE = { done: "now", now: "next", next: "done" } satisfies Record<
  TimelineState,
  TimelineState
>;
const STATE_ACTION = {
  done: "Mark as Now",
  now: "Mark as Next",
  next: "Mark as Done",
} satisfies Record<TimelineState, string>;

/// Dated events on a rail. The dot marks where the event stands: filled once
/// done, ringed in the accent for now, hollow for what comes next.
export function TimelineBlock(props: ReactNodeViewProps) {
  const { node, updateAttributes } = props;
  // SAFETY: the timeline node only ever writes `rows` as a string.
  const rows = parseTimeline(asString(node.attrs.rows as JSONAttrValue | undefined) ?? "");
  const { containerRef, focus, onArrow, removeBlock } = useRowKeyboard(props);

  const save = (next: TimelineRow[]) => updateAttributes({ rows: serializeTimeline(next) });
  const patch = (index: number, change: Partial<TimelineRow>) =>
    save(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
  const insertAfter = (index: number) => {
    const next = [...rows];
    next.splice(index + 1, 0, { date: "", label: "", state: "done" });
    save(next);
    focus(index + 1, "date");
  };
  const remove = (index: number) => {
    if (rows.length === 1) return removeBlock();
    save(rows.filter((_, i) => i !== index));
    focus(Math.max(0, index - 1), "label");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (onArrow(event, index, rows.length)) return;
    const row = rows[index];
    if (event.key === "Enter") {
      event.preventDefault();
      insertAfter(index);
    } else if (event.key === "Backspace" && event.currentTarget.value === "") {
      const field = event.currentTarget.dataset.field;
      if (field === "label") {
        event.preventDefault();
        focus(index, "date");
      } else if (!row.label) {
        event.preventDefault();
        remove(index);
      }
    }
  };

  return (
    <CustomBlockFrame
      {...props}
      icon={<IconTimeline />}
      titlePlaceholder="Timeline"
      addLabel="Add event"
      onAdd={() => insertAfter(rows.length - 1)}
    >
      <div ref={containerRef}>
        {rows.map((row, index) => (
          <div key={index} className="group/row relative flex h-7 items-center gap-2">
            {index < rows.length - 1 && (
              <span
                aria-hidden
                className="absolute top-3.5 -bottom-3.5 left-[7.5px] w-px bg-muted-foreground/35"
              />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => patch(index, { state: NEXT_STATE[row.state] })}
                  aria-label={STATE_ACTION[row.state]}
                  className="relative flex size-4 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      "size-2.5 rounded-full transition-colors",
                      row.state === "done" && "bg-muted-foreground",
                      row.state === "now" && "bg-primary ring-4 ring-primary/20",
                      row.state === "next" && "border border-muted-foreground bg-card",
                    )}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>{STATE_ACTION[row.state]}</TooltipContent>
            </Tooltip>
            <input
              data-row={index}
              data-field="date"
              value={row.date}
              onChange={(event) => patch(index, { date: event.target.value })}
              onKeyDown={(event) => onKeyDown(event, index)}
              placeholder="Date"
              spellCheck={false}
              className="custom-block-input w-24 shrink-0 font-mono text-xs text-muted-foreground tabular-nums"
            />
            <input
              data-row={index}
              data-field="label"
              value={row.label}
              onChange={(event) => patch(index, { label: event.target.value })}
              onKeyDown={(event) => onKeyDown(event, index)}
              placeholder="Event"
              className={cn(
                "custom-block-input min-w-0 flex-1",
                row.state === "now" && "font-medium",
                row.state === "next" && "text-muted-foreground",
              )}
            />
            <RemoveRowButton label="Remove Event" onClick={() => remove(index)} />
          </div>
        ))}
      </div>
    </CustomBlockFrame>
  );
}
