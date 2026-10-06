import type { ReactNode } from "react";
import { cn } from "@nookly/ui/lib/utils";
import { DueDatePicker, DueLabel, PROPERTY_PILL, PendingIcon } from "./task-properties";

/// The due date pill on a card, which opens the date picker. While a change saves or
/// after it failed it shows `pendingLabel` next to a spinner or warning instead of the day.
export function DuePill({
  value,
  tone,
  pendingLabel,
  pending,
  failed,
  onSelect,
  renderPicker,
}: {
  value: string | null;
  tone: Parameters<typeof DueLabel>[0]["tone"];
  pendingLabel: string;
  pending: boolean;
  failed: boolean;
  onSelect?: (day: string | null) => void;
  /// Wraps the pill in a different picker than the date one, e.g. an assignment's.
  renderPicker?: (trigger: ReactNode) => ReactNode;
}) {
  const trigger = (
    <button
      type="button"
      aria-label={failed ? "Couldn't set due date, try again" : "Change Due Date"}
      className={cn(PROPERTY_PILL, "relative", failed && "border-destructive/60")}
    >
      {pending || failed ? (
        <>
          <PendingIcon pending={pending} failed={failed} idle={null} />
          {pendingLabel}
        </>
      ) : (
        value && <DueLabel day={value} tone={tone} />
      )}
    </button>
  );
  return (
    renderPicker?.(trigger) ?? (
      <DueDatePicker value={value} onSelect={(day) => onSelect?.(day)}>
        {trigger}
      </DueDatePicker>
    )
  );
}
