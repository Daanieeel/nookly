import { MinusIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@nookly/ui/lib/utils";

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** How far the minus and plus buttons move the value; defaults to `step`. */
  increments?: number;
  "aria-label"?: string;
  className?: string;
  /** `sm` is a compact control for inside a line of text or a card. */
  size?: "default" | "sm";
}

/** A stepper control styled like a `Button` `variant="secondary"` (same border/background),
 * split into a decrement button, a centered (and directly editable — click in and type) value,
 * and an increment button. */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  increments = step,
  "aria-label": ariaLabel,
  className,
  size = "default",
}: NumberInputProps) {
  const small = size === "sm";
  // What is being typed, kept while the field has focus so a number on its way to a
  // valid one (a "4" on the way to "45", below a minimum of 5) isn't snapped back.
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (next: number) => {
    let clamped = next;
    if (min !== undefined) clamped = Math.max(min, clamped);
    if (max !== undefined) clamped = Math.min(max, clamped);
    return clamped;
  };
  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;

  return (
    <div
      className={cn(
        "inline-flex items-stretch overflow-hidden rounded-md border border-input bg-accent text-xs",
        small ? "h-6" : "h-8",
        className,
      )}
    >
      <button
        type="button"
        disabled={atMin}
        aria-label={ariaLabel ? `Decrease ${ariaLabel}` : "Decrease"}
        onClick={() => {
          setDraft(null);
          onChange(clamp(value - increments));
        }}
        className={cn(
          "flex shrink-0 items-center justify-center text-muted-foreground hover:bg-accent/80 hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
          small ? "w-5" : "w-8",
        )}
      >
        <MinusIcon className={small ? "size-3" : "size-3.5"} />
      </button>
      <input
        type="number"
        aria-label={ariaLabel}
        value={draft ?? value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setDraft(e.target.value);
          const next = Number(e.target.value);
          if (!Number.isNaN(next)) onChange(clamp(next));
        }}
        onBlur={() => setDraft(null)}
        className={cn(
          "flex-1 border-x border-input bg-transparent text-center tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          small ? "w-8 min-w-6 px-1" : "min-w-8 px-2",
        )}
      />
      <button
        type="button"
        disabled={atMax}
        aria-label={ariaLabel ? `Increase ${ariaLabel}` : "Increase"}
        onClick={() => {
          setDraft(null);
          onChange(clamp(value + increments));
        }}
        className={cn(
          "flex shrink-0 items-center justify-center text-muted-foreground hover:bg-accent/80 hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
          small ? "w-5" : "w-8",
        )}
      >
        <PlusIcon className={small ? "size-3" : "size-3.5"} />
      </button>
    </div>
  );
}
