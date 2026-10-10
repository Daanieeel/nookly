import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconCheck,
  IconInfoCircle,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { EntityIcon } from "#/components/entity-icon.tsx";
import type { Entity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { useNavStore } from "#/lib/store/nav.ts";

type Kind = "success" | "error" | "warning" | "info";

/// A toast carries at most one action: the item it is about, as a link that opens it, or
/// a button such as Undo. Anything more needs a dialog, since the toast goes away.
export type NotifyOptions = {
  /// A second, smaller line under the message. Say what to do next after an error.
  description?: string;
} & (
  | { entity?: Entity; action?: undefined }
  | { entity?: undefined; action?: { label: string; onClick: () => void } }
);

/// How long a toast that is not an error stays. It pauses while the pointer is on it.
const DURATION_MS = 5000;

const ICONS = {
  success: <IconCheck size={16} className="mt-0.5 shrink-0 text-positive" />,
  error: <IconAlertTriangle size={16} className="mt-0.5 shrink-0 text-destructive" />,
  warning: <IconAlertTriangle size={16} className="mt-0.5 shrink-0 text-muted-foreground" />,
  info: <IconInfoCircle size={16} className="mt-0.5 shrink-0 text-muted-foreground" />,
} satisfies Record<Kind, ReactNode>;

/// Every toast of the app goes through here. See docs/development/toasts.md. Sonner's own icon column is never used (the
/// toast is a plain Sonner toast, which draws no icon): the icon is part of the content,
/// on the message's line, so an item or a description below can use the full width.
function show(kind: Kind, message: string, { description, entity, action }: NotifyOptions = {}) {
  const title = entity ? displayTitle(entity) : "";
  const id = toast(
    <div role={kind === "error" ? "alert" : "status"} className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-start gap-2">
        {ICONS[kind]}
        {message}
      </span>
      {description && <span className="pl-6 text-xs text-muted-foreground">{description}</span>}
      {entity && (
        <button
          type="button"
          aria-label={`Open ${title}`}
          title={title}
          className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-accent/40 px-2 py-1 text-left text-xs font-medium hover:bg-accent"
          onClick={() => {
            useNavStore.getState().openEntity(entity.id, entity.spaceId);
            toast.dismiss(id);
          }}
        >
          <EntityIcon entity={entity} size={14} />
          <span className="min-w-0 flex-1 truncate">{title}</span>
          <IconArrowUpRight size={14} className="shrink-0 text-muted-foreground" />
        </button>
      )}
    </div>,
    // A failure that vanishes is worse than none, so an error stays until it is closed.
    { action, duration: kind === "error" ? Number.POSITIVE_INFINITY : DURATION_MS },
  );
  return id;
}

/// The one way to show a toast. Each call returns the toast's id for `notify.dismiss`.
export const notify = {
  success: (message: string, options?: NotifyOptions) => show("success", message, options),
  error: (message: string, options?: NotifyOptions) => show("error", message, options),
  warning: (message: string, options?: NotifyOptions) => show("warning", message, options),
  info: (message: string, options?: NotifyOptions) => show("info", message, options),
  /// One toast, or every toast when no id is given.
  dismiss: (id?: string | number) => void toast.dismiss(id),
};
