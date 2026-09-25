import { IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { StatusIcon } from "#/components/action-feedback.tsx";
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

/// A number property as a stepper, saved a moment after the last change. Unset,
/// it offers `addLabel`; the × clears it again. `unit` shows after the stepper.
export function NumberProperty({
  value,
  onSave,
  addLabel,
  clearLabel,
  startAt = 1,
  step = 1,
  min,
  max,
  unit,
  pending,
  failed,
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
  const [draft, setDraft] = useState<number | null>(value);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => saveRef.current(draft), 500);
    return () => clearTimeout(timer);
  }, [draft, value]);

  if (draft === null) {
    return (
      <div className="relative flex items-center">
        <button type="button" onClick={() => setDraft(startAt)} className={PROPERTY_VALUE}>
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
      <NumberInput
        value={draft}
        onChange={setDraft}
        step={step}
        min={min}
        max={max}
        className="h-7 w-28 shrink-0"
      />
      {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={failed ? "Couldn't save, try again" : clearLabel}
            onClick={() => setDraft(null)}
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
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);

  function save() {
    const next = draft.trim() || null;
    if (next !== value) onSave(next);
  }

  return (
    <div className="relative flex items-center">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            const input = e.currentTarget;
            setDraft(value ?? "");
            // After the reset renders, so the blur saves nothing.
            requestAnimationFrame(() => input.blur());
          }
        }}
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
