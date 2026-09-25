import { IconCheck, IconListCheck } from "@tabler/icons-react";
import type { ReactNodeViewProps } from "@tiptap/react";
import type { KeyboardEvent } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { asString, type JSONAttrValue } from "./block-markdown";
import { CustomBlockFrame, RemoveRowButton, useRowKeyboard } from "./CustomBlockFrame";
import { parseCells, serializeCells } from "./custom-block-rows";

/// A numbered procedure with the step you're on marked. Steps before it read as
/// done; clicking a number moves the marker there, clicking the current one
/// finishes it.
export function StepsBlock(props: ReactNodeViewProps) {
  const { node, updateAttributes } = props;
  // SAFETY: the steps node only ever writes `rows` as a string.
  const steps = parseCells(asString(node.attrs.rows as JSONAttrValue | undefined) ?? "", 2);
  // SAFETY: the steps node only ever writes `current` as a string or null; it's the
  // 1 based number of the step you're on, unset before starting.
  const currentAttr = asString(node.attrs.current as JSONAttrValue | undefined);
  const current = currentAttr ? Number(currentAttr) : null;
  const { containerRef, focus, onArrow, removeBlock } = useRowKeyboard(props);

  const save = (next: string[][], nextCurrent: number | null = current) =>
    updateAttributes({
      rows: serializeCells(next),
      current: nextCurrent === null ? null : String(nextCurrent),
    });
  const patch = (index: number, cell: number, text: string) =>
    save(
      steps.map((step, i) => (i === index ? step.map((c, j) => (j === cell ? text : c)) : step)),
    );
  const insertAfter = (index: number) => {
    const next = [...steps];
    next.splice(index + 1, 0, ["", ""]);
    save(next, current !== null && current > index + 1 ? current + 1 : current);
    focus(index + 1, "title");
  };
  const remove = (index: number) => {
    if (steps.length === 1) return removeBlock();
    save(
      steps.filter((_, i) => i !== index),
      current !== null && current > index + 1 ? current - 1 : current,
    );
    focus(Math.max(0, index - 1), "title");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    const field = event.currentTarget.dataset.field;
    const empty = event.currentTarget.value === "";
    if (field === "title" && onArrow(event, index, steps.length)) return;
    if (field === "detail" && event.key === "ArrowUp") {
      event.preventDefault();
      focus(index, "title");
    } else if (field === "detail" && event.key === "ArrowDown") {
      event.preventDefault();
      if (index < steps.length - 1) focus(index + 1, "title");
    } else if (event.key === "Enter") {
      event.preventDefault();
      insertAfter(index);
    } else if (event.key === "Backspace" && empty) {
      event.preventDefault();
      if (field === "detail") focus(index, "title");
      else if (!steps[index][1]) remove(index);
    }
  };

  return (
    <CustomBlockFrame
      {...props}
      icon={<IconListCheck />}
      titlePlaceholder="Steps"
      addLabel="Add step"
      onAdd={() => insertAfter(steps.length - 1)}
    >
      <div ref={containerRef}>
        {steps.map(([title, detail], index) => {
          const number = index + 1;
          const done = current !== null && number < current;
          const active = number === current;
          const action = active ? "Mark as Done" : "Mark as Current";
          return (
            <div key={index} className="group/row relative flex gap-2.5 py-1">
              {index < steps.length - 1 && (
                <span
                  aria-hidden
                  className="absolute top-7 -bottom-1 left-2.5 w-px bg-muted-foreground/35"
                />
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => save(steps, active ? number + 1 : number)}
                    aria-label={`${action}: step ${number}`}
                    className={cn(
                      "relative flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-xs tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      done && "bg-muted-foreground/20 text-muted-foreground",
                      active && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                      !done &&
                        !active &&
                        "border border-muted-foreground/50 bg-card text-muted-foreground",
                    )}
                  >
                    {done ? <IconCheck className="size-3" /> : number}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{action}</TooltipContent>
              </Tooltip>
              <div className="flex min-w-0 flex-1 flex-col">
                <input
                  data-row={index}
                  data-field="title"
                  value={title}
                  onChange={(event) => patch(index, 0, event.target.value)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                  placeholder="Step"
                  className={cn(
                    "custom-block-input h-5 font-medium",
                    done && "text-muted-foreground",
                  )}
                />
                <input
                  data-row={index}
                  data-field="detail"
                  value={detail}
                  onChange={(event) => patch(index, 1, event.target.value)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                  placeholder="Add detail"
                  className={cn(
                    "custom-block-input h-5 text-xs text-muted-foreground",
                    !detail && "hidden group-focus-within/row:block",
                  )}
                />
              </div>
              <RemoveRowButton label="Remove Step" onClick={() => remove(index)} />
            </div>
          );
        })}
      </div>
    </CustomBlockFrame>
  );
}
