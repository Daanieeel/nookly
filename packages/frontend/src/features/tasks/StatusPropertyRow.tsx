import { PROPERTY_VALUE, PropertyRow } from "#/components/property-row.tsx";
import type { TaskStatus } from "#/lib/api/types.ts";
import type { StatusKind } from "./task-model";
import { PendingIcon, StatusPicker, TaskStatusIcon } from "./task-properties";

/// The "Status" row of a properties panel: the status picker on a button that shows
/// its own spinner or warning while a change saves or after it failed.
export function StatusPropertyRow({
  statuses,
  kindOf,
  value,
  status,
  onSelect,
  pending,
  failed,
}: {
  statuses: TaskStatus[];
  kindOf: (statusId: string) => StatusKind;
  value: string;
  /// The current status, when it still exists.
  status: TaskStatus | undefined;
  onSelect: (statusId: string) => void;
  pending: boolean;
  failed: boolean;
}) {
  return (
    <PropertyRow label="Status">
      <StatusPicker statuses={statuses} kindOf={kindOf} value={value} onSelect={onSelect}>
        <button
          type="button"
          aria-label={failed ? "Couldn't change status, try again" : "Change Status"}
          className={PROPERTY_VALUE}
        >
          <PendingIcon
            pending={pending}
            failed={failed}
            idle={status && <TaskStatusIcon status={status} kind={kindOf(status.id)} />}
          />
          <span className="truncate">{status?.name ?? "No status"}</span>
        </button>
      </StatusPicker>
    </PropertyRow>
  );
}
