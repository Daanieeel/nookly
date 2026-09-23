import { FieldError, StatusIcon } from "@/components/action-feedback";

/// The status line under a picker opened from a context menu: the picker stays
/// open while its pick is saved, and says so if saving failed.
export function PickerFeedback({
  pending,
  pendingLabel,
  errorLabel,
}: {
  pending: boolean;
  pendingLabel: string;
  errorLabel: string | null;
}) {
  if (pending) {
    return (
      <p className="flex items-center gap-1.5 border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <StatusIcon status="pending" idle={null} size={12} />
        {pendingLabel}
      </p>
    );
  }
  if (!errorLabel) return null;
  return (
    <div className="border-t border-border px-3 py-2">
      <FieldError message={errorLabel} />
    </div>
  );
}
