import { IconX } from "@tabler/icons-react";
import { useDebouncer } from "@tanstack/react-pacer";
import { type ReactNode, useEffect, useState } from "react";
import { StatusIcon } from "#/components/action-feedback.tsx";
import { TimeInput } from "#/components/time-input.tsx";
import { useInPlaceInput } from "#/components/use-in-place-input.ts";
import { PROPERTY_VALUE } from "#/components/property-row.tsx";
import { NumberInput } from "@nookly/ui/components/number-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";

interface SaveState {
  pending: boolean;
  failed: boolean;
}

/// A spinner while a save runs longer than a moment, a warning after a failed
/// save, nothing otherwise. Quick local saves never flash the spinner.
function SaveIcon({ pending, failed }: SaveState) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) return setSlow(false);
    const timer = setTimeout(() => setSlow(true), 300);
    return () => clearTimeout(timer);
  }, [pending]);
  return (
    <StatusIcon status={pending && slow ? "pending" : failed ? "error" : "idle"} idle={null} />
  );
}

/// A property that is either unset, offering `addLabel`, or set, showing the editor
/// `renderEditor` draws next to a × that clears it. Saved a moment after the last change.
function OptionalProperty<T>({
  value,
  onSave,
  addLabel,
  clearLabel,
  startAt,
  pending,
  failed,
  renderEditor,
}: SaveState & {
  value: T | null;
  onSave: (next: T | null) => void;
  addLabel: string;
  clearLabel: string;
  startAt: T;
  renderEditor: (draft: T, change: (next: T | null) => void) => ReactNode;
}) {
  const [draft, setDraft] = useState<T | null>(value);
  // Unmounting flushes a pending save instead of dropping the last edit.
  const saver = useDebouncer(
    (next: T | null) => {
      if (next !== value) onSave(next);
    },
    { wait: 500, onUnmount: (debouncer) => debouncer.flush() },
  );

  function change(next: T | null) {
    setDraft(next);
    saver.maybeExecute(next);
  }

  if (draft === null) {
    return (
      <div className="relative flex items-center">
        <button type="button" onClick={() => change(startAt)} className={PROPERTY_VALUE}>
          <span className="text-muted-foreground">{addLabel}</span>
        </button>
        <span className="pointer-events-none absolute right-2">
          <SaveIcon pending={pending} failed={failed} />
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 px-1">
      {renderEditor(draft, change)}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={failed ? "Couldn't save, try again" : clearLabel}
            onClick={() => change(null)}
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <IconX size={12} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{clearLabel}</TooltipContent>
      </Tooltip>
      <span className="flex size-3.5 shrink-0 items-center">
        <SaveIcon pending={pending} failed={failed} />
      </span>
    </div>
  );
}

/// A number property as a stepper, saved a moment after the last change. Unset,
/// it offers `addLabel`; the × clears it again. `unit` shows after the stepper.
export function NumberProperty({
  startAt = 1,
  step = 1,
  min,
  max,
  unit,
  ...rest
}: SaveState & {
  value: number | null;
  onSave: (next: number | null) => void;
  addLabel: string;
  /// Names the × button, like "Remove Grade".
  clearLabel: string;
  /// The value "Add" starts from.
  startAt?: number;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
}) {
  return (
    <OptionalProperty
      {...rest}
      startAt={startAt}
      renderEditor={(draft, change) => (
        <>
          <NumberInput
            value={draft}
            onChange={change}
            step={step}
            min={min}
            max={max}
            className="h-7 w-28 shrink-0"
          />
          {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        </>
      )}
    />
  );
}

/// A clock time property (`HH:mm`), saved a moment after the last change. Unset, it
/// offers `addLabel`; the × clears it again.
export function TimeProperty({
  startAt = "09:00",
  ...rest
}: SaveState & {
  value: string | null;
  onSave: (next: string | null) => void;
  addLabel: string;
  /// Names the × button, like "Remove Time".
  clearLabel: string;
  /// The time "Add" starts from.
  startAt?: string;
}) {
  return (
    <OptionalProperty
      {...rest}
      startAt={startAt}
      renderEditor={(draft, change) => (
        <TimeInput value={draft} onChange={change} aria-label="Exam time" className="h-7" />
      )}
    />
  );
}

/// A short text property edited in place, saved on blur or Enter; Escape
/// restores the saved value. Emptying it clears the property.
export function TextProperty({
  value,
  onSave,
  placeholder,
  label,
  pending,
  failed,
}: SaveState & {
  value: string | null;
  onSave: (next: string | null) => void;
  placeholder: string;
  label: string;
}) {
  const input = useInPlaceInput({
    value: value ?? "",
    commit: (draft) => {
      const next = draft.trim() || null;
      if (next !== value) onSave(next);
    },
  });

  return (
    <div className="relative flex items-center">
      <input
        {...input}
        placeholder={placeholder}
        aria-label={failed ? `Couldn't save ${label}, try again` : label}
        aria-invalid={failed || undefined}
        className={cn(
          PROPERTY_VALUE,
          "cursor-text bg-transparent outline-none placeholder:text-muted-foreground focus-visible:bg-accent",
          failed && "text-destructive",
        )}
      />
      <span className="pointer-events-none absolute right-2">
        <SaveIcon pending={pending} failed={failed} />
      </span>
    </div>
  );
}
