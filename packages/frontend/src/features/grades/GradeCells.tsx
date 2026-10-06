import { useEffect, useState } from "react";
import { cn } from "@nookly/ui/lib/utils";
import { PendingIcon } from "#/features/tasks/task-properties.tsx";

/// A plain number as typed: digits with an optional decimal point or comma.
const NUMBER = /^\d+([.,]\d+)?$/;

/// `null` for an empty field, `undefined` for what isn't a number in range.
function parse(text: string, max: number): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!NUMBER.test(trimmed)) return undefined;
  const value = Number(trimmed.replace(",", "."));
  return value <= max ? value : undefined;
}

/// A number typed straight into a report row, saved when the field is left or Enter is
/// pressed. Empty clears it; anything that isn't a number in range is marked and not saved.
/// It reads as plain text until hovered or focused, so the grades stay in front; `Input`
/// has no such quiet look, hence the plain field.
export function NumberCell({
  label,
  value,
  placeholder,
  max = Number.POSITIVE_INFINITY,
  suffix,
  onSave,
  pending,
  failed,
  className,
}: {
  /// Names the field for screen readers, like "Grade for Final exam".
  label: string;
  value: number | null;
  placeholder: string;
  max?: number;
  suffix?: string;
  onSave: (next: number | null) => void;
  pending: boolean;
  failed: boolean;
  className?: string;
}) {
  const shown = value === null ? "" : String(value);
  const [draft, setDraft] = useState(shown);
  const [invalid, setInvalid] = useState(false);
  // A saved or refetched value replaces what was typed.
  useEffect(() => setDraft(shown), [shown]);

  function commit() {
    const next = parse(draft, max);
    if (next === undefined) return setInvalid(true);
    if (next !== value) onSave(next);
  }

  return (
    <span
      data-invalid={invalid || failed ? "true" : undefined}
      className={cn(
        "flex items-center gap-1 data-[invalid=true]:[&_input]:border-destructive",
        className,
      )}
    >
      <input
        value={draft}
        placeholder={placeholder}
        inputMode="decimal"
        aria-label={label}
        aria-invalid={invalid || failed || undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        autoComplete="off"
        className="h-7 w-14 min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-right text-sm tabular-nums transition-colors outline-none placeholder:text-muted-foreground hover:border-input hover:bg-accent/60 focus-visible:border-input focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      <span className="flex size-3.5 shrink-0 items-center">
        <PendingIcon pending={pending} failed={failed} idle={null} />
      </span>
    </span>
  );
}
